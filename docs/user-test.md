# Real-user test (about 15 minutes per person)

Goal: evidence for the report's Impact section (rubric: "real user evidence: quote, screenshot, or before-and-after
time"). Aim for 3-5 people, ideally casual or newer fans.

## Setup
- Laptop or phone with https://sideline-web.onrender.com open (open it a minute early: the free server may need to wake
  up), and a timer. Tap **Try Demo**, then on Scores tap **Jump to → Sunday · 1:00 PM**, pick **60×**, press play, and
  open **Broncos @ Eagles** once it's live.
- Their usual tools on a second tab/phone: Google, ESPN app, or ChatGPT (whatever they'd normally use).

## The 4 questions (same order for everyone)
1. "Why did they punt / kick there?" (or any play that just happened)
2. "Who has the most rushing yards right now?"
3. "What is pass interference?"
4. "Who has the best defense this season?"

For each question: first with their usual tool, then with Sideline (Ask AI tab inside the game for 1-2, the lime
**Ask** button for 3-4). Time from "go" until they say the answer. Note whether the answer was right.

## Afterwards (2 minutes)
- "What was the most useful part?" and "What was confusing?" Write one sentence down word for word (the quote).
- With permission, take one photo or screenshot of them using it (no faces needed).

## Record
| Tester (first name, fan level) | Q | Usual tool (s) | Right? | Sideline (s) | Right? |
|---|---|---|---|---|---|

Then fill `docs/user-results.json` for the slides, e.g.
`{"stat": "4x", "label": "faster than searching (avg 48 s vs 12 s, 4 testers)", "quote": "\"…\" (Sam, casual fan)"}`
and the table in `docs/report/report.src.html`, then run `python3 docs/tools/build_docs.py`.
