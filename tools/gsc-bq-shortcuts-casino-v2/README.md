# Casino BigQuery v2

A separate version of the casino dashboard with Site and URL tabs for the two supplied schemas.
The original casino tool is unchanged. V2 retains browser-only Google sign-in,
BigQuery dry-run estimates, result pagination, SQL copying, and CSV downloads.

## Site and URL source schemas

Required columns: `date`, `domain`, `site_id`, `vertical_id`, `network_id`,
`country`, `device`, `clicks`, `impressions`, `ctr`, `position`, `site_language`,
`site_country`. Date must be castable to DATE and metrics to their numeric types.

Enter the actual project, dataset, and table in the connection form. No production
table name has been assumed. Select any combination of all 13 fields in **Source
detail**. The 12 analytical reports have fixed output columns. Optional exact,
case-insensitive filters cover domain, visitor country, device, site ID, vertical
ID, network ID, site language, and site country; date bounds are inclusive.

The URL tab requires the same 13 fields plus `page`, `query`, `resource_id`, and
`resource_type`. It maps `page` directly to URL reports and exposes all 17 fields.
It has the 12 equivalent page-level reports plus search terms by URL, zero-click
search terms, shared-query reviews, and anchor candidates. URL CTR benchmarks
are calculated within each domain. No search-type or index-inspection fields are
invented. Query-variety decay and index inspection are not included.

Each tab independently stores its project, dataset, table, location, position
base, and selected columns. Existing v2 settings migrate to Site. On first URL
selection, project/dataset/location are copied for convenience but the table is
blank: enter the actual URL table, which can be in a different dataset or project.
Google sign-in and general date/domain/market filters are shared. URL-only page,
query, and resource-type filters never apply to Site. Page and query filters are
exact and case-sensitive; other text filters are case-insensitive. Switching tabs
clears prior results so downloads cannot mix sources.

Before a dry run or execution, the tool checks table metadata for the active
schema and location. Missing or repeated/nested fields stop the request with an
explanation before a query job is created. This requires table metadata access
(normally included with dataset read access). Casts deliberately fail on malformed
metric/date values instead of silently dropping them. Table schemas are read only;
this tool does not alter datasets or copy data between them. Site and URL totals
are not joined or added together.
Visitor `country` and `site_country` are separate filters with the source's own
codes (for example `usa` versus `US`). Player-intent lenses are not offered; use explicit page/query filters instead.

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
- Site CTR benchmarks compare domains in the selected portfolio, include the domain
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
Tests cover both schemas, tab switching and migration, missing-column blocking, SQL construction, date/input validation, field selection, and mocked
BigQuery execution, polling, pagination, and error handling. Live BigQuery needs
the user's source identifiers and Google authorization and is not assumed tested.

Optional SQL fixture check (requires Python `sqlglot` and `duckdb`):
`python3 tools/gsc-bq-shortcuts-casino-v2/tests/validate_sql.py`. It parses all
30 queries as BigQuery SQL, translates them for local execution, and checks
per-domain page/query isolation against synthetic data. It is not live BigQuery
validation.
