"""Build the browser dictionary from the public-domain Webster web2 word list."""

from pathlib import Path
import json

SOURCE = Path("/usr/share/dict/web2")
OUTPUT = Path(__file__).resolve().parents[1] / "dictionary.js"

words = {"a", "i"}
for raw_word in SOURCE.read_text(encoding="utf-8", errors="ignore").splitlines():
    word = raw_word.strip()
    if word.isascii() and word.isalpha() and word.islower() and 2 <= len(word) <= 32:
        words.add(word)

payload = json.dumps(sorted(words), separators=(",", ":"))
OUTPUT.write_text(
    "// Generated from the public-domain Webster web2 word list.\n"
    f"window.ENGLISH_DICTIONARY = new Set({payload});\n",
    encoding="utf-8",
)
print(f"Wrote {len(words):,} words to {OUTPUT}")
