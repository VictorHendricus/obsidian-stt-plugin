Constraints for sending an audio file for transcription via OpenRouter:

1. Endpoint constraint
   Must use `POST https://openrouter.ai/api/v1/chat/completions`
   No separate transcription endpoint is used.

2. Encoding constraint
   Audio must be base64-encoded before sending.
   Raw binary is not accepted.

3. Transport constraint
   Request body must be JSON.
   Multipart/form-data is not supported.

4. Message structure constraint
   Audio must be embedded inside `messages[].content[]` array.
   Not allowed at top-level fields.

5. Content typing constraint
   Message content must include:

   * one `type: "text"` block (instruction)
   * one `type: "input_audio"` block (audio payload)

6. Audio payload schema constraint
   `input_audio` must contain:

   * `data`: base64 string
   * `format`: explicit format string (`wav`, `mp3`, `ogg`, etc.)

7. Model capability constraint
   Selected model must support audio input modality.
   Otherwise request fails or ignores audio.

8. URL constraint
   Audio cannot be passed as a remote URL.
   Only inline base64 is accepted.

9. Size constraint
   Audio must fit within provider request size/token limits.
   Large files must be preprocessed (trimmed or split).

10. Authentication constraint
    Must include header:
    `Authorization: Bearer <API_KEY>`

11. Content-type constraint
    Must include header:
    `Content-Type: application/json`

12. Optional attribution constraint
    May include:

* `HTTP-Referer`
* `X-OpenRouter-Title`
  These do not affect execution.

13. Output variability constraint
    Response format may differ by model/provider:

* `message.content` can be string or array
  Extraction logic must handle both.

14. Execution environment constraint
    Request must originate from environment capable of sending HTTPS POST with JSON (e.g., Obsidian plugin, Node/Electron).

15. Failure modes constraint
    Errors arise from:

* invalid API key
* unsupported model
* malformed message schema
* exceeding size limits
  Not from CORS in plugin context.
16. use requestUrl from Obsidian API

# the mobile-safe design is:

manifest.json: keep isDesktopOnly: false
do not import fs, path, or electron at top level
use this.app.vault.readBinary(file) for the audio
convert that binary to base64 in JS
send it with requestUrl
insert transcript through the editor API at the cursor location