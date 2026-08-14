---
"batchwork": patch
---

Back `mapWithConcurrency` (used for concurrent request-body capture) with `p-map` instead of a hand-rolled worker pool. Behavior is unchanged for callers; a failed capture now also stops launching further work instead of letting remaining workers run to completion with discarded results.
