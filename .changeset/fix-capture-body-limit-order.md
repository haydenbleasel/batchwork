---
"batchwork": patch
---

Enforce captured provider request byte limits before parsing the captured body so oversized requests are rejected before JSON allocation.
