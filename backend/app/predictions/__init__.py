"""Phase 2D: deterministic, server-authoritative replay predictions.

* ``models``  - prediction/answer/stat models and the documented points table
* ``rules``   - per-type opportunity detectors and resolvers (pure functions)
* ``ledger``  - per-session lifecycle: open -> locked -> resolved/void, picks, stats

No AI decides eligibility, options, deadlines, outcomes, or points.
"""
