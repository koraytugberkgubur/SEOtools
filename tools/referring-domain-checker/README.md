# Link Ledger

Link Ledger is a local-first referring-domain checker. Import Semrush and Ahrefs exports to build a remembered inventory, then paste or upload prospect domains to see which links you already have and which are still opportunities.

## Features

- Imports CSV, TSV, and TXT exports from Semrush and Ahrefs
- Detects common domain and referring-page columns
- Normalizes URLs, removes `www.`, and deduplicates domains
- Persists the inventory in browser storage
- Checks pasted or uploaded prospect lists
- Copies missing domains or downloads all results as CSV
- Keeps link data on the device; no server or account required

## Run locally

```bash
npm run dev
```

Open [http://localhost:4173](http://localhost:4173).

## Test

```bash
npm test
```

## Data format

Exports may contain a column named `Referring Domain`, `Domain`, `Source Domain`, `Source URL`, or `Referring page URL`. Plain one-domain-per-line lists also work.

## Privacy and storage

Imported data is stored in `localStorage` in the current browser. Clearing browser site data or selecting **Clear inventory** removes it. For shared-team or multi-device persistence, a database-backed version would be the next step.

## License

MIT
