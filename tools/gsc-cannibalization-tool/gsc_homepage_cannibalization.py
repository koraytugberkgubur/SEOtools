#!/usr/bin/env python3
"""Find queries receiving impressions for both a site's homepage and sub-pages."""

import argparse
import csv
from collections import defaultdict
from datetime import date, timedelta
from urllib.parse import urlsplit, urlunsplit

from google.auth import default
from google.oauth2 import service_account
from googleapiclient.discovery import build


SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"


def homepage_for(property_url: str) -> str:
    if property_url.startswith("sc-domain:"):
        return f"https://{property_url.removeprefix('sc-domain:').strip('/')}/"
    parts = urlsplit(property_url)
    return urlunsplit((parts.scheme, parts.netloc, "/", "", ""))


def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, "", ""))


def get_service(credentials_file: str | None):
    if credentials_file:
        credentials = service_account.Credentials.from_service_account_file(
            credentials_file, scopes=[SCOPE]
        )
    else:
        credentials, _ = default(scopes=[SCOPE])
    return build("searchconsole", "v1", credentials=credentials, cache_discovery=False)


def fetch_rows(service, site_url: str, start_date: str, end_date: str):
    start_row = 0
    while True:
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["query", "page"],
            "type": "web",
            "dataState": "final",
            "rowLimit": 25000,
            "startRow": start_row,
        }
        rows = (
            service.searchanalytics()
            .query(siteUrl=site_url, body=body)
            .execute()
            .get("rows", [])
        )
        yield from rows
        if len(rows) < body["rowLimit"]:
            break
        start_row += len(rows)


def analyze(rows, homepage: str, min_mutual_impressions: float):
    home = normalize_url(homepage)
    by_query = defaultdict(lambda: {"home": 0.0, "pages": defaultdict(float)})

    for row in rows:
        query, page = row["keys"]
        impressions = float(row.get("impressions", 0))
        if normalize_url(page) == home:
            by_query[query]["home"] += impressions
        else:
            by_query[query]["pages"][page] += impressions

    results = []
    for query, data in by_query.items():
        home_impressions = data["home"]
        if not home_impressions:
            continue
        for page, page_impressions in data["pages"].items():
            mutual = min(home_impressions, page_impressions)
            if mutual >= min_mutual_impressions:
                results.append(
                    {
                        "query": query,
                        "homepage": homepage,
                        "subpage": page,
                        "homepage_impressions": round(home_impressions, 2),
                        "subpage_impressions": round(page_impressions, 2),
                        "mutual_impressions": round(mutual, 2),
                        "common_impression_percentage": round(
                            200 * mutual / (home_impressions + page_impressions), 2
                        ),
                        "total_impressions": round(home_impressions + page_impressions, 2),
                        "homepage_share": round(
                            home_impressions / (home_impressions + page_impressions), 4
                        ),
                    }
                )
    return sorted(results, key=lambda item: item["mutual_impressions"], reverse=True)


def main():
    today = date.today()
    parser = argparse.ArgumentParser()
    parser.add_argument("site_url", help="GSC property, e.g. https://example.com/ or sc-domain:example.com")
    parser.add_argument("--credentials", help="Service-account JSON; otherwise uses ADC")
    parser.add_argument("--start-date", default=str(today - timedelta(days=90)))
    parser.add_argument("--end-date", default=str(today - timedelta(days=3)))
    parser.add_argument("--homepage", help="Override the inferred homepage URL")
    parser.add_argument("--min-mutual-impressions", type=float, default=10)
    parser.add_argument("--output", default="homepage_cannibalization.csv")
    args = parser.parse_args()

    homepage = args.homepage or homepage_for(args.site_url)
    service = get_service(args.credentials)
    results = analyze(
        fetch_rows(service, args.site_url, args.start_date, args.end_date),
        homepage,
        args.min_mutual_impressions,
    )

    fields = [
        "query", "homepage", "subpage", "homepage_impressions",
        "subpage_impressions", "mutual_impressions", "common_impression_percentage", "total_impressions",
        "homepage_share",
    ]
    with open(args.output, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(results)
    print(f"Wrote {len(results)} rows to {args.output}")


if __name__ == "__main__":
    main()
