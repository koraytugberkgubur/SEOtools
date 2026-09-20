# Allergy GSC BigQuery Shortcuts

A browser-based dashboard for allergy-industry SEO teams running reusable analyses against the Google Search Console bulk export in BigQuery.

This project is an independent allergy-focused adaptation of [`KTG1/gsc-big-query-shortcuts-law`](https://github.com/KTG1/gsc-big-query-shortcuts-law). The original legal repository remains unchanged.

## What it includes

- 17 reusable Search Console SQL analyses
- Browser-only Google OAuth using Google Identity Services
- Configurable GCP project, dataset, table, and BigQuery location
- Page groups for allergy types, symptoms, tests and treatments, cities, and doctors
- URL presets derived from real allergy-site patterns such as `/pages/birkenpollenallergie`, `/pages/allergologensuche`, and `/pages/allergologische-facharzte-und-um-hannover`
- English and German query-intent presets for symptoms, tests, treatment, local intent, doctors, children, and emergencies
- Custom page and search-query rules using contains, excludes, starts with, ends with, exact, or regex matching
- A separate custom page-group regex that stacks with page and query filters
- Query cost estimates, in-browser result tables, and full CSV downloads
- No backend and no stored client secret

## Google Cloud setup

1. Enable the BigQuery API.
2. Create an OAuth 2.0 Client ID of type **Web application**.
3. Add `https://ktg1.github.io` as an authorized JavaScript origin.
4. Give each user `roles/bigquery.jobUser` on the project and read access to the Search Console export dataset.
5. Open the GitHub Pages site and enter the OAuth client ID and BigQuery identifiers.

The OAuth client ID is public by design. Never enter or commit an OAuth client secret.

## Filtering allergy sites

The page-group buttons are broad URL-structure filters. A page may match more than one group; for example, a local allergist page can reasonably match both **City pages** and **Doctor pages**.

Use **Custom regex** when a site has different folder or slug conventions. It runs case-insensitively against the full URL. You can then stack an additional page rule and an optional search-query rule in **Refine data**.

Examples:

| Goal | Suggested page-group regex |
| --- | --- |
| Allergy taxonomy folders | `/(?:allergy-types|allergies|allergien)/` |
| City landing pages | `/(?:cities|locations|standorte)/` |
| Doctor profiles or directories | `/(?:doctors|allergists|allergologen|aerzte)/` |
| Shopify-style allergy content | `/pages/[^/?#]*allerg` |

Edit [`industry-config.js`](industry-config.js) to change the default page groups and one-click presets for another allergy site. Patterns use syntax supported by both JavaScript regular expressions and BigQuery RE2; avoid lookbehind and backreferences.

## Local preview

Serve the directory over HTTP; Google Identity Services does not support opening `index.html` directly from the filesystem.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Add that origin to the OAuth client during local development.

## Verification

```bash
node --check app.js
node --check industry-config.js
node scripts/test-industry-config.mjs
```

## Security model

The static page calls Google Identity Services and the BigQuery REST API directly. Access tokens live in memory and are not written to local storage. Project configuration and filter settings are stored locally in the browser. Query results stay in the browser unless the user downloads them.

## Query catalog generation

The committed `queries.js` catalog is mechanically generated from the original workbook extraction with:

```bash
node scripts/build-query-catalog.mjs
```
