# Domain Ledger — Domain Expiry Checker

A privacy-friendly browser tool that checks domain expiration dates from an
XLSX, XLS, or CSV file using public RDAP registry data.

## Live tool

**https://ktg1.github.io/domain-expiry-checker/**

## How it works

1. Open the live page and choose a spreadsheet.
2. Select the worksheet and domain column.
3. Check the domains and download the enriched XLSX workbook.

The spreadsheet is parsed locally in the browser. It is not uploaded to this
project or another application server. Individual domain names are sent to the
public `rdap.org` bootstrap service to retrieve registration records.

The exported workbook adds:

- normalized domain
- `YES`, `NO`, or `UNKNOWN` expired indicator
- registry expiration timestamp
- days until expiry
- status such as `ACTIVE`, `EXPIRING_SOON`, or `REDEMPTION_PERIOD`
- check timestamp, RDAP source URL, and any error

## Run locally

Because browser security rules apply to local files, serve the directory:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Limitations

RDAP reports registry data, not registrar billing state. Auto-renewal, grace
periods, auctions, and registrar-specific policies may change the practical
status of a domain. Confirm valuable domains with the sponsoring registrar.

The page loads SheetJS and Google Fonts from public CDNs and needs an internet
connection for both those assets and RDAP checks.

## License

MIT
