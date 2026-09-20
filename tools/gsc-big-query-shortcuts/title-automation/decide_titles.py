"""Deterministic proposal generator; never writes to a website or BigQuery."""
import argparse
import csv
import json
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

VERSION = '1.0.0'


def classify(query, word):
    q = re.sub(r'[^a-z0-9]+', ' ', query.lower()).strip()
    w = word.lower()
    if not q:
        return 'anonymous'
    # Exact surface form only: do not merge distinct anagram landing pages.
    if w not in q.split():
        return 'other'
    # These intentions need matching content, not one of the four generic titles.
    if re.search(r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) letter\b|\b(starts? with|ends? with|meaning|definition|scrabble|wordle|crossword)\b', q):
        return 'special'
    u = bool(re.search(r'\bunscrambl(?:e|er|ing|ed)\b', q))
    f = bool(re.search(r'\bwords? (?:from|with|using|out of)\b|\bmake words?\b', q))
    return 'both' if u and f else 'unscramble' if u else 'words' if f else 'other'


def summarize(rows, word):
    totals = defaultdict(int)
    days = set()
    clicks = position = 0
    for r in rows:
        n = int(r['impressions'])
        totals[classify(r['query'], word)] += n
        if n > 0:
            days.add(r['data_date'])
        clicks += int(r['clicks'])
        position += float(r['sum_position'])
    all_i = sum(totals.values())
    named = all_i - totals['anonymous']
    direct = totals['unscramble'] + totals['words'] + totals['both']
    return dict(total=all_i, named=named, days=len(days), clicks=clicks,
                ctr=clicks / all_i if all_i else 0,
                position=position / all_i + 1 if all_i else None,
                coverage=named / all_i if all_i else 0,
                classified=direct / named if named else 0,
                u=(totals['unscramble'] + .5 * totals['both']) / direct if direct else 0,
                w=(totals['words'] + .5 * totals['both']) / direct if direct else 0,
                counts=dict(totals))


def candidate(s):
    if s['named'] < 500 or s['days'] < 14:
        return None, 'insufficient_evidence'
    if s['coverage'] < .70 or s['classified'] < .70:
        return None, 'insufficient_query_coverage'
    # Weights and thresholds are initial policy, not experimentally learned.
    if s['u'] >= .85:
        return 'T2', 'strong_unscramble'
    if s['u'] >= .60:
        return 'T1', 'mixed_unscramble_leading'
    if s['w'] >= .85:
        return 'T4', 'strong_words_from'
    if s['w'] >= .60:
        return 'T3', 'mixed_words_from_leading'
    return None, 'mixed_intent_no_clear_leader'


def decide(page, rows, end):
    word = page['word'].lower()
    previous = [r for r in rows if end - timedelta(days=55) <= date.fromisoformat(r['data_date']) <= end - timedelta(days=28)]
    current = [r for r in rows if end - timedelta(days=27) <= date.fromisoformat(r['data_date']) <= end]
    a, b = summarize(previous, word), summarize(current, word)
    ta, ra = candidate(a)
    tb, rb = candidate(b)
    out = dict(url=page['url'], current_title=page['current_title'], proposed_title=page['current_title'],
               candidate_template=tb or '', status='HOLD', reason=rb, rule_version=VERSION,
               end_date=end.isoformat(), previous=a, current=b)
    def hold(reason):
        out['reason'] = reason
        return out
    if not re.fullmatch(r'[a-z]+', word):
        return hold('unsupported_word')
    if not re.fullmatch(r'https?://[^/]+/anagram/' + re.escape(word) + r'/?', page['url'], re.I):
        return hold('url_word_mismatch')
    if page['eligible'].lower() != 'true':
        return hold('page_not_eligible')
    if page['last_changed'] and (end - date.fromisoformat(page['last_changed'])).days < 56:
        return hold('title_change_cooldown')
    if not tb:
        return out
    if not ta or ta != tb:
        return hold('unstable_across_windows:' + (ra if not ta else ta))
    # Segments must not have a sufficiently supported contradictory template.
    for field in ('device', 'country'):
        segments = defaultdict(list)
        for r in current:
            segments[r[field]].append(r)
        for segment, subset in segments.items():
            ts, _ = candidate(summarize(subset, word))
            if ts and ts != tb:
                return hold('segment_conflict:' + field + ':' + segment)
    n = page['word_count']
    if tb != 'T2':
        if not n.isdigit() or int(n) <= 0 or page['count_verified'].lower() != 'true':
            return hold('verified_word_count_required')
    display = word.upper()
    templates = {'T1': f'Unscramble {display}: {n} Words from {display}',
                 'T2': f'Unscramble {display}',
                 'T3': f'{n} Words from {display}: Unscramble {display}',
                 'T4': f'{n} Words from {display}'}
    title = templates[tb]
    if tb != 'T2' and int(n) == 1:
        title = title.replace('1 Words', '1 Word')
    out.update(proposed_title=title, status='UNCHANGED' if title == page['current_title'] else 'PROPOSE_TEST', reason=rb)
    return out


def read_csv(path, fields):
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        if not set(fields) <= set(reader.fieldnames or []):
            raise ValueError(f'{path}: missing columns {set(fields) - set(reader.fieldnames or [])}')
        return list(reader)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--pages', required=True)
    parser.add_argument('--end-date', type=date.fromisoformat, required=True)
    parser.add_argument('--output', required=True, help='New JSONL file; existing files are never overwritten')
    args = parser.parse_args()
    rows = read_csv(args.evidence, ['data_date', 'url', 'query', 'country', 'device', 'impressions', 'clicks', 'sum_position'])
    pages = read_csv(args.pages, ['url', 'word', 'current_title', 'word_count', 'count_verified', 'eligible', 'last_changed'])
    if len({p['url'] for p in pages}) != len(pages):
        raise ValueError('Page inventory must have exactly one row per canonical URL')
    by_url = defaultdict(list)
    for r in rows:
        date.fromisoformat(r['data_date'])
        if int(r['impressions']) < 0 or not 0 <= int(r['clicks']) <= int(r['impressions']) or float(r['sum_position']) < 0:
            raise ValueError('Invalid performance metric')
        by_url[r['url']].append(r)
    results = [decide(p, by_url[p['url']], args.end_date) for p in pages]
    with Path(args.output).open('x', encoding='utf-8') as f:
        for result in results:
            f.write(json.dumps(result, ensure_ascii=False) + '\n')
    print(f'{len(results)} decisions saved; no titles published.')


if __name__ == '__main__':
    main()
