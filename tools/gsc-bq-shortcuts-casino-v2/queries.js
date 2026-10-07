window.QUERY_CATALOG = [
  {
    "id": "q01",
    "title": "Source detail",
    "category": "Explore",
    "summary": "Choose any of the 13 supplied columns and return the matching source rows.",
    "sql": "SELECT {{COLUMNS}} FROM source_data ORDER BY date DESC",
    "notes": "Raw CTR and position are returned as stored. Column selection applies to this detail report only; analytical reports have fixed output fields. URL and query are not present in this source."
  },
  {
    "id": "q02",
    "title": "Domains visible at the start but absent at the end",
    "category": "Lifecycle",
    "summary": "Compare the first and last 30 days of the selected history.",
    "sql": "WITH bounds AS (\n  SELECT MIN(data_date) AS d0, MAX(data_date) AS d1\n  FROM performance\n)\nSELECT\n  domain,\n  SUM(IF(data_date <= DATE_ADD((SELECT d0 FROM bounds), INTERVAL 29 DAY), impressions, 0)) AS impressions_first_month,\n  SUM(IF(data_date >= DATE_SUB((SELECT d1 FROM bounds), INTERVAL 29 DAY), impressions, 0)) AS impressions_last_month,\n  MAX(IF(impressions > 0, data_date, NULL)) AS last_impression_date,\n  SUM(impressions) AS impressions_total,\n  SUM(clicks) AS clicks_total\nFROM performance\nGROUP BY domain\nHAVING impressions_first_month >= 1 AND impressions_last_month = 0\nORDER BY impressions_first_month DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q03",
    "title": "Domain lifecycle",
    "category": "Lifecycle",
    "summary": "First seen, last seen, active days, and 28-day inactivity status.",
    "sql": "WITH per_domain AS (\n  SELECT\n    domain,\n    MIN(data_date) AS first_seen,\n    MAX(data_date) AS last_seen,\n    COUNT(DISTINCT data_date) AS active_days,\n    SUM(impressions) AS impressions_total,\n    SUM(clicks) AS clicks_total\n  FROM performance\n  WHERE impressions > 0\n  GROUP BY domain\n),\nbounds AS (\n  SELECT MAX(data_date) AS d1 FROM performance\n)\nSELECT\n  domain,\n  first_seen,\n  last_seen,\n  active_days,\n  DATE_DIFF(last_seen, first_seen, DAY) + 1 AS lifespan_days,\n  DATE_DIFF((SELECT d1 FROM bounds), last_seen, DAY) AS days_since_last_seen,\n  impressions_total,\n  clicks_total,\n  CASE\n    WHEN DATE_DIFF((SELECT d1 FROM bounds), last_seen, DAY) >= 28 THEN 'dropped'\n    WHEN DATE_DIFF((SELECT d1 FROM bounds), first_seen, DAY) <= 28 THEN 'new'\n    ELSE 'active'\n  END AS status\nFROM per_domain\nORDER BY days_since_last_seen DESC, impressions_total DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q04",
    "title": "Newly observed domains",
    "category": "Lifecycle",
    "summary": "Domains first observed within the last 28 dates in the selected data.",
    "sql": "SELECT\n  domain,\n  MIN(data_date) AS first_impression_date,\n  COUNT(DISTINCT data_date) AS active_days,\n  SUM(impressions) AS impressions_total,\n  SUM(clicks) AS clicks_total\nFROM performance\nWHERE impressions > 0\nGROUP BY domain\nHAVING first_impression_date >= DATE_SUB((SELECT MAX(data_date) FROM performance), INTERVAL 27 DAY)\nORDER BY impressions_total DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q05",
    "title": "Inactive domains with historical clicks",
    "category": "Lifecycle",
    "summary": "Domains inactive for 28 days with at least 10 historical clicks.",
    "sql": "WITH bounds AS (\n  SELECT MAX(data_date) AS d1 FROM performance\n),\nper_domain AS (\n  SELECT\n    domain,\n    MAX(data_date) AS last_seen,\n    SUM(impressions) AS impressions_total,\n    SUM(clicks) AS clicks_total,\n    SUM(IF(data_date >= DATE_SUB((SELECT d1 FROM bounds), INTERVAL 27 DAY),\n           clicks, 0)) AS clicks_last_28\n  FROM performance\n  WHERE impressions > 0\n  GROUP BY domain\n)\nSELECT\n  domain,\n  last_seen,\n  DATE_DIFF((SELECT d1 FROM bounds), last_seen, DAY) AS days_silent,\n  impressions_total,\n  clicks_total\nFROM per_domain\nWHERE clicks_last_28 = 0\n  AND clicks_total >= 10\n  AND DATE_DIFF((SELECT d1 FROM bounds), last_seen, DAY) >= 28\nORDER BY clicks_total DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q06",
    "title": "Domains returning after an inactivity gap",
    "category": "Lifecycle",
    "summary": "Find gaps of at least 28 missing days between impressions.",
    "sql": "WITH active_days AS (\n  SELECT domain, data_date\n  FROM performance\n  GROUP BY domain, data_date\n  HAVING SUM(impressions) > 0\n),\nwith_prev AS (\n  SELECT\n    domain,\n    data_date,\n    LAG(data_date) OVER (PARTITION BY domain ORDER BY data_date) AS prev_date\n  FROM active_days\n)\nSELECT\n  domain,\n  prev_date AS disappeared_after,\n  data_date AS returned_on,\n  DATE_DIFF(data_date, prev_date, DAY) - 1 AS days_missing\nFROM with_prev\nWHERE prev_date IS NOT NULL\n  AND DATE_DIFF(data_date, prev_date, DAY) > 28\nORDER BY days_missing DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q07",
    "title": "Monthly domain footprint",
    "category": "Lifecycle",
    "summary": "Domains served, gained, and lost by month; unobservable boundaries return NULL.",
    "sql": "-- Unknown first-month gains and losses without a complete following month return NULL.\n-- The latest month may be partial; domains_served and gains are month-to-date.\nWITH monthly AS (\n  SELECT\n    DATE_TRUNC(data_date, MONTH) AS month,\n    domain\n  FROM performance\n  WHERE impressions > 0\n  GROUP BY month, domain\n),\nflags AS (\n  SELECT\n    month,\n    domain,\n    LAG(month) OVER (PARTITION BY domain ORDER BY month) AS prev_active_month,\n    LEAD(month) OVER (PARTITION BY domain ORDER BY month) AS next_active_month\n  FROM monthly\n)\nSELECT\n  month,\n  COUNT(*) AS domains_served,\n  IF(month = (SELECT MIN(month) FROM monthly), NULL, COUNTIF(prev_active_month IS NULL\n          OR prev_active_month < DATE_SUB(month, INTERVAL 1 MONTH))) AS domains_gained,\n  IF(DATE_ADD(month, INTERVAL 2 MONTH) > DATE_TRUNC((SELECT MAX(data_date) FROM performance), MONTH), NULL, COUNTIF(next_active_month IS NULL\n          OR next_active_month > DATE_ADD(month, INTERVAL 1 MONTH))) AS domains_lost_after\nFROM flags\nGROUP BY month\nORDER BY month",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q08",
    "title": "Domains with intermittent impressions",
    "category": "Lifecycle",
    "summary": "Domains active on fewer than 30% of days between their first and last observations.",
    "sql": "SELECT\n  domain,\n  MIN(data_date) AS first_seen,\n  MAX(data_date) AS last_seen,\n  COUNT(DISTINCT data_date) AS active_days,\n  DATE_DIFF(MAX(data_date), MIN(data_date), DAY) + 1 AS span_days,\n  ROUND(COUNT(DISTINCT data_date)\n        / (DATE_DIFF(MAX(data_date), MIN(data_date), DAY) + 1), 3) AS coverage_ratio,\n  SUM(impressions) AS impressions_total\nFROM performance\nWHERE impressions > 0\nGROUP BY domain\nHAVING span_days >= 90 AND coverage_ratio < 0.30\nORDER BY impressions_total DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q09",
    "title": "High impressions, low CTR by domain",
    "category": "Performance",
    "summary": "Domains with at least 1,000 impressions and CTR below 1%.",
    "sql": "SELECT\n  domain,\n  SUM(impressions) AS impressions_total,\n  SUM(clicks) AS clicks_total,\n  ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) AS ctr_pct,\n  ROUND(SAFE_DIVIDE(SUM(sum_position), SUM(position_impressions)) + 1, 1) AS avg_position\nFROM performance\nWHERE data_date >= DATE_SUB((SELECT MAX(data_date) FROM performance), INTERVAL 89 DAY)\n  \nGROUP BY domain\nHAVING impressions_total >= 1000 AND ctr_pct < 1.0\nORDER BY impressions_total DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q10",
    "title": "Domains averaging positions 5 to 20",
    "category": "Performance",
    "summary": "Domains averaging positions 5\u201320, with a hypothetical 5% CTR opportunity.",
    "sql": "SELECT\n  domain,\n  SUM(impressions) AS impressions_total,\n  SUM(clicks) AS clicks_total,\n  ROUND(SAFE_DIVIDE(SUM(clicks), SUM(impressions)) * 100, 2) AS ctr_pct,\n  ROUND(SAFE_DIVIDE(SUM(sum_position), SUM(position_impressions)) + 1, 1) AS avg_position,\n  GREATEST(0, CAST(ROUND(SUM(impressions) * 0.05 - SUM(clicks)) AS INT64)) AS clicks_within_reach\nFROM performance\nWHERE data_date >= DATE_SUB((SELECT MAX(data_date) FROM performance), INTERVAL 89 DAY)\n  \nGROUP BY domain\nHAVING impressions_total >= 500\n   AND SAFE_DIVIDE(SUM(sum_position), SUM(position_impressions)) + 1 BETWEEN 5 AND 20\nORDER BY clicks_within_reach DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q11",
    "title": "Domain CTR gap benchmark",
    "category": "Performance",
    "summary": "Compare domains against the impression-weighted CTR of their position band.",
    "sql": "-- Benchmark includes the scored domain; single-domain bands have zero gap.\nWITH base AS (\n  SELECT\n    domain,\n    SUM(impressions) AS impressions,\n    SUM(clicks) AS clicks,\n    SAFE_DIVIDE(SUM(sum_position), SUM(position_impressions)) + 1 AS avg_position\n  FROM performance\n  WHERE data_date >= DATE_SUB((SELECT MAX(data_date) FROM performance), INTERVAL 89 DAY)\n  \n  GROUP BY domain\n),\nbanded AS (\n  SELECT *, CAST(FLOOR(avg_position) AS INT64) AS position_band\n  FROM base\n  WHERE impressions >= 100\n),\ncurve AS (\n  SELECT position_band, SAFE_DIVIDE(SUM(clicks), SUM(impressions)) AS expected_ctr\n  FROM banded\n  GROUP BY position_band\n)\nSELECT\n  b.domain,\n  b.impressions,\n  b.clicks,\n  ROUND(b.avg_position, 1) AS avg_position,\n  ROUND(SAFE_DIVIDE(b.clicks, b.impressions) * 100, 2) AS ctr_pct,\n  ROUND(c.expected_ctr * 100, 2) AS expected_ctr_pct,\n  CAST(ROUND(b.impressions * c.expected_ctr - b.clicks) AS INT64) AS clicks_missed\nFROM banded AS b\nJOIN curve AS c USING (position_band)\nWHERE b.impressions * c.expected_ctr - b.clicks > 0\nORDER BY clicks_missed DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q12",
    "title": "Domain position decline",
    "category": "Performance",
    "summary": "Compare the latest complete month against each domain\u2019s best qualifying month.",
    "sql": "-- Latest complete month only; domains below the existing volume thresholds are omitted.\nWITH monthly AS (\n  SELECT\n    domain,\n    DATE_TRUNC(data_date, MONTH) AS month,\n    SUM(impressions) AS impressions_total,\n    SUM(clicks) AS clicks_total,\n    SAFE_DIVIDE(SUM(sum_position), SUM(position_impressions)) + 1 AS avg_position\n  FROM performance\n  WHERE data_date < DATE_TRUNC((SELECT MAX(data_date) FROM performance), MONTH)\n  GROUP BY domain, month\n  HAVING impressions_total >= 50\n),\nagg AS (\n  SELECT\n    domain,\n    MIN(avg_position) AS best_position,\n    MAX(month) AS latest_qualifying_month,\n    ARRAY_AGG(avg_position      IGNORE NULLS ORDER BY month DESC LIMIT 1)[SAFE_OFFSET(0)] AS current_position,\n    ARRAY_AGG(impressions_total IGNORE NULLS ORDER BY month DESC LIMIT 1)[SAFE_OFFSET(0)] AS current_impressions,\n    ARRAY_AGG(clicks_total      IGNORE NULLS ORDER BY month DESC LIMIT 1)[SAFE_OFFSET(0)] AS current_clicks\n  FROM monthly\n  GROUP BY domain\n)\nSELECT\n  domain,\n  ROUND(best_position, 1) AS best_position,\n  ROUND(current_position, 1) AS current_position,\n  ROUND(current_position - best_position, 1) AS positions_lost,\n  current_impressions,\n  current_clicks\nFROM agg\nWHERE latest_qualifying_month = DATE_SUB(DATE_TRUNC((SELECT MAX(data_date) FROM performance), MONTH), INTERVAL 1 MONTH)\n  AND current_position - best_position >= 3\n  AND current_impressions >= 200\nORDER BY current_impressions DESC",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  },
  {
    "id": "q13",
    "title": "Domain opportunity priority",
    "category": "Performance",
    "summary": "Rank positive domain CTR gaps using the original heuristic position weights.",
    "sql": "-- Benchmark includes the scored domain; single-domain bands have zero gap.\nWITH base AS (\n  SELECT\n    domain,\n    SUM(impressions) AS impressions_total,\n    SUM(clicks) AS clicks_total,\n    SAFE_DIVIDE(SUM(sum_position), SUM(position_impressions)) + 1 AS avg_position\n  FROM performance\n  WHERE data_date >= DATE_SUB((SELECT MAX(data_date) FROM performance), INTERVAL 89 DAY)\n    \n  GROUP BY domain\n  HAVING impressions_total >= 200\n),\nbanded AS (\n  SELECT *, CAST(FLOOR(avg_position) AS INT64) AS position_band FROM base\n),\ncurve AS (\n  SELECT position_band,\n         SAFE_DIVIDE(SUM(clicks_total), SUM(impressions_total)) AS expected_ctr\n  FROM banded GROUP BY position_band\n),\nscored AS (\n  SELECT\n    b.domain,\n    b.impressions_total,\n    b.clicks_total,\n    b.avg_position,\n    b.impressions_total * c.expected_ctr - b.clicks_total AS clicks_missed,\n    CASE\n      WHEN b.avg_position BETWEEN 4 AND 10 THEN 1.0\n      WHEN b.avg_position > 10 AND b.avg_position <= 20 THEN 0.7\n      WHEN b.avg_position < 4 THEN 0.3\n      ELSE 0.2\n    END AS position_weight\n  FROM banded AS b\n  JOIN curve AS c USING (position_band)\n)\nSELECT\n  domain,\n  ROUND(avg_position, 1) AS avg_position,\n  impressions_total,\n  clicks_total,\n  CAST(ROUND(clicks_missed) AS INT64) AS clicks_missed,\n  ROUND(clicks_missed * position_weight, 1) AS opportunity_score\nFROM scored\nWHERE clicks_missed > 0\nORDER BY opportunity_score DESC\nLIMIT 200",
    "notes": "Domain-level analysis only. Dates and filters define the available history; missing data is not evidence of deindexing. Position is impression-weighted using the selected position base. CTR bands compare domains, include the scored domain, and are exploratory rather than forecasts."
  }
];
