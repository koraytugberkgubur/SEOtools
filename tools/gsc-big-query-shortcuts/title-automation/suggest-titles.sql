-- =====================================================================
-- suggest-titles.sql — Title suggestions straight out of BigQuery.
--
-- Replace PROJECT.DATASET throughout, then run this file once to create
-- two UDFs and one table function. After that, a suggestion run is:
--
--   SELECT * FROM `PROJECT.DATASET.suggest_titles`(DATE '2026-09-21')
--   WHERE status = 'PROPOSE_TEST'
--   ORDER BY cur_impressions DESC;
--
-- Rules mirror title-automation/decide_titles.py v1.0.0, with the
-- classifier corrections derived from the Sept 2026 US keyword corpus
-- (77,882 unique keywords / 25.9M volume). See TITLE-QUERY-EVIDENCE.md.
--
-- Reads only. Writes nothing, publishes nothing.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Query classifier
--
-- Buckets: anonymous | special | unscramble | words | both | other
-- Order matters: 'special' is tested before the two intent patterns so
-- that game and dictionary phrasings cannot leak into them.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION `PROJECT.DATASET.title_classify_query`(
  query STRING, word STRING
) RETURNS STRING AS ((
  WITH norm AS (
    SELECT
      TRIM(REGEXP_REPLACE(LOWER(IFNULL(query, '')), r'[^a-z0-9]+', ' ')) AS q,
      LOWER(word) AS w
  ),
  flags AS (
    SELECT
      q, w,
      -- exact surface form: the page's word must appear as its own token
      STRPOS(CONCAT(' ', q, ' '), CONCAT(' ', w, ' ')) > 0 AS has_word,
      REGEXP_CONTAINS(q, r'\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) letter\b')
        OR REGEXP_CONTAINS(q, r'\b(?:starts? with|ends? with|meaning|definition|define|origin|synonym|antonym|opposite|rhym\w*)\b')
        -- game brands. 'words with friends' MUST be caught here: it also
        -- matches the words-from pattern below (90.5k US volume on the
        -- head term alone), so testing it later would misfile it.
        OR REGEXP_CONTAINS(q, r'\b(?:scrabble|wordle|crossword|jumble|words with friends|wwf)\b')
        AS is_special,
      REGEXP_CONTAINS(q, r'\bunscrambl(?:e|er|ing|ed)\b') AS uns,
      -- 'words of X' is deliberately absent: in the corpus it is
      -- affirmation / encouragement / wisdom / mouth / god, not letters.
      REGEXP_CONTAINS(q, r'\bwords? (?:from|with|using|out of|made (?:from|with|of))\b')
        OR REGEXP_CONTAINS(q, r'\b(?:make|making|create) words?\b')
        AS wfr
    FROM norm
  )
  SELECT
    CASE
      WHEN q = ''          THEN 'anonymous'
      WHEN NOT has_word    THEN 'other'
      WHEN is_special      THEN 'special'
      WHEN uns AND wfr     THEN 'both'
      WHEN uns             THEN 'unscramble'
      WHEN wfr             THEN 'words'
      ELSE 'other'
    END
  FROM flags
));


-- ---------------------------------------------------------------------
-- 2. Title builder
--
-- T2 is the only template without a number, so it is the only one that
-- can be issued without a verified word count.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION `PROJECT.DATASET.title_build`(
  template STRING, word STRING, n INT64
) RETURNS STRING AS ((
  WITH parts AS (
    SELECT
      UPPER(word) AS d,
      CONCAT(CAST(n AS STRING), IF(n = 1, ' Word', ' Words')) AS c
  )
  SELECT CASE template
    WHEN 'T1' THEN CONCAT('Unscramble ', d, ': ', c, ' from ', d)
    WHEN 'T2' THEN CONCAT('Unscramble ', d)
    WHEN 'T3' THEN CONCAT(c, ' from ', d, ': Unscramble ', d)
    WHEN 'T4' THEN CONCAT(c, ' from ', d)
  END
  FROM parts
));


