-- GoogleSQL. Replace PROJECT.DATASET; bind @end_date as DATE after checking
-- ExportLog completeness. Optional @country/@device are STRING ('' = all).
-- Exactly 56 days: previous 28 and current 28. No persistent writes.
SELECT
  data_date, url,
  IF(is_anonymized_query OR query IS NULL OR TRIM(query) = '', '', query) AS query,
  country, device,
  SUM(impressions) AS impressions,
  SUM(clicks) AS clicks,
  SUM(sum_position) AS sum_position
FROM `PROJECT.DATASET.searchdata_url_impression`
WHERE data_date BETWEEN DATE_SUB(@end_date, INTERVAL 55 DAY) AND @end_date
  AND LOWER(search_type) = 'web'
  AND REGEXP_CONTAINS(url, r'^https?://[^/]+/anagram/[A-Za-z]+/?$')
  AND (@country = '' OR LOWER(country) = LOWER(@country))
  AND (@device = '' OR LOWER(device) = LOWER(@device))
GROUP BY data_date, url, query, country, device;
