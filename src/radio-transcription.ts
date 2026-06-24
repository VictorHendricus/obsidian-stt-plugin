import type {RequestUrlParam} from "obsidian";
import {requestSummary, requestTranscriptText} from "./openrouter.ts";

export interface RecordedAudio {
	buffer: ArrayBuffer;
	format: string;
}

export type RequestUrlAdapter = (request: RequestUrlParam) => Promise<{status: number; text: string}>;
export type RadioTranscriptionStatus = "sending" | "processing" | "failed";

export interface RadioTranscriptionStatusEvent {
	attempt: number;
	status: RadioTranscriptionStatus;
	error?: unknown;
}

const RADIO_TRANSCRIPTION_ATTEMPTS = 3;

const RECORDER_FORMATS: Array<{mimeType: string; format: string}> = [
	{mimeType: "audio/mp4", format: "m4a"},
	{mimeType: "audio/webm;codecs=opus", format: "webm"},
	{mimeType: "audio/webm", format: "webm"},
	{mimeType: "audio/mpeg", format: "mp3"},
	{mimeType: "audio/ogg;codecs=opus", format: "ogg"},
	{mimeType: "audio/ogg", format: "ogg"},
];

export function selectRecorderFormat(
	isTypeSupported: (mimeType: string) => boolean,
): {mimeType: string; format: string} | null {
	for (const candidate of RECORDER_FORMATS) {
		if (isTypeSupported(candidate.mimeType)) {
			return candidate;
		}
	}

	return null;
}

export function getRecordedAudioFormat(mimeType: string): string {
	const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";

	switch (normalized) {
		case "audio/webm":
			return "webm";
		case "audio/mp4":
			return "m4a";
		case "audio/mpeg":
			return "mp3";
		case "audio/ogg":
			return "ogg";
		case "audio/wav":
			return "wav";
		default:
			throw new Error("The recorded audio format is not supported.");
	}
}

export async function transcribeRecordedAudio(params: {
	apiKey: string;
	audio: RecordedAudio;
	requestUrl: RequestUrlAdapter;
	onStatus?: (event: RadioTranscriptionStatusEvent) => void;
}): Promise<string> {
	let lastError: unknown = null;

	for (let attempt = 1; attempt <= RADIO_TRANSCRIPTION_ATTEMPTS; attempt += 1) {
		try {
			params.onStatus?.({attempt, status: "sending"});
			const transcript = await requestTranscriptText({
				apiKey: params.apiKey,
				audioBuffer: params.audio.buffer,
				audioFormat: params.audio.format,
				requestUrl: params.requestUrl,
			});
			params.onStatus?.({attempt, status: "processing"});
			return transcript;
		} catch (error) {
			lastError = error;
			params.onStatus?.({attempt, status: "failed", error});
		}
	}

	throw lastError instanceof Error ? lastError : new Error("Radio mode transcription failed.");
}

export async function summarizeRecordedTranscript(params: {
	apiKey: string;
	transcript: string;
	requestUrl: RequestUrlAdapter;
}): Promise<string[]> {
	return requestSummary({
		apiKey: params.apiKey,
		transcription: params.transcript,
		requestUrl: params.requestUrl,
	});
}

export function formatRadioTranscriptWithSummary(transcript: string, summary: string[]): string {
	const transcriptionLines = formatIndentedLines(transcript);
	const summaryLines = summary.length > 0 ? summary.map((item) => `        - ${item.trim()}`).join("\n") : "        - No summary returned.";

	return ["ST", "    - Transcription:", transcriptionLines, "    - Summary:", summaryLines].join("\n");
}

function formatIndentedLines(value: string): string {
	const lines = value.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
	if (lines.length === 0) {
		return "        - No transcription returned.";
	}

	return lines.map((line) => `        - ${line.trim()}`).join("\n");
}
