# Query evidence behind the title classifier

Source: three Semrush US all-keyword exports pulled 2026-09-21 — seeds
`unscramble`, `words from`, `words of`. 90,009 rows, **77,882 unique keywords,
25,915,050 total monthly volume** after de-duplicating across the three files.

All figures below are volume-weighted. Impressions, not distinct query counts,
are what the decision rules use, so volume is the right weight here.

## Intent families

| Family | Keywords | Volume | Share |
|---|---:|---:|---:|
| `unscramble <slot>` | 8,090 | 2,559,040 | 9.9% |
| `<slot> unscramble(r)` | 12,906 | 2,194,890 | 8.5% |
| `word(s) unscrambler` (head) | 2 | 1,226,600 | 4.7% |
| `words with <slot>` | 664 | 792,570 | 3.1% |
| `words from <slot>` | 2,399 | 354,680 | 1.4% |
| `make words from <slot>` | 238 | 95,780 | 0.4% |
| `words using / out of <slot>` | 111 | 92,920 | 0.4% |
| `words of <slot>` | 4,004 | 1,813,600 | 7.0% |
| `N letter words …` | 5,061 | 1,915,830 | 7.4% |
| scrabble / wordle / jumble / WWF | 2,362 | 4,109,800 | 15.9% |
| meaning / definition / synonym | 6,317 | 1,144,630 | 4.4% |
| `word of the day` | 965 | 958,530 | 3.7% |

## Three corrections this produced

### 1. `words of X` must stay out of the words-from bucket

It looks like a letter-source phrasing. It is not. The top of that family:

| Volume | Keyword |
|---:|---|
| 40,500 | words of affirmation |
| 27,100 | words of encouragement |
| 9,900 | words of wisdom |
| 9,900 | word of mouth |
| 5,400 | word of god |
| 3,600 | words of sympathy |
| 2,400 | words of condolence |

19.1% of `words of` volume is explicitly sentiment vocabulary; most of the
remainder is phrases and brands (`words of wonders` is a mobile game).
`decide_titles.py` already excluded it — its regex only accepts
`from|with|using|out of`. The corpus confirms that was correct, so the
exclusion is now documented rather than incidental.

### 2. `words with friends` leaked into the words-from bucket — fixed

`words with friends` matches `\bwords? (?:from|with|…)\b`. The head term carries
90,500 US volume, and the family (helper, cheat, word finder, 2) carries far more.
Before the fix:

```
classify('words with friends love', 'love')  ->  'words'      # counted as words-from intent
classify('words with friends love', 'love')  ->  'special'    # after
```

A page picking up Words With Friends traffic would have been pushed toward T3/T4
on the strength of game queries. `jumble` and `wwf` had the same gap and are now
in the same guard. Across the corpus, **1,000 keywords / 1,061,210 volume** change
bucket under the corrected classifier.

### 3. Intent split, and what it implies for the thresholds

Restricting to genuine per-page anagram demand (slot is a real word, meta slots
like `words`/`letters`/`dictionary` removed):

| | Keywords | Volume | Share |
|---|---:|---:|---:|
| unscramble framing | 18,514 | 1,061,560 | **77.9%** |
| words-from framing | 2,056 | 301,990 | **22.1%** |

Across the 1,801 words that appear in *both* framings, the median unscramble
share is **73.3%**.

Applying the current thresholds to the 13,352 distinct words in the corpus:

| Template | Words | Share |
|---|---:|---:|
| T2 `Unscramble WORD` | 11,653 | 87.3% |
| T1 `Unscramble WORD: N Words from WORD` | 1,060 | 7.9% |
| T3 `N Words from WORD: Unscramble WORD` | 215 | 1.6% |
| T4 `N Words from WORD` | 205 | 1.5% |
| no clear leader (hold) | 219 | 1.6% |

Percentiles of the unscramble share: p10 = 0.79, p25 = 1.00, p50 = 1.00.

**Read this as a prior, not as a result.** Keyword-tool exports cap at 30,000 rows
per seed and floor at 20 monthly searches, so the words-from tail is undersampled
here in a way real Search Console data will not be. What it does establish is the
direction: unscramble framing dominates, T2 should be the common outcome, and a
page landing in T3/T4 is unusual enough to be worth a look before testing.
