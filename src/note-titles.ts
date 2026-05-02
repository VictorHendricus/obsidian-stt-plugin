const MAX_RECORDING_BASENAME_LENGTH = 180;
const DEFAULT_TITLE = "Transcribed recording";

export function createTranscriptionNoteBasename(title: string): string {
	const firstSentence = title
		.replace(/\s+/g, " ")
		.trim()
		.match(/^[^.!?]+[.!?]?/)?.[0]
		.trim();
	const safeName = (firstSentence || DEFAULT_TITLE)
		.replace(/[\\/:*?"<>|#^[\]]+/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_RECORDING_BASENAME_LENGTH)
		.replace(/[.!?,;:\s]+$/g, "")
		.trim();

	return safeName || DEFAULT_TITLE;
}
