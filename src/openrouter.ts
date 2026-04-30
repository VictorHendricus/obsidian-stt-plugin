import {TRANSCRIPTION_PROMPT} from "./ai-prompts.ts";

export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "google/gemini-3.1-flash-lite-preview";
export const TRANSCRIPTION_RESPONSE_FORMAT = {
	type: "json_schema",
	json_schema: {
		name: "transcription_result",
		strict: true,
		schema: {
			type: "object",
			additionalProperties: false,
			required: ["title", "transcription"],
			properties: {
				title: {
					type: "string",
					description: "Short English title for the transcription note filename.",
				},
				transcription: {
					type: "string",
					description: "Verbatim transcription in the audio language.",
				},
			},
		},
	},
} as const;
export {TRANSCRIPTION_PROMPT};

export interface TranscriptionResult {
	title: string;
	transcription: string;
}

interface OpenRouterTextContent {
	type: "text";
	text: string;
}

interface OpenRouterInputAudioContent {
	type: "input_audio";
	input_audio: {
		data: string;
		format: string;
	};
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
	reasoning: {effort: "minimal"; exclude: true};
	response_format: typeof TRANSCRIPTION_RESPONSE_FORMAT;
	stream: false;
	messages: Array<{
		role: "user";
		content: [OpenRouterTextContent, OpenRouterInputAudioContent];
	}>;
} {
	return {
		model: OPENROUTER_MODEL,
		reasoning: {
			effort: "minimal",
			exclude: true,
		},
		response_format: TRANSCRIPTION_RESPONSE_FORMAT,
		stream: false,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: TRANSCRIPTION_PROMPT,
					},
					{
						type: "input_audio",
						input_audio: {
							data: audioBase64,
							format,
						},
					},
				],
			},
		],
	};
}

export function extractTranscriptionResultFromResponse(payload: unknown): TranscriptionResult {
	const content = getNestedValue(payload, ["choices", 0, "message", "content"]);
	const rawText = extractTextContent(content).trim();

	if (!rawText) {
		throw new Error("OpenRouter returned an empty transcription.");
	}

	const result = parseTranscriptionResult(rawText);
	if (!result.transcription) {
		throw new Error("OpenRouter returned an empty transcription.");
	}

	if (!result.title || looksLikeJsonObject(result.title)) {
		throw new Error("OpenRouter returned a transcription without a usable English title.");
	}

	if (looksLikeJsonObject(result.transcription)) {
		throw new Error("OpenRouter returned JSON as transcript text instead of a parsed transcription.");
	}

	return result;
}

export function extractTranscriptionFromResponse(payload: unknown): string {
	return extractTranscriptionResultFromResponse(payload).transcription;
}

export async function requestTranscription(params: RequestTranscriptionParams): Promise<TranscriptionResult> {
	const apiKey = params.apiKey.trim();
	if (!apiKey) {
		throw new Error("An OpenRouter API key is required.");
	}

	const audioBase64 = encodeArrayBufferToBase64(params.audioBuffer);
	const format = getAudioFormat(params.audioPath);
	const response = await params.requestUrl({
		url: OPENROUTER_CHAT_COMPLETIONS_URL,
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
		throw new Error(`OpenRouter request failed (${response.status}): ${extractErrorMessage(response.text)}`);
	}

	return extractTranscriptionResultFromResponse(parseJson(response.text));
}

function parseTranscriptionResult(rawText: string): TranscriptionResult {
	const jsonText = stripMarkdownFence(rawText);
	const candidates = [jsonText, extractJsonObjectText(jsonText)].filter(
		(candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
	);

	for (const candidate of candidates) {
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
