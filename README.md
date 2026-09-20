# SEO Tools

Consolidated home for the SEO tooling that previously lived in separate repositories.

Each tool was imported with `git subtree add`, so **the full commit history of every
original repository is preserved** inside this one — `git log -- tools/<name>` shows a
tool's complete history, with original authors and dates intact.

## Tools

| Directory | What it does |
|---|---|
| `tools/gsc-cannibalization-tool` | Detects keyword cannibalization from Search Console API data |
| `tools/gsc-big-query-shortcuts` | Base BigQuery query shortcuts for GSC bulk exports |
| `tools/gsc-bq-shortcuts-allergy` | GSC/BigQuery shortcuts, allergy vertical |
| `tools/gsc-bq-shortcuts-law` | GSC/BigQuery shortcuts, legal vertical |
| `tools/gsc-bq-shortcuts-xometry` | GSC/BigQuery shortcuts, industrial/manufacturing vertical |
| `tools/gsc-bq-shortcuts-casino` | GSC/BigQuery shortcuts, casino vertical |
| `tools/redirect-mapper` | Maps old URLs to redirect targets during migrations |
| `tools/referring-domain-checker` | Checks and classifies referring domains |
| `tools/domain-expiry-checker` | Checks domain expiry dates in bulk |
| `tools/locale-qdp-calculator` | Locale-aware QDP calculation |
| `tools/image-quality-advisor` | Advises on image quality issues |
| `tools/store-locator-automater` | Automates store locator page generation |
| `tools/thomasnet-supplier-search` | Supplier search tooling |
| `tools/url-similarity` | URL similarity analysis for cannibalization candidates |

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
