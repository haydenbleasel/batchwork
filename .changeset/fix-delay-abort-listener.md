---
"batchwork": patch
---

Fix `BatchJob.wait()` leaking `abort` event listeners on the provided `AbortSignal`. The internal delay attached a listener each poll but only removed it on abort, so a long-running wait accumulated one dangling listener per poll interval. The listener is now detached when the delay resolves normally.
