# Simple SOP: Choose a title for each unscramble page

**Use the wording people search for most often at the beginning of the title.** If both types of searches are common, include both phrases.

Run the decision separately for every `/anagram/[word]` page. Keep one title per page.

## 1. Get two inputs

| Input | Where it comes from | What we need |
|---|---|---|
| Search data | BigQuery / Search Console | Each page’s queries and impressions over the last 56 complete days |
| Page data | Your website / word engine | URL, word, current title, actual result count, and last title-change date |

**The number in the title is the number of valid words the page actually returns.** It is not impressions or search volume.

## 2. Put searches into two groups

For a page about **LOVE**:

| Search | Group |
|---|---|
| `unscramble love` or `love unscrambler` | Unscramble |
| `words from love` or `words using love` | Words from |
| `unscramble love words from love` | Split its impressions equally between both groups |

Leave unclear searches out of these two groups. Examples: `love`, `love meaning`, `3 letter words from love`, or searches for a different word. Keep their impressions in the report so we can see how much demand is unclear.

**Count impressions, not the number of different queries.** A query with 1,000 impressions contributes more than a query with 10 impressions.

## 3. Choose the title

Calculate each group’s share of the impressions assigned to those two groups.

| What the data shows | Title to recommend |
|---|---|
| Unscramble is 85% or more | **T2:** `Unscramble [WORD]` |
| Unscramble is 60% to less than 85% | **T1:** `Unscramble [WORD]: [N] Words from [WORD]` |
| Words from is 60% to less than 85% | **T3:** `[N] Words from [WORD]: Unscramble [WORD]` |
| Words from is 85% or more | **T4:** `[N] Words from [WORD]` |
| Neither reaches 60% | Keep the current title |

**Example:** A page receives 700 impressions from unscramble searches and 300 from words-from searches. Unscramble represents 70%, so recommend T1.

If the page actually returns 12 words, that title becomes:

> Unscramble LOVE: 12 Words from LOVE

The count above is an example, not a verified count for LOVE.

## 4. Check before recommending a change

Split the 56 days into two 28-day periods. Apply the table to each period separately.

Recommend a change only when:

- Both periods choose the same title version.
- Each period has at least 500 impressions with known query text, spread across at least 14 days with impressions.
- Known query text covers at least 70% of all impressions, and the two groups cover at least 70% of known-query impressions.
- The title has not changed within the last 56 days.
- The page works, is indexable, and is the intended main URL for that word.
- Any number used in the title matches the page’s current results.

The script also checks country and device groups. If a group has enough evidence to pass the same data checks but recommends a different title, it keeps the current title for review.

**If a check fails, keep the current title.** Do not force a recommendation for every page.

## 5. Implement the first version

Give the developer these three tasks:

1. **Export the search data.** Run [query-evidence.sql](query-evidence.sql) in BigQuery and save the full result as `evidence.csv`.
2. **Export the page data.** Create `pages.csv` using the fields below.
3. **Run the decision script.** It produces a recommendation and reason for each page.

| Field in pages.csv | Meaning |
|---|---|
| `url` | Main URL of the page |
| `word` | Letters in the page, such as `love` |
| `current_title` | Title currently on the page |
| `word_count` | Actual number of valid results |
| `count_verified` | `true` if that count was checked; otherwise `false` |
| `eligible` | `true` if the page passes the page checks above and is not in another title test |
| `last_changed` | Last title-change date, such as `2026-06-01`; blank only if confirmed never changed |

Run from the repository folder, with both CSV files in that folder:

```bash
python3 title-automation/decide_titles.py \
  --evidence evidence.csv \
  --pages pages.csv \
  --end-date 2026-09-04 \
  --output recommendations.jsonl
```

Replace the example date with the latest complete date used in the BigQuery export. In the SQL, replace `PROJECT.DATASET` and set `end_date` to that same date. Set `country` and `device` to empty strings to include all traffic. Check export completeness before running. More detail is in the [developer reference](TECHNICAL-REFERENCE.md).

The output has three possible results:

| Result | What to do |
|---|---|
| `PROPOSE_TEST` | Review and test the suggested title |
| `UNCHANGED` | The current title already matches |
| `HOLD` | Keep the current title; the report explains why |

## 6. Test, then automate

Start with a test batch and a comparable group of pages whose titles stay unchanged. Save every old title. Keep other page changes stable during the test.

Compare click changes between the two groups, allowing for their performance before the test. Set the test duration and required improvement before starting. Keep the existing title when the result is unclear.

Once a rule has demonstrated improvement, the developer can connect the output to the website’s title field. Run recommendations weekly, skip pages in an active test, and save the old title and change date every time. If data is missing or a count is wrong, keep the existing title.

**Current status:** The SQL and recommendation script are ready locally. Dataset connection, scheduled runs, and website publishing still need to be connected. The percentages above are starting rules to test; they have not yet been validated against your live data.
