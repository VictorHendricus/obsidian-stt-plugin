export const TITLE_PROMPT = [
	"Create a short English filename title for this transcript.",
	'Return only valid JSON with this exact shape: {"title":"one-sentence English summary for the transcription note filename"}.',
	"The title must summarize the main point in one concrete sentence, not a vague topic label.",
	"Do not wrap the JSON in Markdown.",
].join(" ");
