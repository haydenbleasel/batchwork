---
"batchwork": minor
---

Add `batch.translations()` — batch audio translation to English (Whisper's translate task) for Groq (`whisper-large-v3`) and Together AI (`"together/openai/whisper-large-v3"`) via `/v1/audio/translations`. Mirrors `batch.transcriptions()` minus the `language` field (English is the only target); English text lands on `result.text` with optional timestamped `result.segments`. Mistral batches transcriptions but not translations and throws `UnsupportedProviderError`.
