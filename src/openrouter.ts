import {TITLE_PROMPT} from "./ai-prompts.ts";

export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_AUDIO_TRANSCRIPTIONS_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
export const OPENROUTER_TITLE_MODEL = "google/gemini-3.1-flash-lite-preview";
export const OPENROUTER_TRANSCRIPTION_MODEL = "openai/whisper-large-v3";
export const TITLE_RESPONSE_FORMAT = {
	type: "json_schema",
	json_schema: {
		name: "transcription_title",
		strict: true,
		schema: {
			type: "object",
			additionalProperties: false,
			required: ["title"],
			properties: {
				title: {
					type: "string",
					description: "Short English title for the transcription note filename.",
				},
			},
		},
	},
} as const;
export {TITLE_PROMPT};

export interface TranscriptionResult {
	title: string;
	transcription: string;
}

interface OpenRouterTextContent {
	type: "text";
	text: string;
}

export interface RequestUrlRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
	throw?: boolean;
}

export interface RequestUrlResponse {
	status: number;
	text: string;
}

export interface RequestTranscriptionParams {
	apiKey: string;
	audioBuffer: ArrayBuffer;
	audioPath: string;
	requestUrl: (request: RequestUrlRequest) => Promise<RequestUrlResponse>;
}

interface OpenRouterErrorBody {
	error?: {
		message?: string;
	};
}

export function getAudioFormat(audioPath: string): string {
	const extension = audioPath.split(".").pop()?.trim().toLowerCase();
	if (!extension) {
		throw new Error("The selected audio file must have a valid extension.");
	}

	return extension;
}

export function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const bufferConstructor = (globalThis as {
		Buffer?: {
			from(input: Uint8Array): {toString(encoding: string): string};
		};
	}).Buffer;

	if (bufferConstructor) {
		return bufferConstructor.from(bytes).toString("base64");
	}

	let binary = "";
	const chunkSize = 0x8000;

	for (let start = 0; start < bytes.length; start += chunkSize) {
		const chunk = bytes.subarray(start, start + chunkSize);
		binary += String.fromCharCode(...chunk);
	}

	if (typeof btoa !== "function") {
		throw new Error("Base64 encoding is not available in this environment.");
	}

	return btoa(binary);
}

export function createTranscriptionRequestBody(audioBase64: string, format: string): {
	model: string;
	input_audio: {
		data: string;
		format: string;
	};
} {
	return {
		model: OPENROUTER_TRANSCRIPTION_MODEL,
		input_audio: {
			data: audioBase64,
			format,
		},
	};
}

export function createTitleRequestBody(transcription: string): {
	model: string;
	reasoning: {effort: "minimal"; exclude: true};
	response_format: typeof TITLE_RESPONSE_FORMAT;
	stream: false;
	messages: Array<{
		role: "user";
		content: [OpenRouterTextContent, OpenRouterTextContent];
	}>;
} {
	return {
		model: OPENROUTER_TITLE_MODEL,
		reasoning: {
			effort: "minimal",
			exclude: true,
		},
		response_format: TITLE_RESPONSE_FORMAT,
		stream: false,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: TITLE_PROMPT,
					},
					{
						type: "text",
						text: transcription,
					},
				],
			},
		],
	};
}

export function extractTranscriptionResultFromResponse(payload: unknown): TranscriptionResult {
	const rawText = extractTextContent(getNestedValue(payload, ["choices", 0, "message", "content"])).trim();

	const result = parseTranscriptionResult(rawText);
	return result;
}

export function extractTranscriptionFromResponse(payload: unknown): string {
	return extractTranscriptTextFromResponse(payload);
}

export function extractTranscriptTextFromResponse(payload: unknown): string {
	const text = getTextField(payload).trim();
	if (!text) {
		throw new Error("OpenRouter returned an empty transcription.");
	}

	return text;
}

export function extractTitleFromResponse(payload: unknown): string {
	const content = getNestedValue(payload, ["choices", 0, "message", "content"]);
	const rawText = extractTextContent(content).trim();
	const title = parseTitleResult(rawText);
	if (!title || looksLikeJsonObject(title)) {
		throw new Error("OpenRouter returned a title response without a usable English title.");
	}

	return title;
}

export async function requestTranscription(params: RequestTranscriptionParams): Promise<TranscriptionResult> {
	const apiKey = params.apiKey.trim();
	if (!apiKey) {
		throw new Error("An OpenRouter API key is required.");
	}

	const audioBase64 = encodeArrayBufferToBase64(params.audioBuffer);
	const format = getAudioFormat(params.audioPath);
	const response = await params.requestUrl({
		url: OPENROUTER_AUDIO_TRANSCRIPTIONS_URL,
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"X-OpenRouter-Title": "Obsidian STT Plugin",
		},
		body: JSON.stringify(createTranscriptionRequestBody(audioBase64, format)),
		throw: false,
	});

	if (response.status < 200 || response.status >= 300) {
		throw new Error(`OpenRouter transcription request failed (${response.status}): ${extractErrorMessage(response.text)}`);
	}

	const transcription = extractTranscriptTextFromResponse(parseJson(response.text));
	const titleResponse = await params.requestUrl({
		url: OPENROUTER_CHAT_COMPLETIONS_URL,
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"X-OpenRouter-Title": "Obsidian STT Plugin",
		},
		body: JSON.stringify(createTitleRequestBody(transcription)),
		throw: false,
	});

	if (titleResponse.status < 200 || titleResponse.status >= 300) {
		throw new Error(`OpenRouter title request failed (${titleResponse.status}): ${extractErrorMessage(titleResponse.text)}`);
	}

	return {
		title: extractTitleFromResponse(parseJson(titleResponse.text)),
		transcription,
	};
}

