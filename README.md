# Audio Transcription

Minimal Obsidian plugin for transcribing vault mp3 files with OpenRouter and inserting the result at the current cursor position.

## Behavior

- Uses `google/gemini-3.1-flash-lite-preview` through `POST https://openrouter.ai/api/v1/chat/completions`
- Sends audio as base64 in a `messages[].content[]` block with `type: "input_audio"`
- Sets `reasoning.effort` to `minimal`
- Prompts the model to return transcription only
- Stores the OpenRouter API key in the plugin settings tab
- Works on desktop and mobile by using Obsidian APIs only

## Usage

1. Open the plugin settings and paste your OpenRouter API key.
2. Run `Transcribe audio file into editor` from the command palette or the editor slash menu.
3. Type part of an mp3 path and choose a file from the vault suggestions.
4. Wait for the transcription to be inserted at the cursor.

## Development

- `npm run build`
- `npm run lint`
- `npm run test`
- `cp .env.test.example .env.test`
- Add `OPENROUTER_API_KEY` to `.env.test`
- `npm run test:integration`
