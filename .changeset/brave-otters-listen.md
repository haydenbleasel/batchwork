---
"batchwork": minor
---

Add Together AI to `batch.transcriptions()` — Whisper models (e.g. `"together/openai/whisper-large-v3"`) batch through `/v1/audio/transcriptions`, with Batchwork writing Together's audio-specific `method: "FILE"` lines and `body.file` URL references automatically.
