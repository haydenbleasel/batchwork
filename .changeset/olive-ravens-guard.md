---
"batchwork": patch
---

Replace the hand-rolled private-IP classification in the webhook URL validator with `ipaddr.js`. The battle-tested parser closes gaps in the previous checks (e.g. `192.0.0.0/24`, documentation ranges, 6to4/Teredo addresses with embedded targets) and unwraps IPv4-mapped IPv6 literals more robustly.
