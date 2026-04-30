export const TRANSCRIPTION_PROMPT = [
	"Transcribe this audio and return only valid JSON.",
	'Use this exact shape: {"title":"one-sentence English summary for the transcription note filename","transcription":"verbatim transcription in the audio language"}.',
	"The title must summarize the main point of the transcribed text in one concrete sentence, not a vague topic label.",
	"The title must be in English no matter what language is spoken in the audio.",
	"Do not wrap the JSON in Markdown.",
].join(" ");
