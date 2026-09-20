# SOP: Select unscramble page title tags from BigQuery query evidence

Owner: SEO lead. Operator: analytics engineer. Publisher: website engineer.
Version: 1.0.0 · Prepared 7 September 2026.

## Purpose and current status

Choose a title **per canonical word page**, using its observed search-query distribution. Generate an auditable recommendation; validate the resulting title treatment through a controlled test before adopting it broadly.

This SOP is grounded in [KTG1/gsc-big-query-shortcuts](https://github.com/KTG1/gsc-big-query-shortcuts), inspected at commit `b762dee7a68e58a76a4e982bbcfacc7c71acd718`. The repository uses the GSC URL impression export, `/anagram/[word]` pages, and dictionary/non-dictionary groups. Its existing CTR and cannibalization reports support prioritization and diagnosis.

**No live query results were available for this version.** The dashboard was disconnected with a blank project ID. The rules below are explicit initial policy assumptions, not thresholds fitted to this site's data. The repository includes SQL templates, not a saved performance dataset. Its catalog generator references a historical project identifier; that is not proof of an active dataset or access.

Deliverables here: extraction SQL, a working local recommendation script, tests, and this operating procedure. Cloud scheduling, CMS publication, title history, and experiment measurement are integration work described below; they are not deployed by this package.

## 1. Define the four variants

`[WORD]` means the actual letters/word on the landing page. `N` means its exact number of unique valid results under the page's default dictionary and filters. It does not mean search volume, impressions, or the number of distinct GSC queries. The user's example `50` is a placeholder, not a required minimum.

| ID | Title | Initial query evidence favoring a test |
|---|---|---|
| T1 | `Unscramble [WORD]: N Words from [WORD]` | Unscramble intent leads, with material words-from demand |
| T2 | `Unscramble [WORD]` | Strongly concentrated unscramble intent |
| T3 | `N Words from [WORD]: Unscramble [WORD]` | Words-from intent leads, with material unscramble demand |
| T4 | `N Words from [WORD]` | Strongly concentrated words-from intent |

For example, if the engine truly returns 12 results for LOVE, T1 is `Unscramble LOVE: 12 Words from LOVE`. This is illustrative, not a verified count. For one result, use `1 Word`. Do not use the literal identical title `Unscramble Word` on every page.

One URL receives one stable title for all visitors and crawlers. Do not vary it by an incoming search query, geography, device, or user agent. Device/country evidence diagnoses conflicting demand; it does not authorize multiple titles for one canonical URL.

## 2. Prepare and validate inputs

Use `searchdata_url_impression`, not `searchdata_site_impression`, for URL-level decisions. Required fields: `data_date`, `url`, `query`, `country`, `device`, `search_type`, `is_anonymized_query`, `impressions`, `clicks`, `sum_position`.

1. Confirm the actual project, dataset, export location, and property. Verify the URL table schema before executing the SQL.
2. Use the export log to confirm successful URL-table exports for every date in the analysis window. Choose the latest complete day as `end_date`; never treat missing partitions as zero demand. If the latest complete day is over three days behind the run date, pause recommendations and investigate.
3. Extract WEB results only, for exactly 56 complete days: previous window `end_date−55` through `end_date−28`; current window `end_date−27` through `end_date`.
4. Retain anonymous/blank-query impressions in page totals, but never classify their intent. Aggregate export rows rather than assuming one row per query/date. Compute CTR as `SUM(clicks)/SUM(impressions)` and position as `SUM(sum_position)/SUM(impressions)+1`.
5. Match canonical URLs through an explicit page inventory. The supplied SQL supports ASCII-letter `/anagram/[word]` URLs only. Percent-encoded slugs, parameters, redirects, other paths, and non-English pages need a reviewed adapter. Do not silently merge URLs by sorting their letters.
6. Obtain a fresh inventory from the CMS/word engine: canonical URL, actual word, current title, dictionary version, dictionary/non-dictionary group, word count, count timestamp, last title change, page eligibility, and any active experiment.

The script's minimal inventory CSV uses these columns:

```text
url,word,current_title,word_count,count_verified,eligible,last_changed
```

Boolean values are `true` or `false`; `last_changed` is ISO date or blank for a confirmed never-changed page. `word_count` can be blank when unknown. Set `eligible=true` only after confirming a canonical, indexable, working page, correct visible results, fresh content/count verification, no conflicting experiment, and no unresolved URL ownership issue. A dictionary word classification is an analysis cohort, not evidence of count accuracy or search intent. Keep richer inventory metadata with each run even though the script consumes the minimal fields.

Google's [export query guidelines](https://support.google.com/webmasters/answer/12917174?hl=en) explain aggregation and anonymous queries; the [table reference](https://support.google.com/webmasters/answer/12917991?hl=en) defines the source fields.

## 3. Classify query intent against the page word

Normalize case, punctuation, and spacing. Preserve the actual query in the evidence export. Require the exact page word as a token before assigning direct intent. Do not assign unrelated queries just because they contain “unscramble.”

| Class | Example for LOVE | Treatment |
|---|---|---|
| Unscramble | `unscramble love`, `love unscrambler` | Unscramble evidence |
| Words-from | `words from love`, `words using love`, `make words love` | Words-from evidence |
| Both | `unscramble love words from love` | Half weight to each intent |
| Specialized | `3 letter words from love`, `love meaning`, `love scrabble` | Separate review, outside these generic templates |
| Other | `love`, `anagram love`, `unscramble live` | Keep visible; no automatic direct-intent assignment |
| Anonymous | Empty/anonymized query | Page totals only |

These are deliberately bounded English patterns. Before production, manually label top queries accounting for 90% of visible impressions plus a random tail sample across dictionary and non-dictionary pages. Review misclassifications such as word-game titles, phrase meanings, brands, and implicit puzzle intent. Version any pattern additions. Do not force unknown demand into the closest class.

## 4. Calculate evidence and choose a candidate

Calculate the following separately for each 28-day window, using **impressions**, including queries with zero clicks:

```text
visible = total impressions − anonymous impressions
direct = unscramble + words_from + both
visible_coverage = visible / total
direct_coverage = direct / visible
U = (unscramble + 0.5 × both) / direct
W = (words_from + 0.5 × both) / direct
```

U and W sum to 1 when direct evidence exists. These measure the site's observed query mix, not total market search demand and not the causal benefit of changing a title.

Apply the following in order:

| Condition | Decision |
|---|---|
| Ineligible page, unsupported URL/word, or title changed less than 56 days ago | HOLD current title |
| Either window has fewer than 500 visible impressions or fewer than 14 days with impressions | HOLD: insufficient evidence |
| Either window has visible coverage below 70% or direct coverage below 70% | HOLD: unknown demand too large |
| U ≥ 85% | Candidate T2 |
| 60% ≤ U < 85% | Candidate T1 |
| W ≥ 85% | Candidate T4 |
| 60% ≤ W < 85% | Candidate T3 |
| Neither side reaches 60% | HOLD: no clear leading intent |
| Previous and current windows select different candidates | HOLD: unstable demand |
| A sufficiently supported current device or country segment selects a different candidate under these same gates | HOLD: segment conflict |
| Candidate contains N, but its positive count is not verified | HOLD: obtain engine count |
| Candidate equals current title | UNCHANGED |
| All checks pass | PROPOSE_TEST with reason and supporting evidence |

All percentages, volume gates, and waiting periods above are configurable policy choices in this first version; they are not statistical confidence levels. Calibrate them against the site's query distribution and experiments. Do not describe passing a volume gate as proof of a winning title.

Illustrative stable mixes: U/W of 90/10 → T2; 70/30 → T1; 30/70 → T3; 10/90 → T4; 50/50 → HOLD. These examples assume all quality gates pass in both windows.

Low-volume and new pages retain their current title. A new page with no title may use an editorial default `Unscramble [WORD]`, logged as a default rather than a data-derived recommendation. Do not switch an existing low-data page merely to enforce that default.

## 5. Run the included recommendation package

1. Open `query-evidence.sql` in BigQuery. Replace `PROJECT.DATASET` with the verified source. Bind `end_date` (DATE), `country` (STRING), and `device` (STRING). Use empty strings for country/device to include all segments. Dry-run first and apply the team's maximum bytes-billed cap.
2. Export the **complete** result as `evidence.csv`, preserving the header and blank queries. Do not use a truncated UI preview. A restricted country/device run is diagnostic only; production selection uses all intended traffic segments.
3. Export the validated page inventory as `pages.csv`.
4. Run from the repository root:

```bash
python3 title-automation/decide_titles.py \
  --evidence /absolute/path/evidence.csv \
  --pages /absolute/path/pages.csv \
  --end-date 2026-09-04 \
  --output /absolute/path/recommendations-2026-09-04.jsonl
```

The date above is an example, not a verified export date. The script produces one record per inventory URL, including pages with no evidence. Each record contains current/proposed title, candidate ID, status, reason, rule version, analysis date, and metrics for both windows. It refuses to overwrite an existing output. Duplicate raw export rows are summed, consistent with GSC; do not concatenate the same extraction twice.

The SQL is standalone and is not inserted into `queries.js`: the current dashboard has no controls for these new date/segment parameters, and its catalog generator would overwrite manual catalog changes. No website title changes occur when this script runs.

## 6. Prioritize and test recommendations

Use the existing CTR-gap and query-loss reports to prioritize pages with substantial demand. Diagnose canonical/indexing problems and cannibalization before treating low CTR as a title problem. Retain raw clicks and impressions; use country, device, query intent, and position bands to diagnose composition effects.

The initial rules choose what to test. In particular, unscramble-heavy queries do not prove that removing the count improves performance. Test T2 against T1 in that cohort, and T4 against T3 in words-heavy cohorts. Test T1 versus T3 for mixed-intent cohorts when enough comparable pages exist.

1. Define dictionary status, word length, baseline demand, baseline position, and intent mix as matching/stratification variables. Use the repository's dictionary classification for consistency and record its version.
2. Assign canonical URLs to treatment/control with a reproducible seed within those strata; keep anagram-family pages that compete for the same queries in the same assignment unit. Keep controls on their current title. Lock assignment for the experiment. Never rotate all four titles daily on the same URL.
3. Save assignment, old/new titles, deployment time, dictionary/count version, and evidence snapshot. Keep other content/link/template changes stable, or log them as confounders.
4. Choose the minimum worthwhile click uplift and calculate experiment size/duration from baseline URL-level variability before launching. Use a fixed analysis date and adjust for multiple comparisons if testing more than one contrast. The 500-impression recommendation gate is not an experiment power calculation.
5. Track rendered HTML and sampled search title links after deployment. Begin the planned observation period after a defined recrawl/reprocessing allowance; report incomplete uptake. Plan at least 28 complete observation days, extending according to the precomputed sample requirement. Freeze further title proposals on these URLs until the experiment closes.
6. Primary outcome: organic WEB click change at the randomized assignment-unit level versus control, accounting for baseline differences. Report uncertainty using a method clustered at the assignment unit. Secondary diagnostics: impressions, CTR, query coverage, positions, and country/device composition. Position-adjusted CTR is diagnostic because rankings may themselves change due to the treatment.
7. Promote only when the prespecified analysis supports the minimum worthwhile gain without material guardrail regressions. Inconclusive results keep the incumbent. Stop and restore for incorrect counts, broken rendering, canonical errors, or a prespecified sustained traffic-loss guardrail; do not repeatedly peek at significance and declare the first positive result a win.

Google can generate a different search title from page content and other sources, and reprocessing can take days to weeks. Keep title text concise and accurate, and visually preview its mobile/desktop rendering; there is no universal character limit that guarantees display. See [Google's title-link guidance](https://developers.google.com/search/docs/appearance/title-link).

## 7. Production automation contract

Recommended cadence: ingest/validate daily, propose weekly, publish only an approved experiment batch or a previously validated cohort policy. This is a proposed system schedule, not an installed scheduled task.

```text
GSC export + export health checks
    → complete 56-day query evidence snapshot
CMS + canonical inventory + versioned word counts
    → deterministic query classification and title proposal
    → segment/stability/count/experiment checks
    → immutable recommendation log
    → experiment assignment or validated cohort rule
    → CMS title update and rendered-page verification
    → controlled outcome evaluation and rollback registry
```

The unattended worker needs its own scoped Google Cloud identity, BigQuery read/job permissions, and an explicitly configured CMS integration. The current browser application keeps its access token in memory and is not an unattended scheduler.

Persist `run_id`, URL, source date range, table identifier, source snapshot/checksum, inventory version, classification/rule version, old/new title, reason, assignment, applied timestamp, publisher result, and rollback title. Make publication idempotent on `(URL, experiment_id, title_hash)`; recheck the current title and current word count immediately before writing. If either changed since the snapshot, recompute or hold. Publish a verified batch, check rendered titles and canonical status, and retain a rollback mapping. Write serving titles only from this validated registry.

Failures in export completeness, inventory refresh, query validation, or publishing must retain the incumbent and surface a specific failure reason. Do not publish recommendations from a stale successful run as if they were new. A verified count correction is a content-accuracy change and must be logged even during a title experiment.

## Acceptance criteria

- Every in-scope inventory URL receives HOLD, UNCHANGED, or PROPOSE_TEST.
- No count is invented from query metrics or an obsolete general dictionary.
- Anonymous, specialized, and unclassified demand remains visible in the audit metrics.
- Identical input snapshots and rule version produce identical decisions.
- Both time windows and major sufficiently supported segments agree before proposing.
- Live activation requires a verified dataset, export health checks, fresh inventory, and publisher/experiment integration.
- An experiment result, not the initial query-share heuristic, establishes a performance winner.
