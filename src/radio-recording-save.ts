import type {App, TFile} from "obsidian";
import type {RecordedAudio} from "./radio-transcription.ts";

export async function saveRecordedAudioAttachment(params: {
	app: App;
	audio: RecordedAudio;
	now?: () => Date;
	sourcePath?: string;
}): Promise<TFile> {
	const filename = createRecordingAttachmentFilename(params.audio.format, params.now?.() ?? new Date());
	const path = await params.app.fileManager.getAvailablePathForAttachment(filename, params.sourcePath);

	return params.app.vault.createBinary(path, params.audio.buffer);
}

export function createRecordingAttachmentFilename(format: string, recordedAt: Date): string {
	return `Radio recording ${formatRecordingTimestamp(recordedAt)}.${normalizeAttachmentExtension(format)}`;
}

function normalizeAttachmentExtension(format: string): string {
	const normalized = format.trim().toLowerCase();
	return normalized === "mp4" ? "m4a" : normalized;
}

function formatRecordingTimestamp(recordedAt: Date): string {
	return [
		recordedAt.getFullYear(),
		pad(recordedAt.getMonth() + 1),
		pad(recordedAt.getDate()),
		"-",
		pad(recordedAt.getHours()),
		pad(recordedAt.getMinutes()),
		pad(recordedAt.getSeconds()),
	].join("");
}

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}
