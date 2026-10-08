"""Sideline AI (Phase 2C): one Pydantic AI agent grounded in the replay engine.

* ``view``     - frozen, leak-proof snapshot of a replay at one cursor
* ``stats``    - deterministic team/player stats over revealed plays
* ``tools``    - the agent's tools (read only from a ``ReplayView``)
* ``agent``    - the agent, its instructions and structured output
* ``service``  - ask/insight orchestration: auth-free core with cache, budget, audit
* ``insights`` - deterministic noteworthy-moment detection
"""

import os

# Pydantic AI prints a promotional banner on first run; keep server logs clean.
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")
