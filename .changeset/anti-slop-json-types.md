---
"batchwork": minor
---

Type raw provider payloads as JSON instead of `unknown`.

- New exported types `JsonValue`, `JsonObject`, and `HttpHeaders`.
- `BatchResult.response` and `BatchSnapshot.raw` are now `JsonValue` (previously `unknown`), so raw provider data can be read without a cast.
- `batchwork/redis` accepts any client structurally matching the new `RedisClient` interface (a real `@upstash/redis` instance still works); the store now validates records it reads back and returns `null` for malformed ones.
- `SqlExecutor.query` no longer defaults its row type to `Record<string, unknown>`.
