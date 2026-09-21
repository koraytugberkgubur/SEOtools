# SEO Tools

Consolidated home for the SEO tooling that previously lived in separate repositories.

The first seven tools were imported with `git subtree add`, so their full commit history
is preserved inside this one — `git log -- tools/<name>` shows the complete history, with
original authors and dates intact.

The five added later (`gsc-cannibalization-tool`, `locale-qdp-calculator`, `redirect-mapper`,
`referring-domain-checker`, `thomasnet-supplier-search`) were added as **snapshots of their
`HEAD`, without history**, because their source repositories could not be cloned. Their
upstreams live on the `KTG1` GitHub account; re-import them with `git subtree add` if you
want the history back.

## Tools

| Directory | What it does |
|---|---|
| `tools/domain-expiry-checker` | Checks domain expiry dates in bulk |
| `tools/gsc-big-query-shortcuts` | Base BigQuery query shortcuts for GSC bulk exports |
| `tools/gsc-bq-shortcuts-allergy` | GSC/BigQuery shortcuts, allergy vertical |
| `tools/gsc-bq-shortcuts-casino` | GSC/BigQuery shortcuts, casino vertical |
| `tools/gsc-bq-shortcuts-law` | GSC/BigQuery shortcuts, legal vertical |
| `tools/gsc-bq-shortcuts-xometry` | GSC/BigQuery shortcuts, industrial/manufacturing vertical |
| `tools/gsc-cannibalization-tool` | Detects keyword cannibalization from Search Console API data |
| `tools/image-quality-advisor` | Advises on image quality issues |
| `tools/locale-qdp-calculator` | Locale-aware QDP calculation |
| `tools/redirect-mapper` | Maps old URLs to redirect targets during migrations |
| `tools/referring-domain-checker` | Checks and classifies referring domains |
| `tools/thomasnet-supplier-search` | Supplier search tooling |

All twelve are published at <https://koraytugberkgubur.github.io/SEOtools/>.

## Not included

Two tools from the original plan are not in this repository, because neither is a
browser-based tool and neither can be served as a static page:

- **store-locator-automater** — a Google Apps Script (`.gs`) plus WordPress PHP plugin
  pipeline. It has no HTML entry point and runs on Apps Script and WordPress, not in a
  browser tab.
- **url-similarity** — the working directory (`~/Documents/Similarity`) is a `git init`
  with zero commits. The `analyze_urls.py` and `build_report.mjs` files there have never
  been committed, and there is no UI.


## Layout

```
tools/<tool-name>/      one directory per tool, each with its own history
```

## Working with a subtree

Pull later changes from an original repo into its subtree:

```bash
git subtree pull --prefix=tools/<name> <path-or-url> <branch>
```

Push changes made here back out to a standalone repo:

```bash
git subtree push --prefix=tools/<name> <path-or-url> <branch>
```

## Notes

- The original working copies remain on disk and are untouched by this consolidation;
  this repository was assembled by reading from them.
- `.gitignore` excludes `node_modules/`, `__pycache__/`, virtualenvs, `outputs/`, and
  credential-shaped files (`.env`, `*credentials*.json`, `*service-account*.json`,
  `client_secret*.json`). Keep credentials out of this repository — supply them via
  environment variables or untracked local files.
