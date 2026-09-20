# Legal GSC BigQuery Shortcuts

A browser-based dashboard for legal SEO teams running reusable analyses against the Google Search Console bulk export in BigQuery.

## What it includes

- 17 SQL templates sourced from `GSC Bigquery Templates (3).xlsx`
- Browser-only Google OAuth using Google Identity Services
- Configurable GCP project, dataset, table, and BigQuery location
- Query cost estimates through BigQuery dry runs
- Results rendered in a sortable-friendly table and downloadable as CSV
- No backend and no stored client secret

## Google Cloud setup

1. Enable the BigQuery API.
2. Create an OAuth 2.0 Client ID of type **Web application**.
3. Add `https://ktg1.github.io` as an authorized JavaScript origin.
4. Give each user `roles/bigquery.jobUser` on the project and read access to the Search Console export dataset.
5. Open the GitHub Pages site and enter the OAuth client ID and BigQuery identifiers.

The OAuth client ID is public by design. Never enter or commit an OAuth client secret.

## Local preview

Serve the directory over HTTP; Google Identity Services does not support opening `index.html` directly from the filesystem.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Add that origin to the OAuth client during local development.

## Security model

The static page calls Google Identity Services and the BigQuery REST API directly. Access tokens live in memory and are not written to local storage. Project configuration is stored locally in the browser. Query results stay in the browser unless the user downloads them.

## Query catalog generation

The committed `queries.js` catalog is mechanically generated from the workbook extraction with:

```bash
node scripts/build-query-catalog.mjs
```

## Legal page groups

Every query can be scoped to all pages, practice areas, locations, attorneys, or insights. The default folder conventions are `/practice-areas`, `/locations`, `/attorneys`, and `/blog` or `/insights`; adjust `PAGE_SCOPES` in `app.js` if the law firm's URL structure differs.
