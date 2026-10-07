# Casino BigQuery v2

A separate version of the casino dashboard for the supplied domain-level table.
The original casino tool is unchanged. V2 retains browser-only Google sign-in,
BigQuery dry-run estimates, result pagination, SQL copying, and CSV downloads.

## Source schema

Required columns: `date`, `domain`, `site_id`, `vertical_id`, `network_id`,
`country`, `device`, `clicks`, `impressions`, `ctr`, `position`, `site_language`,
`site_country`. Date must be castable to DATE and metrics to their numeric types.

Enter the actual project, dataset, and table in the connection form. No production
table name has been assumed. Select any combination of all 13 fields in **Source
detail**. The 12 analytical reports have fixed output columns. Optional exact,
case-insensitive filters cover domain, visitor country, device, site ID, vertical
ID, network ID, site language, and site country; date bounds are inclusive.

No URL, query, search type, or inspection fields are invented. Page-level,
cannibalization, query-variety, and anchor-text reports require a different source.
Visitor `country` and `site_country` are separate filters with the source's own
codes (for example `usa` versus `US`). Player-intent lenses are not meaningful
without page/query text and are not offered in v2.

## Calculations and limits

- Position is assumed to be a **1-based per-row average weighted by impressions**.
  Select zero-based if appropriate. Confirm this definition with your data owner.
  Missing positions are excluded from the position denominator, but their clicks
  and impressions remain in other totals. Raw detail preserves source values.
- Aggregated CTR uses total clicks divided by total impressions; stored CTR is
  returned only in source detail.
- Rolling windows end at the latest date in the filtered data, not today's date.
  All filters apply before calculations, including first/last seen. Narrowing the
  date range therefore changes the historical baseline. Empty filters may scan
  the entire table; use Estimate cost before execution.
- Monthly gains at the initial boundary and losses without an observed complete
  following month are unknown (NULL). The latest month can be partial.
- Position decline uses the common latest complete month, retaining volume
  thresholds. Missing days may reflect export gaps rather than inactivity.
- CTR benchmarks compare domains in the selected portfolio, include the domain
  being scored, and have no gap for a band with only one domain. They do not model
  device/market/query mix. Priority weights and a 5% target CTR are heuristics;
  no recommended internal-link counts or causal SEO claims are produced.
- SQL is a single SELECT with CTEs per report, so dry runs and result pagination
  do not rely on multi-statement child jobs. Results are held in browser memory.

## Setup

Enable the BigQuery API, create a Web OAuth client, and authorize the deployment
origin `https://koraytugberkgubur.github.io` (or your actual hosting origin).
Users need BigQuery Job User on the project plus read access to the dataset.
Enter only the public client ID, never a client secret. Tokens stay in memory;
configuration and field selections use a separate v2 local-storage key.

Serve the repository with `python3 -m http.server 8080` and open
`http://localhost:8080/tools/gsc-bq-shortcuts-casino-v2/` for local preview.
Authorize that local origin when testing Google sign-in.

## Tests

Run `node --test tools/gsc-bq-shortcuts-casino-v2/tests/*.test.cjs` from the repo.
Tests cover SQL construction, date/input validation, field selection, and mocked
BigQuery execution, polling, pagination, and error handling. Live BigQuery needs
the user's source identifiers and Google authorization and is not assumed tested.