function parseTranscriptionResult(rawText: string): TranscriptionResult {
	if (!rawText) {
		throw new Error("OpenRouter returned an empty transcription.");
	}

	const jsonText = stripMarkdownFence(rawText);

	for (const candidate of parseJsonCandidates(jsonText)) {
		const parsed = tryParseJson(candidate);
		const normalized = normalizeTranscriptionResult(parsed);
		if (normalized) {
			return normalized;
		}
	}

	const repaired = repairTranscriptionResult(jsonText);
	if (repaired) {
		return repaired;
	}

	if (looksLikeJsonObject(jsonText)) {
		throw new Error("OpenRouter returned malformed transcription JSON.");
	}

	return {title: "", transcription: rawText};
}

function parseTitleResult(rawText: string): string {
	if (!rawText) {
		return "";
	}

	const jsonText = stripMarkdownFence(rawText);

	for (const candidate of parseJsonCandidates(jsonText)) {
		const parsed = tryParseJson(candidate);
		const title = normalizeTitleResult(parsed);
		if (title) {
			return title;
		}
	}

	return jsonText.trim();
}

function parseJsonCandidates(jsonText: string): string[] {
	return [jsonText, extractJsonObjectText(jsonText)].filter(
		(candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
	);
}

function extractTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.map((item) => {
			if (typeof item === "string") {
				return item;
			}

			if (!isRecord(item)) {
				return "";
			}

			if (typeof item.text === "string") {
				return item.text;
			}

			if (typeof item.content === "string") {
				return item.content;
			}

			return "";
		})
		.filter((item) => item.length > 0)
		.join("\n");
}

function extractErrorMessage(rawText: string): string {
	const trimmed = rawText.trim();
	if (!trimmed) {
		return "Unknown OpenRouter error.";
	}

	try {
		const parsed = parseJson(trimmed) as OpenRouterErrorBody;
		if (typeof parsed.error?.message === "string" && parsed.error.message.trim().length > 0) {
			return parsed.error.message.trim();
		}
	} catch {
		// Fall back to the raw response body when it is not JSON.
	}

	return trimmed;
}

function parseJson(rawText: string): unknown {
	try {
		return JSON.parse(rawText) as unknown;
	} catch {
		throw new Error("OpenRouter returned an invalid JSON response.");
	}
}

function tryParseJson(rawText: string): unknown {
	try {
		return JSON.parse(rawText) as unknown;
	} catch {
		return undefined;
	}
}

function normalizeTranscriptionResult(value: unknown): TranscriptionResult | null {
	if (typeof value === "string") {
		return normalizeTranscriptionResult(tryParseJson(value));
	}

	if (!isRecord(value)) {
		return null;
	}

	const title = typeof value.title === "string" ? value.title.trim() : "";
	const transcription = typeof value.transcription === "string" ? value.transcription.trim() : "";

	return transcription ? {title, transcription} : null;
}

function normalizeTitleResult(value: unknown): string {
	if (typeof value === "string") {
		return normalizeTitleResult(tryParseJson(value)) || value.trim();
	}

	if (!isRecord(value)) {
		return "";
	}

	return typeof value.title === "string" ? value.title.trim() : "";
}

function getTextField(payload: unknown): string {
	if (!isRecord(payload)) {
		return "";
	}

	if (typeof payload.text === "string") {
		return payload.text;
	}

	if (typeof payload.transcription === "string") {
		return payload.transcription;
	}

	return "";
}

function repairTranscriptionResult(rawText: string): TranscriptionResult | null {
	const titleMatch = rawText.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
	const transcriptionMatch = rawText.match(/"transcription"\s*:\s*"([\s\S]*)"\s*}\s*$/);
	const transcription = transcriptionMatch?.[1]?.replace(/\\n/g, "\n").replace(/\\"/g, '"').trim() ?? "";

	if (!transcription) {
		return null;
	}

	return {
		title: titleMatch?.[1]?.replace(/\\"/g, '"').trim() ?? "",
		transcription,
	};
}

function stripMarkdownFence(rawText: string): string {
	return rawText
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
}

function extractJsonObjectText(rawText: string): string | null {
	const start = rawText.indexOf("{");
	const end = rawText.lastIndexOf("}");

	if (start === -1 || end === -1 || end <= start) {
		return null;
	}

	return rawText.slice(start, end + 1);
}

function looksLikeJsonObject(value: string): boolean {
	const trimmed = value.trim();
	return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function getNestedValue(value: unknown, path: Array<string | number>): unknown {
	let current: unknown = value;

	for (const key of path) {
		if (typeof key === "number") {
			if (!Array.isArray(current)) {
				return undefined;
			}

			current = current[key];
			continue;
		}

		if (!isRecord(current)) {
			return undefined;
		}

		current = current[key];
	}

	return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
