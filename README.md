# Audio Transcription

Minimal Obsidian plugin for transcribing vault m4a or mp3 files with OpenRouter into wrapper notes.

## Behavior

- Uses `nvidia/parakeet-tdt-0.6b-v3` through `POST https://openrouter.ai/api/v1/audio/transcriptions` for transcript text, with `openai/whisper-large-v3-turbo` as a fallback
- Sends audio as base64 in the JSON `input_audio` payload
- Uses `openai/gpt-oss-120b` through `POST https://openrouter.ai/api/v1/chat/completions` with provider fallback order `cerebras/fp16`, `groq`, `deepinfra/turbo`, then `baseten/fp4` to generate the note filename title and transcript summaries
- Sets title-generation `reasoning.effort` to `minimal`
- Stores the OpenRouter API key in the plugin settings tab
- Works on desktop and mobile by using Obsidian APIs only
- Radio mode records until **Insert** or **Summarize** is selected. **Insert** transcribes and inserts only the transcript; **Summarize** transcribes, requests a summary, and inserts the `summary.md` structure at the cursor.

## Prompts

Editable OpenRouter prompts live in `src/ai-prompts.ts`.

- `TITLE_PROMPT` controls generated wrapper note filenames.
- `SUMMARY_PROMPT` controls generated transcript summaries.

## Usage

1. Open the plugin settings and paste your OpenRouter API key.
2. Run `File Transcribe` from the command palette or select the ribbon button.
3. Choose one recording, or select **Transcribe all**.
4. Wait for transcription wrapper notes to be created or updated.

## Development

- `npm run build`
- `npm run lint`
- `npm run test`
- `cp .env.test.example .env.test`
- Add `OPENROUTER_API_KEY` to `.env.test`
- `npm run test:integration`

## Update plugin command

```bash
cp manifest.json main.js styles.css '/home/oleksii/Documents/Bibliotheka/.obsidian/plugins/test-plugin'
```
