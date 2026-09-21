# Redirect Mapper

An SEO-focused Python tool that maps broken/404 URLs to the most relevant live URL and audits existing redirect chains. It is dependency-free, explainable, and designed to keep uncertain matches in human review.

## Quick start

```bash
python3 url_redirect_mapper.py crawl examples/complete-crawl.csv -o redirect-map.csv
python3 url_redirect_mapper.py map examples/404s.csv examples/live-urls.csv -o redirect-map.csv
python3 url_redirect_mapper.py audit examples/live-urls.csv -o redirect-audit.csv
python3 -m unittest discover -v
```

The recommended `crawl` command takes the same single crawl export as the web tool. It automatically separates 404/410 sources from 2xx destinations, prints progress, skips malformed URLs, groups CSS/JS/font records at the end, and writes folder-direction fields. It uses only the Python standard library.

The older `map` command remains available for workflows that keep broken and live URLs in separate files.

## Scoring and SEO safeguards

- Slug similarity: 38%
- Shared URL/title concepts: 25%
- Full path similarity: 17%
- Page title similarity: 12%
- Directory-depth similarity: 8%
- Small same-host bonus

Scores below the approval threshold are left without a destination. Close alternatives, low-confidence matches, and non-200 destination statuses are marked for review. Always validate intent and traffic value before deploying redirects; fuzzy similarity is decision support, not a substitute for editorial judgment.

## GitHub Pages

The `docs/` directory contains a private, browser-only version of the mapper. Enable **Settings → Pages → Deploy from branch**, select your default branch and `/docs`. CSV data never leaves the browser.

The web interface accepts one complete crawl-export CSV. It recognizes common crawler headers such as `URL`, `Page`, `Address`, or `Internal URL`; `Status Code` or `Response Code`; `Title 1`; `H1-1`; and `Meta Description`. Comma-, semicolon-, and tab-delimited exports are supported, including Excel `sep=` preambles and UTF-16 files. Rows with 404/410 statuses become redirect sources; 2xx rows become eligible destinations. Every broken URL receives its closest live candidate, with low scores flagged for manual review. URL structure is the primary matching signal, supported by title, H1, and description similarity when those columns are present.

Large crawls are processed in non-blocking batches. For datasets with more than 2,000 live URLs, a URL/title token and slug-trigram index shortlists the most relevant candidates before detailed fuzzy scoring. The progress bar reports indexing, matching, and rendering stages; CSV export always contains all suggestions even when the on-page preview is capped at 500 rows.

Malformed URLs are validated and skipped before indexing, including non-HTTP(S) values and invalid percent encoding. They are listed after the redirect results with their original CSV row and reason, and appended to the downloaded CSV as `record_type=skipped_malformed` records.

URL types are inferred from file extensions and optional `Content Type`/`MIME Type` columns. CSS, JavaScript, and font redirects are matched against destinations of the same type and sorted after page-level results. The UI shows a compact folder transition such as `/old-section/ → /new-section/`; exports also include `source_folder`, `destination_folder`, and `folder_direction` columns.

## Production notes

Prefer a single 301/308 hop directly to a canonical 200 URL. Avoid redirecting every missing page to the home page, soft-404 destinations, loops, and irrelevant matches. Preserve intentionally valuable query parameters and test generated rules in staging.

## License

MIT
