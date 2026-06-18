---
"batchwork": patch
---

Fix the xAI batch snapshot reporting `completedAt` from the batch's `cancel_time`. A normally-completed batch now reads its completion timestamp from `finish_time`, and `completedAt` is left unset for batches that were never cancelled but had no finish time (rather than surfacing a misleading cancellation time).
