# Tokenomics measurement (2026-10-22T19:23:54+00:00, gpt-6-luna)

Real gpt-6-luna calls via Portkey, measured from Sideline's audit log by `python -m evals.tokenomics`
(raw report: `evals/reports/tokenomics-20261022T192354.json`, git-ignored). Prices: $0.20 / M input, $0.50 / M output
(cached input billed at the provider's discount).

| Agent | Requests | Model calls | Cache hits | Avg input tokens | Avg cached input | Avg output | Avg model requests | Avg cost / call | p50 latency |
|---|---|---|---|---|---|---|---|---|---|
| Ask AI (in a game) | 63 | 39 | 24 | 3,814 | 3,258 | 90 | 2.0 | $0.000133 | 514 ms |
| "Why?" explanations | 6 | 6 | 0 | 4,614 | 3,233 | 226 | 2.0 | $0.000283 | 684 ms |
| Pregame preview | 23 | 14 | 9 | 1,960 | 0 | 209 | 2.3 | $0.000300 | 643 ms |
| Ask Sideline | 15 | 14 | 1 | 3,466 | 2,932 | 141 | 2.0 | $0.000153 | 632 ms |

Session total: **$0.013246** for 107 user requests.

## Cost cuts (same session)

- Actual: $0.013246
- Without prompt caching (cached input at full price): $0.055363
- Without prompt caching **and** without Sideline's shared answer caches: $0.079983
- Saved: **83.4%**; 74.3% of input tokens were served from the prompt cache; 34 requests were answered from Sideline's caches with no model call.

History window (same 16-turn Ask AI chat): 70,893 input tokens with the 6-turn / 3,000-character window vs 74,596 unlimited ($0.00266 vs $0.00249). Answers for both are in the raw report.

## Monthly projection

Assumptions: games watched per user per month = 8, ask ai questions per game = 5, why explanations per game = 2, assistant questions per user per month = 10, preview generations per month = 112.

- Effective cost per request (cache hits free): Ask AI $8.2e-05, Why? $0.000283, Ask Sideline $0.000143
- AI cost per user per month: **$0.00925**
- Shared pregame previews (independent of users): $0.0336 / month
- 100 users: **$0.96 / month** · 10,000 users: **$92.53 / month** (AI only; hosting separate)
