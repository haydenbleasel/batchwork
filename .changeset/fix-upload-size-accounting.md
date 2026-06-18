---
"batchwork": patch
---

Check aggregate upload byte limits while encoding provider payloads so oversized JSONL and inline batch submissions are rejected before full payload materialization.
