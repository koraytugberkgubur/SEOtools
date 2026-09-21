#!/usr/bin/env python3
"""SEO-oriented fuzzy redirect mapper and redirect-chain auditor.

Uses only the Python standard library so it can be dropped into any crawl workflow.
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, unquote, urljoin, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler


TOKEN_RE = re.compile(r"[a-z0-9]+")
TRACKING_KEYS = {"gclid", "fbclid", "msclkid", "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"}
INVALID_PERCENT_RE = re.compile(r"%(?![0-9a-fA-F]{2})")
STOPWORDS = {"and", "the", "for", "with", "from", "page", "blog", "product", "products", "category", "www", "html", "http", "https"}
HEADER_ALIASES = {
    "url": {"url", "address", "page", "page url", "landing page", "source url", "original url", "internal url", "uri"},
    "status": {"status", "status code", "http status", "http status code", "response", "response code", "http code", "statuscode"},
    "title": {"title", "title 1", "title tag", "page title", "meta title"},
    "h1": {"h1", "h1 1", "heading 1"},
    "description": {"meta description", "description", "meta description 1"},
    "content_type": {"content type", "mime type", "contenttype"},
}
TYPE_ORDER = {"html": 0, "image": 1, "other": 2, "css": 3, "js": 4, "font": 5}


@dataclass(frozen=True)
class Page:
    url: str
    title: str = ""
    status: int | None = None
    h1: str = ""
    description: str = ""
    content_type: str = ""


@dataclass(frozen=True)
class SkippedUrl:
    row: int
    url: str
    status: str
    reason: str


@dataclass
class CrawlData:
    sources: list[Page]
    targets: list[Page]
    all_pages: list[Page]
    skipped: list[SkippedUrl]
    ignored_count: int


@dataclass
class Suggestion:
    record_type: str
    source_url: str
    source_status: int
    url_type: str
    destination_url: str
    destination_status: int
    source_folder: str
    destination_folder: str
    folder_direction: str
    score: float
    strongest_signal: str
    confidence: str
    csv_row: str = ""
    notes: str = ""


@dataclass
class Match:
    source_url: str
    destination_url: str
    score: float
    confidence: str
    path_score: float
    slug_score: float
    token_score: float
    title_score: float
    notes: str


@dataclass
class Hop:
    url: str
    status: int | None
    location: str = ""
    error: str = ""


def normalized_parts(url: str) -> tuple[str, str, list[str], set[str]]:
    parsed = urlsplit(url.strip())
    path = unquote(parsed.path).lower().strip("/")
    segments = [s for s in path.split("/") if s]
    slug = segments[-1] if segments else ""
    words = set(TOKEN_RE.findall(" ".join(segments)))
    words.update(v.lower() for k, v in parse_qsl(parsed.query) if k.lower() not in TRACKING_KEYS)
    return parsed.netloc.lower().removeprefix("www."), path, segments, words


def normalize_header(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_-]+", " ", value.lstrip("\ufeff").strip().lower()))


def column_index(headers: list[str], name: str) -> int:
    aliases = HEADER_ALIASES[name]
    for index, header in enumerate(headers):
        if header in aliases:
            return index
    patterns = {
        "url": r"(^|\s)(url|uri|address)(\s|$)",
        "status": r"(^|\s)(status|response)(\s|$)",
        "title": r"(^|\s)title(\s|$)",
        "h1": r"^h\s*1(?:\s|$)",
        "description": r"(^|\s)description(\s|$)",
        "content_type": r"(^|\s)(content type|mime type)(\s|$)",
    }
    return next((index for index, header in enumerate(headers) if re.search(patterns[name], header)), -1)


def decode_csv(path: Path) -> str:
    data = path.read_bytes()
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        return data.decode("utf-16")
    sample = data[:200]
    odd_nulls = sum(byte == 0 for byte in sample[1::2])
    even_nulls = sum(byte == 0 for byte in sample[0::2])
    if odd_nulls > len(sample) / 8:
        return data.decode("utf-16-le")
    if even_nulls > len(sample) / 8:
        return data.decode("utf-16-be")
    return data.decode("utf-8-sig")


def csv_rows(text: str) -> list[list[str]]:
    declared = re.match(r"^\ufeff?sep=(.)\r?\n", text, flags=re.IGNORECASE)
    if declared:
        delimiter = declared.group(1)
    else:
        try:
            delimiter = csv.Sniffer().sniff(text[:65536], delimiters=",;\t").delimiter
        except csv.Error:
            counts = {candidate: text.splitlines()[0].count(candidate) for candidate in ",;\t"}
            delimiter = max(counts, key=counts.get)
    return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter) if any(cell.strip() for cell in row)]


def validate_http_url(value: str) -> None:
    if INVALID_PERCENT_RE.search(value):
        raise ValueError("Invalid percent encoding")
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or not parsed.hostname:
        raise ValueError("Invalid absolute HTTP(S) URL")


def parse_status(value: str) -> int | None:
    match = re.search(r"\b[1-5]\d\d\b", value)
    return int(match.group()) if match else None


def load_crawl(path: Path) -> CrawlData:
    rows = csv_rows(decode_csv(path))
    if len(rows) < 2:
        raise ValueError(f"{path} has no data rows")
    header_row = -1
    for row_number, row in enumerate(rows[:20]):
        candidate = [normalize_header(cell) for cell in row]
        if column_index(candidate, "url") >= 0 and column_index(candidate, "status") >= 0:
            header_row = row_number
            break
    if header_row < 0:
        found = ", ".join(normalize_header(cell) for cell in rows[0][:6] if cell.strip()) or "no headers"
        raise ValueError(f"Could not identify URL and status columns. Found: {found}")
    headers = [normalize_header(cell) for cell in rows[header_row]]
    indexes = {name: column_index(headers, name) for name in HEADER_ALIASES}
    pages: list[Page] = []
    skipped: list[SkippedUrl] = []

    def cell(columns: list[str], name: str) -> str:
        index = indexes[name]
        return columns[index].strip() if index >= 0 and index < len(columns) else ""

    for offset, columns in enumerate(rows[header_row + 1:]):
        raw_url = cell(columns, "url")
        raw_status = cell(columns, "status")
        if not raw_url:
            continue
        try:
            validate_http_url(raw_url)
        except (ValueError, UnicodeError) as exc:
            skipped.append(SkippedUrl(header_row + offset + 2, raw_url, raw_status, str(exc)))
            continue
        status = parse_status(raw_status)
        if status is None:
            continue
        pages.append(Page(raw_url, cell(columns, "title"), status, cell(columns, "h1"),
                          cell(columns, "description"), cell(columns, "content_type")))

    unique = list({page.url: page for page in pages}.values())
    sources = [page for page in unique if page.status in {404, 410}]
    targets = [page for page in unique if page.status is not None and 200 <= page.status < 300]
    if not sources:
        raise ValueError("No 404 or 410 rows were found")
    if not targets:
        raise ValueError("No 2xx destination rows were found")
    return CrawlData(sources, targets, unique, skipped, len(unique) - len(sources) - len(targets))


def url_type(page: Page) -> str:
    content_type = page.content_type.lower()
    path = urlsplit(page.url).path.lower()
    if "text/css" in content_type or re.search(r"\.css(?:$|/)", path):
        return "css"
    if re.search(r"javascript|ecmascript", content_type) or re.search(r"\.(?:js|mjs|cjs)(?:$|/)", path):
        return "js"
    if "font" in content_type or re.search(r"\.(?:woff2?|ttf|otf|eot)(?:$|/)", path):
        return "font"
    if content_type.startswith("image/") or re.search(r"\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|/)", path):
        return "image"
    if not content_type or "html" in content_type or re.search(r"\.(?:html?|php)(?:$|/)", path):
        return "html"
    return "other"


def parent_folder(url: str) -> str:
    segments = [part for part in urlsplit(url).path.strip("/").split("/") if part]
    return f"/{'/'.join(segments[:-1])}/" if len(segments) > 1 else "/"


def text_words(value: str) -> set[str]:
    return {word for word in TOKEN_RE.findall(value.lower()) if len(word) > 1}


def trigrams(value: str) -> set[str]:
    clean = re.sub(r"[^a-z0-9]", "", value.lower())
    if len(clean) < 3:
        return {clean} if clean else set()
    return {clean[index:index + 3] for index in range(len(clean) - 2)}


def ratio(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a or b else 1.0


def score_pages(source: Page, target: Page) -> tuple[float, dict[str, float]]:
    shost, spath, ssegments, swords = normalized_parts(source.url)
    thost, tpath, tsegments, twords = normalized_parts(target.url)
    slug = ratio(ssegments[-1] if ssegments else "", tsegments[-1] if tsegments else "")
    path = ratio(spath, tpath)
    tokens = jaccard(swords, twords)
    title = ratio(source.title.lower(), target.title.lower()) if source.title and target.title else tokens
    depth = 1.0 - min(abs(len(ssegments) - len(tsegments)) / 4, 1.0)
    host_bonus = 0.03 if shost == thost else 0.0
    total = min(1.0, 0.38 * slug + 0.25 * tokens + 0.17 * path + 0.12 * title + 0.08 * depth + host_bonus)
    return total, {"path": path, "slug": slug, "tokens": tokens, "title": title}


def best_matches(sources: Iterable[Page], targets: list[Page], threshold: float = 0.45) -> list[Match]:
    results: list[Match] = []
    for source in sources:
        candidates = sorted(((score_pages(source, t), t) for t in targets if t.url != source.url), key=lambda x: x[0][0], reverse=True)
        if not candidates:
            results.append(Match(source.url, "", 0, "none", 0, 0, 0, 0, "No destination candidates"))
            continue
        (score, parts), target = candidates[0]
        runner_up = candidates[1][0][0] if len(candidates) > 1 else 0
        confidence = "high" if score >= 0.78 and score - runner_up >= 0.08 else "medium" if score >= 0.60 else "low"
        notes = []
        if score < threshold:
            confidence, target = "review", Page("")
            notes.append("Below approval threshold")
        elif score - runner_up < 0.05:
            notes.append("Close alternative; review manually")
        if target.status and target.status >= 300:
            notes.append(f"Destination status is {target.status}")
        results.append(Match(source.url, target.url, round(score * 100, 1), confidence,
                             round(parts["path"] * 100, 1), round(parts["slug"] * 100, 1),
                             round(parts["tokens"] * 100, 1), round(parts["title"] * 100, 1), "; ".join(notes)))
    return results


def detailed_score(source: Page, target: Page) -> tuple[float, str]:
    shost, spath, ssegments, swords = normalized_parts(source.url)
    thost, tpath, tsegments, twords = normalized_parts(target.url)
    signals = {
        "URL slug": ratio(ssegments[-1] if ssegments else "", tsegments[-1] if tsegments else ""),
        "URL topics": len(swords & twords) / len(swords | twords) if swords or twords else 0.0,
        "URL path": ratio(spath, tpath),
        "Title tag": ratio(source.title.lower(), target.title.lower()) if source.title and target.title else 0.0,
        "H1": ratio(source.h1.lower(), target.h1.lower()) if source.h1 and target.h1 else 0.0,
        "Meta description": len(text_words(source.description) & text_words(target.description)) /
                            len(text_words(source.description) | text_words(target.description))
                            if source.description and target.description else 0.0,
    }
    weights = {"URL slug": 0.30, "URL topics": 0.22, "URL path": 0.15,
               "Title tag": 0.20, "H1": 0.08, "Meta description": 0.05}
    available = {"URL slug", "URL topics", "URL path"}
    if source.title and target.title:
        available.add("Title tag")
    if source.h1 and target.h1:
        available.add("H1")
    if source.description and target.description:
        available.add("Meta description")
    used_weight = sum(weights[name] for name in available)
    total = sum(weights[name] * signals[name] for name in available) / used_weight
    if shost == thost:
        total += 0.03
    strongest = max(available, key=lambda name: signals[name])
    return min(1.0, total), f"{strongest} {round(signals[strongest] * 100)}%"


def page_features(page: Page, parts: tuple[str, str, list[str], set[str]]) -> set[str]:
    features = set(parts[3]) | text_words(page.title) | text_words(page.h1)
    return {token for token in features if token not in STOPWORDS}


def build_target_index(targets: list[Page]) -> dict:
    target_parts = [normalized_parts(target.url) for target in targets]
    token_index: dict[str, list[int]] = defaultdict(list)
    gram_index: dict[str, list[int]] = defaultdict(list)
    directory_index: dict[str, list[int]] = defaultdict(list)
    type_index: dict[str, list[int]] = defaultdict(list)
    for target_index, (target, parts) in enumerate(zip(targets, target_parts)):
        for token in page_features(target, parts):
            token_index[token].append(target_index)
        for gram in trigrams(parts[2][-1] if parts[2] else ""):
            gram_index[gram].append(target_index)
        directory_index[parts[2][0] if parts[2] else ""].append(target_index)
        type_index[url_type(target)].append(target_index)
    return {"parts": target_parts, "tokens": token_index, "grams": gram_index,
            "directories": directory_index, "types": type_index}


def shortlist(source: Page, source_parts: tuple[str, str, list[str], set[str]], targets: list[Page], index: dict) -> list[int]:
    if len(targets) <= 2000:
        candidates = list(range(len(targets)))
    else:
        quick_scores: dict[int, int] = defaultdict(int)
        for token in page_features(source, source_parts):
            for target_index in index["tokens"].get(token, []):
                quick_scores[target_index] += 4
        for gram in trigrams(source_parts[2][-1] if source_parts[2] else ""):
            for target_index in index["grams"].get(gram, []):
                quick_scores[target_index] += 1
        directory = source_parts[2][0] if source_parts[2] else ""
        for target_index in index["directories"].get(directory, []):
            quick_scores[target_index] += 2
        candidates = [target_index for target_index, _ in
                      sorted(quick_scores.items(), key=lambda item: item[1], reverse=True)[:250]]
        if len(candidates) < 100:
            selected = set(candidates)
            step = max(1, len(targets) // 150)
            for target_index in range(0, len(targets), step):
                selected.add(target_index)
                if len(selected) >= 250:
                    break
            candidates = list(selected)
    same_type = set(index["types"].get(url_type(source), []))
    typed = [target_index for target_index in candidates if target_index in same_type]
    return typed or list(same_type)[:250] or candidates


def create_suggestions(crawl: CrawlData, threshold: float = 45.0, show_progress: bool = True) -> list[Suggestion]:
    if show_progress:
        print(f"Indexing {len(crawl.targets):,} live URLs...", file=sys.stderr)
    index = build_target_index(crawl.targets)
    suggestions: list[Suggestion] = []
    total_sources = len(crawl.sources)
    for source_number, source in enumerate(crawl.sources, start=1):
        source_parts = normalized_parts(source.url)
        best: tuple[float, str, Page] | None = None
        runner_up_score = 0.0
        for target_index in shortlist(source, source_parts, crawl.targets, index):
            target = crawl.targets[target_index]
            score, strongest = detailed_score(source, target)
            if best is None or score > best[0]:
                runner_up_score = best[0] if best else 0.0
                best = (score, strongest, target)
            elif score > runner_up_score:
                runner_up_score = score
        if best is None:
            continue
        score, strongest, target = best
        score_percent = round(score * 100, 1)
        gap = score - runner_up_score
        confidence = "review" if score_percent < threshold else "high" if score_percent >= 78 and gap >= 0.08 else "medium" if score_percent >= 60 else "low"
        source_dir, target_dir = parent_folder(source.url), parent_folder(target.url)
        suggestions.append(Suggestion("redirect_suggestion", source.url, source.status or 0, url_type(source),
                                      target.url, target.status or 0, source_dir, target_dir,
                                      f"{source_dir} → {target_dir}", score_percent, strongest, confidence))
        if show_progress and (source_number % 25 == 0 or source_number == total_sources):
            print(f"\rMatched {source_number:,}/{total_sources:,} broken URLs", end="", file=sys.stderr, flush=True)
    if show_progress:
        print(file=sys.stderr)
    suggestions.sort(key=lambda suggestion: TYPE_ORDER[suggestion.url_type])
    return suggestions


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def audit_chain(url: str, max_hops: int = 10, timeout: float = 10) -> list[Hop]:
    opener = build_opener(NoRedirect)
    seen: set[str] = set()
    hops: list[Hop] = []
    current = url
    for _ in range(max_hops + 1):
        if current in seen:
            hops.append(Hop(current, None, error="Redirect loop detected"))
            break
        seen.add(current)
        try:
            req = Request(current, headers={"User-Agent": "RedirectMapper/1.0 (+SEO audit)"}, method="HEAD")
            try:
                response = opener.open(req, timeout=timeout)
                status, headers = response.status, response.headers
            except HTTPError as exc:
                status, headers = exc.code, exc.headers
            if status in {301, 302, 303, 307, 308}:
                location = urljoin(current, headers.get("Location", ""))
                hops.append(Hop(current, status, location))
                if not location:
                    break
                current = location
            else:
                hops.append(Hop(current, status))
                break
        except (URLError, TimeoutError, ValueError) as exc:
            hops.append(Hop(current, None, error=str(exc)))
            break
    else:
        hops.append(Hop(current, None, error=f"More than {max_hops} redirects"))
    return hops


def load_pages(path: Path) -> list[Page]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = csv.DictReader(handle)
        if not rows.fieldnames or "url" not in {h.lower() for h in rows.fieldnames}:
            raise ValueError(f"{path} must contain a 'url' column")
        keymap = {h.lower(): h for h in rows.fieldnames}
        pages = []
        for row in rows:
            url = row.get(keymap["url"], "").strip()
            if url:
                raw_status = row.get(keymap.get("status", ""), "").strip()
                pages.append(Page(url, row.get(keymap.get("title", ""), "").strip(), int(raw_status) if raw_status.isdigit() else None))
        return pages


def write_csv(path: Path, rows: Iterable[dict]) -> None:
    rows = list(rows)
    if not rows:
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)


def command_map(args: argparse.Namespace) -> int:
    matches = best_matches(load_pages(args.sources), load_pages(args.destinations), args.threshold)
    write_csv(args.output, (asdict(m) for m in matches))
    print(f"Wrote {len(matches)} recommendations to {args.output}")
    return 0


def command_crawl(args: argparse.Namespace) -> int:
    crawl = load_crawl(args.input)
    print(f"Read {len(crawl.all_pages):,} valid URLs: {len(crawl.sources):,} broken, "
          f"{len(crawl.targets):,} live, {crawl.ignored_count:,} other statuses, "
          f"{len(crawl.skipped):,} malformed skipped", file=sys.stderr)
    suggestions = create_suggestions(crawl, args.threshold, not args.quiet)
    rows = [asdict(suggestion) for suggestion in suggestions]
    rows.extend({
        "record_type": "skipped_malformed", "source_url": skipped.url, "source_status": skipped.status,
        "url_type": "malformed", "destination_url": "", "destination_status": "",
        "source_folder": "", "destination_folder": "", "folder_direction": "", "score": "",
        "strongest_signal": "", "confidence": "skipped", "csv_row": skipped.row, "notes": skipped.reason,
    } for skipped in crawl.skipped)
    write_csv(args.output, rows)
    print(f"Wrote {len(suggestions):,} suggestions and {len(crawl.skipped):,} skipped records to {args.output}")
    return 0


def command_audit(args: argparse.Namespace) -> int:
    pages = load_pages(args.input)
    output = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = {pool.submit(audit_chain, p.url, args.max_hops, args.timeout): p.url for p in pages}
        for future in as_completed(pending):
            url = pending[future]
            hops = future.result()
            output.append({"url": url, "final_url": hops[-1].url, "final_status": hops[-1].status or "",
                           "redirect_count": sum(h.status in {301, 302, 303, 307, 308} for h in hops),
                           "has_loop": any("loop" in h.error.lower() for h in hops),
                           "chain": " -> ".join(f"{h.url} [{h.status or h.error}]" for h in hops)})
            time.sleep(args.delay)
    write_csv(args.output, output)
    print(f"Wrote {len(output)} chain audits to {args.output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Map 404 URLs to relevant destinations and audit redirect chains.")
    sub = parser.add_subparsers(dest="command", required=True)
    crawler = sub.add_parser("crawl", help="Process one complete crawl export (recommended)")
    crawler.add_argument("input", type=Path, help="Crawl CSV containing URL and status-code columns")
    crawler.add_argument("-o", "--output", type=Path, default=Path("redirect-map.csv"))
    crawler.add_argument("--threshold", type=float, default=45.0, help="Review threshold from 0 to 100 (default: 45)")
    crawler.add_argument("--quiet", action="store_true", help="Hide matching progress")
    crawler.set_defaults(func=command_crawl)
    mapper = sub.add_parser("map", help="Create fuzzy redirect recommendations")
    mapper.add_argument("sources", type=Path, help="CSV of broken URLs; columns: url, optional title")
    mapper.add_argument("destinations", type=Path, help="CSV of live URLs; columns: url, optional title/status")
    mapper.add_argument("-o", "--output", type=Path, default=Path("redirect-map.csv"))
    mapper.add_argument("--threshold", type=float, default=0.45, help="Minimum 0–1 score for a recommendation")
    mapper.set_defaults(func=command_map)
    audit = sub.add_parser("audit", help="Follow HTTP redirects and report chains/loops")
    audit.add_argument("input", type=Path, help="CSV with a url column")
    audit.add_argument("-o", "--output", type=Path, default=Path("redirect-audit.csv"))
    audit.add_argument("--workers", type=int, default=5)
    audit.add_argument("--max-hops", type=int, default=10)
    audit.add_argument("--timeout", type=float, default=10)
    audit.add_argument("--delay", type=float, default=0)
    audit.set_defaults(func=command_audit)
    return parser


if __name__ == "__main__":
    try:
        parsed_args = build_parser().parse_args()
        sys.exit(parsed_args.func(parsed_args))
    except (ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(2)
