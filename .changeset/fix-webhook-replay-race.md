---
"batchwork": patch
---

Harden webhook replay tracking by supporting atomic replay-store claims and serializing legacy async replay stores per webhook id to prevent concurrent signed replays.
