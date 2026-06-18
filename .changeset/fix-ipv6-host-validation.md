---
"batchwork": patch
---

Fix webhook and Together upload URL validation rejecting legitimate hostnames that begin with `fc`/`fd` (e.g. `fc2.com`). The private-IPv6 guard now only applies to actual IPv6 literals (those containing a colon), so bare DNS names are no longer mistaken for `fc00::/7` addresses.