-- ---------------------------------------------------------------------
-- 3. suggest_titles(end_date)
--
-- Needs a page inventory table with one row per canonical URL:
--   url STRING, word STRING, current_title STRING, word_count INT64,
--   count_verified BOOL, eligible BOOL, last_changed DATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE TABLE FUNCTION `PROJECT.DATASET.suggest_titles`(end_date DATE)
AS (
WITH
-- 56 complete days: two adjacent 28-day windows.
evidence AS (
  SELECT
    data_date, url, country, device,
    IF(is_anonymized_query OR query IS NULL OR TRIM(query) = '', '', query) AS query,
    impressions, clicks, sum_position,
    IF(data_date > DATE_SUB(end_date, INTERVAL 27 DAY), 'current', 'previous') AS win
  FROM `PROJECT.DATASET.searchdata_url_impression`
  WHERE data_date BETWEEN DATE_SUB(end_date, INTERVAL 55 DAY) AND end_date
    AND LOWER(search_type) = 'web'
    AND REGEXP_CONTAINS(url, r'^https?://[^/]+/anagram/[A-Za-z]+/?$')
),

pages AS (
  SELECT
    url, LOWER(word) AS word, current_title, word_count,
    count_verified, eligible, last_changed
  FROM `PROJECT.DATASET.page_inventory`
),

labelled AS (
  SELECT
    e.url, e.win, e.country, e.device, e.data_date, e.impressions,
    e.clicks, e.sum_position,
    `PROJECT.DATASET.title_classify_query`(e.query, p.word) AS bucket
  FROM evidence e
  JOIN pages p USING (url)
),

-- One evidence roll-up, reused for whole windows and for each segment.
-- grain: 'page' = the whole window; 'device'/'country' = one segment.
rolled AS (
  SELECT url, win, 'page' AS grain, CAST(NULL AS STRING) AS segment,
         impressions, clicks, sum_position, data_date, bucket
  FROM labelled
  UNION ALL
  SELECT url, win, 'device', device, impressions, clicks, sum_position, data_date, bucket
  FROM labelled WHERE win = 'current'
  UNION ALL
  SELECT url, win, 'country', country, impressions, clicks, sum_position, data_date, bucket
  FROM labelled WHERE win = 'current'
),

shares AS (
  SELECT
    url, win, grain, segment,
    SUM(impressions) AS total,
    SUM(clicks) AS clicks,
    SAFE_DIVIDE(SUM(sum_position), SUM(impressions)) + 1 AS avg_position,
    COUNT(DISTINCT IF(impressions > 0, data_date, NULL)) AS days,
    SUM(IF(bucket = 'anonymous', 0, impressions)) AS named,
    SUM(IF(bucket IN ('unscramble', 'words', 'both'), impressions, 0)) AS direct,
    SUM(IF(bucket = 'unscramble', impressions, 0))
      + 0.5 * SUM(IF(bucket = 'both', impressions, 0)) AS u_imp,
    SUM(IF(bucket = 'words', impressions, 0))
      + 0.5 * SUM(IF(bucket = 'both', impressions, 0)) AS w_imp
  FROM rolled
  GROUP BY url, win, grain, segment
),

scored AS (
  SELECT
    *,
    SAFE_DIVIDE(named, total)  AS coverage,
    SAFE_DIVIDE(direct, named) AS classified,
    SAFE_DIVIDE(u_imp, direct) AS u,
    SAFE_DIVIDE(w_imp, direct) AS w
  FROM shares
),

-- The same gate as candidate() in decide_titles.py.
candidates AS (
  SELECT
    *,
    CASE
      WHEN named < 500 OR days < 14              THEN NULL
      WHEN coverage < 0.70 OR classified < 0.70  THEN NULL
      WHEN u >= 0.85 THEN 'T2'
      WHEN u >= 0.60 THEN 'T1'
      WHEN w >= 0.85 THEN 'T4'
      WHEN w >= 0.60 THEN 'T3'
      ELSE NULL
    END AS template,
    CASE
      WHEN named < 500 OR days < 14              THEN 'insufficient_evidence'
      WHEN coverage < 0.70 OR classified < 0.70  THEN 'insufficient_query_coverage'
      WHEN u >= 0.85 THEN 'strong_unscramble'
      WHEN u >= 0.60 THEN 'mixed_unscramble_leading'
      WHEN w >= 0.85 THEN 'strong_words_from'
      WHEN w >= 0.60 THEN 'mixed_words_from_leading'
      ELSE 'mixed_intent_no_clear_leader'
    END AS reason
  FROM scored
),

cur  AS (SELECT * FROM candidates WHERE grain = 'page' AND win = 'current'),
prev AS (SELECT * FROM candidates WHERE grain = 'page' AND win = 'previous'),

-- A segment only conflicts if it independently clears every gate.
conflict AS (
  SELECT
    c.url,
    MIN(CONCAT('segment_conflict:', c.grain, ':', c.segment)) AS note
  FROM candidates c
  JOIN cur ON cur.url = c.url
  WHERE c.grain IN ('device', 'country')
    AND c.template IS NOT NULL
    AND cur.template IS NOT NULL
    AND c.template != cur.template
  GROUP BY c.url
),

decided AS (
  SELECT
    p.url, p.word, p.current_title,
    cur.template AS candidate_template,
    cur.reason   AS candidate_reason,
    prev.template AS prev_template,
    prev.reason   AS prev_reason,
    conflict.note AS conflict_note,
    cur.total AS cur_impressions, cur.named AS cur_named, cur.days AS cur_days,
    cur.coverage, cur.classified, cur.u AS unscramble_share, cur.w AS words_from_share,
    cur.clicks AS cur_clicks, cur.avg_position,
    p.word_count, p.count_verified, p.eligible, p.last_changed,
    CASE
      WHEN NOT REGEXP_CONTAINS(p.word, r'^[a-z]+$') THEN 'unsupported_word'
      WHEN NOT REGEXP_CONTAINS(
             p.url, CONCAT(r'(?i)^https?://[^/]+/anagram/', p.word, r'/?$'))
                                                    THEN 'url_word_mismatch'
      WHEN NOT p.eligible                           THEN 'page_not_eligible'
      WHEN p.last_changed IS NOT NULL
           AND DATE_DIFF(end_date, p.last_changed, DAY) < 56
                                                    THEN 'title_change_cooldown'
      WHEN cur.template IS NULL                     THEN cur.reason
      WHEN prev.template IS NULL                    THEN CONCAT('unstable_across_windows:', prev.reason)
      WHEN prev.template != cur.template            THEN CONCAT('unstable_across_windows:', prev.template)
      WHEN conflict.note IS NOT NULL                THEN conflict.note
      WHEN cur.template != 'T2'
           AND (p.word_count IS NULL OR p.word_count <= 0 OR NOT p.count_verified)
                                                    THEN 'verified_word_count_required'
      ELSE NULL
    END AS blocked_by
  FROM pages p
  LEFT JOIN cur      ON cur.url      = p.url
  LEFT JOIN prev     ON prev.url     = p.url
  LEFT JOIN conflict ON conflict.url = p.url
)

SELECT
  url,
  word,
  current_title,
  COALESCE(
    IF(blocked_by IS NULL,
       `PROJECT.DATASET.title_build`(candidate_template, word, word_count),
       NULL),
    current_title
  ) AS proposed_title,
  IF(blocked_by IS NULL, candidate_template, NULL) AS template,
  CASE
    WHEN blocked_by IS NOT NULL THEN 'HOLD'
    WHEN `PROJECT.DATASET.title_build`(candidate_template, word, word_count)
         = current_title THEN 'UNCHANGED'
    ELSE 'PROPOSE_TEST'
  END AS status,
  COALESCE(blocked_by, candidate_reason) AS reason,
  '1.0.0-sql' AS rule_version,
  end_date,
  cur_impressions, cur_named, cur_days, cur_clicks,
  ROUND(coverage, 4)         AS coverage,
  ROUND(classified, 4)       AS classified,
  ROUND(unscramble_share, 4) AS unscramble_share,
  ROUND(words_from_share, 4) AS words_from_share,
  ROUND(avg_position, 2)     AS avg_position,
  candidate_template, prev_template
FROM decided
);
