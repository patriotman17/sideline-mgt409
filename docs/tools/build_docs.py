"""Build the self-contained report.html and slides.html at the repo root.

Every <img src="assets/NAME.png"> in docs/report/report.src.html and docs/slides/slides.src.html is resized,
re-encoded as JPEG and embedded as a data: URI, so both files work offline and when emailed.
@@SAFETY_TESTS@@ is replaced with docs/report/safety-tests.txt.

    python3 docs/tools/build_docs.py
"""

from __future__ import annotations

import base64
import html
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "docs" / "report" / "assets"


def embed(src: str, width: int) -> str:
    path = ASSETS / Path(src).name
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "img.jpg"
        subprocess.run(
            ["sips", "-Z", str(width), "-s", "format", "jpeg", "-s", "formatOptions", "78", str(path), "--out", str(out)],
            check=True,
            capture_output=True,
        )
        data = base64.b64encode(out.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{data}"


def build(source: Path, dest: Path, width: int, extra: dict[str, str] | None = None) -> None:
    text = source.read_text(encoding="utf-8")
    for key, value in (extra or {}).items():
        text = text.replace(key, value)
    cache: dict[str, str] = {}

    def repl(m: re.Match[str]) -> str:
        src = m.group(1)
        if src not in cache:
            cache[src] = embed(src, width)
        return f'src="{cache[src]}"'

    text = re.sub(r'src="(assets/[^"]+\.png)"', repl, text)
    dest.write_text(text, encoding="utf-8")
    print(f"{dest.relative_to(ROOT)}: {len(cache)} images embedded, {dest.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    tests = (ROOT / "docs" / "report" / "safety-tests.txt").read_text(encoding="utf-8").strip()
    build(ROOT / "docs/report/report.src.html", ROOT / "report.html", 760, {"@@SAFETY_TESTS@@": html.escape(tests)})
    slides = ROOT / "docs/slides/slides.src.html"
    if slides.exists():
        report_src = (ROOT / "docs/report/report.src.html").read_text(encoding="utf-8")
        svg = report_src[report_src.index("<svg") : report_src.index("</svg>") + len("</svg>")]
        # Real-user results (fill docs/user-results.json after testing); visible placeholders until then.
        import json

        results_path = ROOT / "docs" / "user-results.json"
        results = json.loads(results_path.read_text()) if results_path.exists() else {}
        build(
            slides,
            ROOT / "slides.html",
            900,
            {
                "@@DIAGRAM@@": svg.replace('id="a"', 'id="s"').replace("url(#a)", "url(#s)"),
                "@@USER_STAT@@": html.escape(results.get("stat", "TBD")),
                "@@USER_STAT_LABEL@@": html.escape(results.get("label", "faster than searching, in real-user tests")),
                "@@USER_QUOTE@@": html.escape(results.get("quote", "Real-user quote goes here after testing.")),
            },
        )
