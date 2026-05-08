Constraints for sending an audio file for transcription via OpenRouter:

1. Endpoint constraint
   Transcription must use `POST https://openrouter.ai/api/v1/audio/transcriptions`.
   Title generation may use `POST https://openrouter.ai/api/v1/chat/completions`.

2. Model constraint
   Transcription must use `openai/whisper-large-v3`.
   Chat-completion LLM models must only be used for metadata derived from the transcript, such as the note filename title.

3. Encoding constraint
   Audio must be base64-encoded before sending.
   Raw binary and multipart/form-data are not used.

4. Transport constraint
   Request bodies must be JSON.

5. Audio payload schema constraint
   Transcription requests must include top-level `input_audio` with:

   * `data`: base64 string
   * `format`: explicit format string (`wav`, `mp3`, `m4a`, `ogg`, etc.)

6. URL constraint
   Audio cannot be passed as a remote URL.
   Only inline base64 is accepted.

7. Size constraint
   Audio must fit within provider request size limits.
   Large files must be preprocessed, trimmed, or split.

8. Authentication constraint
   Must include header:
   `Authorization: Bearer <API_KEY>`

9. Content-type constraint
   Must include header:
   `Content-Type: application/json`

10. Optional attribution constraint
    May include:

* `HTTP-Referer`
* `X-OpenRouter-Title`
  These do not affect execution.

11. Output constraint
    Transcription response must provide transcript text, normally in `text`.
    Title-generation response must provide a usable English title.

12. Failure modes constraint
    Errors arise from:

* invalid API key
* unsupported model
* malformed request schema
* exceeding size limits
  Not from CORS in plugin context.

13. Obsidian API constraint
    Use `requestUrl` from the Obsidian API for network calls.

# the mobile-safe design is:

manifest.json: keep isDesktopOnly: false
do not import fs, path, or electron at top level
use this.app.vault.readBinary(file) for the audio
convert that binary to base64 in JS
send it with requestUrl
insert transcript through the editor API at the cursor location
