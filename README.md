# Audio Transcription

Minimal Obsidian plugin for transcribing vault m4a or mp3 files with OpenRouter and inserting the result at the current cursor position.

## Behavior

- Uses `openai/whisper-large-v3-turbo` through `POST https://openrouter.ai/api/v1/audio/transcriptions` for transcript text
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
2. Run `Transcribe audio file into editor` from the command palette or the editor slash menu.
3. Type part of an m4a or mp3 path and choose a file from the vault suggestions.
4. Wait for the transcription to be inserted at the cursor.

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
