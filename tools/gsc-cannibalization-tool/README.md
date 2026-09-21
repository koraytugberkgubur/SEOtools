# Split Signal

A private, browser-only Google Search Console homepage cannibalization finder. It identifies queries receiving impressions for both a site's homepage and its sub-pages, ranked by mutual impressions.

Results can be explored as a hoverable query map or a detailed table. The common impression percentage is a symmetric overlap score: `2 × mutual impressions ÷ combined impressions`.

The interactive scatter view plots primary-page and competing-page impressions on a shared logarithmic scale. The diagonal marks equal ownership; points can be hovered or clicked to pin query details.

Check templates include homepage vs sub-pages, overall two-page cannibalization, and queries fragmented across three or more URLs. Analysis displays phase progress and the number of API rows loaded.

## Google setup

1. In Google Cloud Console, enable **Google Search Console API**.
2. Configure the OAuth consent screen.
3. Create an **OAuth client ID → Web application**.
4. Add the deployed GitHub Pages origin (for example `https://username.github.io`) under **Authorized JavaScript origins**.
5. Open the tool, paste the client ID, and connect.

The client ID is stored in local browser storage. OAuth access tokens and GSC data remain in memory; there is no backend or database. Never use a service-account JSON file in this web app.

## Publish

Push this repository to GitHub, then choose **Settings → Pages → Source → GitHub Actions**. The included workflow deploys every push to `main`.

## Local preview

```bash
python3 -m http.server 8000
```

Add `http://localhost:8000` as an authorized JavaScript origin for local OAuth testing.
