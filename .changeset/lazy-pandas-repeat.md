---
"batchwork": minor
---

Add `batch.transcriptions()` — batch audio transcription for Groq (`whisper-large-v3`) and Mistral (Voxtral models). Pass hosted audio URLs (batch audio endpoints accept URLs, not file uploads); transcripts land on `result.text`, with timestamped spans on `result.segments` when `timestampGranularities` is requested. Includes new `BatchTranscriptionRequest`/`BatchTranscriptionOptions`/`BatchTranscriptionSegment` types and an `UnsupportedProviderError` gate for providers whose batch API rejects audio endpoints.
