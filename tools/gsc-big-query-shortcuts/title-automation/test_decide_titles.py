import unittest
from datetime import date, timedelta
from decide_titles import classify, decide

END = date(2026, 9, 4)


def page(**changes):
    return dict(url='https://example.com/anagram/love', word='love',
                current_title='LOVE word solver', word_count='12',
                count_verified='true', eligible='true', last_changed='', **changes)


def evidence(u=70, w=30, **changes):
    rows = []
    for i in range(56):
        for query, n in [('unscramble love', u), ('words from love', w)]:
            r = dict(data_date=(END-timedelta(days=i)).isoformat(),
                     url='https://example.com/anagram/love', query=query,
                     country='usa', device='MOBILE', impressions=str(n),
                     clicks='0', sum_position=str(n*4))
            r.update(changes)
            rows.append(r)
    return rows


class Decisions(unittest.TestCase):
    def test_four_variants(self):
        for u, w, t in [(90,10,'T2'), (70,30,'T1'), (30,70,'T3'), (10,90,'T4')]:
            result = decide(page(), evidence(u,w), END)
            self.assertEqual((result['status'], result['candidate_template']), ('PROPOSE_TEST', t))

    def test_no_data_holds(self):
        self.assertEqual(decide(page(), [], END)['status'], 'HOLD')

    def test_balanced_holds(self):
        self.assertEqual(decide(page(), evidence(50,50), END)['status'], 'HOLD')

    def test_anonymous_coverage(self):
        rows = evidence() + evidence(query='')
        self.assertEqual(decide(page(), rows, END)['reason'], 'insufficient_query_coverage')

    def test_count_missing(self):
        p = page(); p['count_verified'] = 'false'
        self.assertEqual(decide(p, evidence(), END)['reason'], 'verified_word_count_required')
        self.assertEqual(decide(p, evidence(90,10), END)['status'], 'PROPOSE_TEST')

    def test_cooldown(self):
        p = page(); p['last_changed'] = END.isoformat()
        self.assertEqual(decide(p, evidence(), END)['reason'], 'title_change_cooldown')

    def test_stability(self):
        rows = evidence()
        for r in rows:
            if date.fromisoformat(r['data_date']) <= END-timedelta(days=28):
                r['query'] = 'words from love'
        self.assertTrue(decide(page(), rows, END)['reason'].startswith('unstable'))

    def test_segment_conflict(self):
        rows = evidence(100,0) + evidence(0,30, device='DESKTOP')
        self.assertTrue(decide(page(), rows, END)['reason'].startswith('segment_conflict'))

    def test_exact_word_and_specialized_intent(self):
        for q in ['unscramble live', 'anagram love']:
            self.assertEqual(classify(q,'love'), 'other')
        for q in ['3 letter words from love', 'love meaning', 'love scrabble']:
            self.assertEqual(classify(q,'love'), 'special')
        self.assertEqual(classify('Unscramble LOVE: words from love', 'love'), 'both')

    def test_bare_letter_string(self):
        # The raw string on its own wants the page but states no framing
        # preference, so it must not count against coverage.
        self.assertEqual(classify('love', 'love'), 'bare')

    def test_generic_head_terms(self):
        for q in ('unscramble', 'unscramble words', 'word unscrambler', 'anagram'):
            self.assertEqual(classify(q, 'love'), 'generic', q)

    def test_unchanged(self):
        p = page(); p['current_title'] = 'Unscramble LOVE'
        self.assertEqual(decide(p, evidence(90,10), END)['status'], 'UNCHANGED')

    def test_url_word_mismatch(self):
        p = page(); p['word'] = 'live'
        self.assertEqual(decide(p, evidence(), END)['reason'], 'url_word_mismatch')

    def test_weighted_metrics(self):
        result = decide(page(), evidence(), END)
        self.assertEqual(result['current']['position'], 5)
        self.assertEqual(result['current']['total'], 2800)
        self.assertEqual(result['current']['u'], .7)

    def test_game_brands_are_special_not_words_from(self):
        # 'words with friends' also matches the words-from pattern; if it is not
        # excluded first, game traffic is counted as letter-source intent.
        for query in ('words with friends love', 'wwf love', 'jumble love'):
            self.assertEqual(classify(query, 'love'), 'special', query)

    def test_words_of_is_not_words_from(self):
        # 'words of X' is affirmation / encouragement / wisdom in the corpus.
        self.assertEqual(classify('words of love', 'love'), 'other')

    def test_letter_source_phrasings_still_classify(self):
        for query in ('words from love', 'words with love', 'words using love',
                      'words out of love', 'make words from love'):
            self.assertEqual(classify(query, 'love'), 'words', query)


if __name__ == '__main__':
    unittest.main()
