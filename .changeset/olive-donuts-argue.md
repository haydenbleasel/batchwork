---
"batchwork": minor
---

Add `batch.moderations()` — batch content moderation for OpenAI (`omni-moderation-latest`, text + image inputs) and Mistral (`mistral-moderation-latest`, text-only). Pass models as `"provider/model"` strings; verdicts land on `result.moderation` as `{ flagged, categories, categoryScores }` with provider-native category names (Mistral's missing top-level flag is computed as "any category flagged"). Includes new `BatchModerationRequest`/`BatchModerationOptions`/`BatchModeration` types and an `UnsupportedProviderError` gate for providers without a moderation endpoint.
