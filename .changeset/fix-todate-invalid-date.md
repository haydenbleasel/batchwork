---
"batchwork": patch
---

Fix `toDate` returning an `Invalid Date` for empty or malformed provider timestamps. Such a value previously survived into a snapshot and threw `RangeError: Invalid time value` when the date was serialized (e.g. building a webhook event); the field is now coerced to `undefined` instead.
