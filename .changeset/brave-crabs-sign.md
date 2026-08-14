---
"batchwork": patch
---

Delegate webhook HMAC signing and verification to `standardwebhooks`, the Standard Webhooks reference implementation (pure JS, edge-compatible). Batchwork's error surface, raw-string secret handling, replay protection, and non-JSON body support are unchanged.
