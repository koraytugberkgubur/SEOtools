import tempfile
import unittest
from pathlib import Path

from url_redirect_mapper import Page, best_matches, create_suggestions, load_crawl, load_pages, normalized_parts


class RedirectMapperTests(unittest.TestCase):
    def test_normalization_ignores_tracking(self):
        _, path, _, words = normalized_parts("https://www.example.com/Blog/Blue-Shoes/?utm_source=x&q=summer")
        self.assertEqual(path, "blog/blue-shoes")
        self.assertIn("summer", words)
        self.assertNotIn("x", words)

    def test_best_semantic_path_wins(self):
        result = best_matches(
            [Page("https://shop.test/mens/running-shoes")],
            [Page("https://shop.test/women/dresses"), Page("https://shop.test/men/running-shoe-guide")],
        )[0]
        self.assertEqual(result.destination_url, "https://shop.test/men/running-shoe-guide")
        self.assertGreater(result.score, 60)

    def test_csv_requires_url(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.csv"
            path.write_text("address\nhttps://example.com\n")
            with self.assertRaises(ValueError):
                load_pages(path)

    def test_single_crawl_skips_malformed_and_groups_assets(self):
        crawl_csv = """URL;Status Code;Title;Content Type
https://example.test/old/page;404;Old page;text/html
https://example.test/new/page;200;New page;text/html
https://example.test/old/site.css;404;;text/css
https://example.test/assets/site.css;200;;text/css
https://example.test/old/app.js;404;;application/javascript
https://example.test/assets/app.js;200;;application/javascript
https://example.test/old/font.woff2;404;;font/woff2
https://example.test/fonts/font.woff2;200;;font/woff2
https://example.test/bad%ZZ-url;404;Bad;text/html
"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "crawl.csv"
            path.write_text(crawl_csv, encoding="utf-8")
            crawl = load_crawl(path)
        self.assertEqual(len(crawl.sources), 4)
        self.assertEqual(len(crawl.targets), 4)
        self.assertEqual(len(crawl.skipped), 1)
        self.assertEqual(crawl.skipped[0].row, 10)
        suggestions = create_suggestions(crawl, show_progress=False)
        self.assertEqual([item.url_type for item in suggestions], ["html", "css", "js", "font"])
        self.assertEqual(suggestions[0].folder_direction, "/old/ → /new/")
        self.assertTrue(all(item.url_type in item.destination_url or item.url_type == "html" or
                            (item.url_type == "font" and "/fonts/" in item.destination_url)
                            for item in suggestions))

    def test_utf16_tab_crawl(self):
        content = "URL\tResponse Code\nhttps://example.test/old\t404 Not Found\nhttps://example.test/new\t200 OK\n"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "crawl.csv"
            path.write_bytes(b"\xff\xfe" + content.encode("utf-16-le"))
            crawl = load_crawl(path)
        self.assertEqual(len(crawl.sources), 1)
        self.assertEqual(len(crawl.targets), 1)


if __name__ == "__main__":
    unittest.main()
