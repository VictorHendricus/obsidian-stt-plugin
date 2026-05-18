/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {
	createTitleRequestBody,
	createTranscriptionRequestBody,
	encodeArrayBufferToBase64,
	extractTitleFromResponse,
	extractTranscriptionFromResponse,
	extractTranscriptionResultFromResponse,
	getAudioFormat,
	OPENROUTER_AUDIO_TRANSCRIPTIONS_URL,
	OPENROUTER_CHAT_COMPLETIONS_URL,
	OPENROUTER_TITLE_MODEL,
	OPENROUTER_TRANSCRIPTION_MODEL,
	requestTranscription,
	TITLE_PROMPT,
	TITLE_RESPONSE_FORMAT,
	type RequestTranscriptionParams,
	type RequestUrlRequest,
} from "../src/openrouter.ts";

void test("encodeArrayBufferToBase64 encodes raw audio bytes", () => {
	const buffer = Uint8Array.from([0, 1, 2, 3, 255]).buffer;
	assert.equal(encodeArrayBufferToBase64(buffer), "AAECA/8=");
});

void test("encodeArrayBufferToBase64 uses browser btoa when Buffer is unavailable", () => {
	const originalBuffer = globalThis.Buffer;
	const originalBtoa = globalThis.btoa;
	const calls: string[] = [];

	try {
		Reflect.deleteProperty(globalThis, "Buffer");
		globalThis.btoa = (input: string): string => {
			calls.push(input);
			return "browser-base64";
		};

		assert.equal(encodeArrayBufferToBase64(Uint8Array.from([65, 66, 67]).buffer), "browser-base64");
		assert.deepEqual(calls, ["ABC"]);
	} finally {
		globalThis.Buffer = originalBuffer;
		globalThis.btoa = originalBtoa;
	}
});

void test("encodeArrayBufferToBase64 reports missing browser encoder", () => {
	const originalBuffer = globalThis.Buffer;
	const originalBtoa = globalThis.btoa;

	try {
		Reflect.deleteProperty(globalThis, "Buffer");
		Reflect.deleteProperty(globalThis, "btoa");

		assert.throws(
			() => encodeArrayBufferToBase64(Uint8Array.from([65]).buffer),
			/Base64 encoding is not available/,
		);
	} finally {
		globalThis.Buffer = originalBuffer;
		globalThis.btoa = originalBtoa;
	}
});

void test("getAudioFormat extracts a lowercase extension", () => {
	assert.equal(getAudioFormat("Recordings/Demo.MP3"), "mp3");
	assert.equal(getAudioFormat("Recordings/Demo. m4a "), "m4a");
	assert.throws(() => getAudioFormat(""), /valid extension/);
	assert.throws(() => getAudioFormat("Recordings/Demo."), /valid extension/);
});

void test("OpenRouter constants match the documented API contract", () => {
	assert.equal(OPENROUTER_CHAT_COMPLETIONS_URL, "https://openrouter.ai/api/v1/chat/completions");
	assert.equal(OPENROUTER_AUDIO_TRANSCRIPTIONS_URL, "https://openrouter.ai/api/v1/audio/transcriptions");
	assert.equal(OPENROUTER_TITLE_MODEL, "google/gemini-3.1-flash-lite-preview");
	assert.equal(OPENROUTER_TRANSCRIPTION_MODEL, "openai/whisper-large-v3");
});

void test("createTranscriptionRequestBody matches the OpenRouter audio transcription format", () => {
	const body = createTranscriptionRequestBody("ZmFrZS1hdWRpbw==", "m4a");

	assert.equal(body.model, OPENROUTER_TRANSCRIPTION_MODEL);
	assert.deepEqual(body.input_audio, {
		data: "ZmFrZS1hdWRpbw==",
		format: "m4a",
	});
});

void test("createTitleRequestBody matches the OpenRouter chat format", () => {
	const body = createTitleRequestBody("hello world");

	assert.equal(body.model, OPENROUTER_TITLE_MODEL);
	assert.equal(body.stream, false);
	assert.equal(body.messages[0]?.role, "user");
	assert.deepEqual(body.reasoning, {
		effort: "minimal",
		exclude: true,
	});
	assert.deepEqual(body.response_format, TITLE_RESPONSE_FORMAT);
	assert.equal(body.messages[0]?.content[0].text, TITLE_PROMPT);
	assert.deepEqual(body.messages[0]?.content[1], {
		type: "text",
		text: "hello world",
	});
});

void test("createTitleRequestBody preserves transcript whitespace for the model", () => {
	const body = createTitleRequestBody("  first line\nsecond line  ");

	assert.equal(body.messages[0]?.content[1].type, "text");
	assert.equal(body.messages[0]?.content[1].text, "  first line\nsecond line  ");
});

void test("extractTranscriptionFromResponse supports audio transcription text", () => {
	assert.equal(extractTranscriptionFromResponse({text: "transcribed text"}), "transcribed text");
	assert.equal(extractTranscriptionFromResponse({text: "  transcribed text  "}), "transcribed text");
	assert.equal(extractTranscriptionFromResponse({transcription: "legacy text"}), "legacy text");
	assert.throws(() => extractTranscriptionFromResponse({text: ""}), /empty transcription/);
	assert.throws(() => extractTranscriptionFromResponse({}), /empty transcription/);
});

void test("extractTranscriptionResultFromResponse supports string content", () => {
	const response = {
		choices: [
			{
				message: {
					content: '{"title":"Demo recording","transcription":"transcribed text"}',
				},
			},
		],
	};

	assert.equal(extractTranscriptionResultFromResponse(response).transcription, "transcribed text");
});

void test("extractTranscriptionResultFromResponse preserves plain non-json content", () => {
	const response = {
		choices: [{message: {content: "  plain transcript  "}}],
	};

	assert.deepEqual(extractTranscriptionResultFromResponse(response), {title: "", transcription: "plain transcript"});
});

void test("extractTranscriptionResultFromResponse trims parsed title and transcript fields", () => {
	const response = {
		choices: [{message: {content: '{"title":"  Demo  ","transcription":"  transcript  "}'}}],
	};

	assert.deepEqual(extractTranscriptionResultFromResponse(response), {title: "Demo", transcription: "transcript"});
});

void test("extractTranscriptionResultFromResponse supports array content blocks", () => {
	const response = {
		choices: [
			{
				message: {
					content: [
						{type: "text", text: '{"title":"Demo recording",'},
						{type: "output_text", text: '"transcription":"first line\\nsecond line"}'},
					],
				},
			},
		],
	};

	assert.equal(extractTranscriptionResultFromResponse(response).transcription, "first line\nsecond line");
});

void test("extractTranscriptionResultFromResponse supports content fields in array blocks", () => {
	const response = {
		choices: [
			{
				message: {
					content: [
						{type: "output_text", content: '{"title":"Demo",'},
						{type: "output_text", content: '"transcription":"from content field"}'},
					],
				},
			},
		],
	};

	assert.deepEqual(extractTranscriptionResultFromResponse(response), {
		title: "Demo",
		transcription: "from content field",
	});
});

void test("extractTranscriptionResultFromResponse rejects missing and empty content", () => {
	assert.throws(() => extractTranscriptionResultFromResponse({choices: []}), /empty transcription/);
	assert.throws(
		() => extractTranscriptionResultFromResponse({choices: [{message: {content: []}}]}),
		/empty transcription/,
	);
});

void test("extractTranscriptionResultFromResponse ignores unusable content blocks", () => {
	const response = {
		choices: [
			{
				message: {
					content: [
						{type: "metadata", value: "ignored"},
						null,
						'{"title":"Demo","transcription":"kept"}',
					],
				},
			},
		],
	};

	assert.equal(extractTranscriptionResultFromResponse(response).transcription, "kept");
});

void test("extractTranscriptionResultFromResponse supports double-encoded JSON content", () => {
	const response = {
		choices: [
			{
				message: {
					content: JSON.stringify('{"title":"Data management reflections","transcription":"текст"}'),
				},
			},
		],
	};

	assert.deepEqual(extractTranscriptionResultFromResponse(response), {
		title: "Data management reflections",
		transcription: "текст",
	});
});

void test("extractTranscriptionResultFromResponse rejects malformed JSON-shaped content", () => {
	const response = {
		choices: [
			{
				message: {
					content: '{"title":"Data management reflections","transcription":}',
				},
			},
		],
	};

	assert.throws(() => extractTranscriptionResultFromResponse(response), /malformed transcription JSON/);
});

void test("extractTranscriptionResultFromResponse supports fenced and repaired content", () => {
	assert.deepEqual(
		extractTranscriptionResultFromResponse({
			choices: [{message: {content: '```json\n{"title":"Demo","transcription":"inside fence"}\n```'}}],
		}),
		{title: "Demo", transcription: "inside fence"},
	);
	assert.deepEqual(
		extractTranscriptionResultFromResponse({
			choices: [{message: {content: '{"title":"Demo","transcription":"line one\\nline two"}'}}],
		}),
		{title: "Demo", transcription: "line one\nline two"},
	);
	assert.deepEqual(
		extractTranscriptionResultFromResponse({
			choices: [{message: {content: 'prefix {"title":"Embedded","transcription":"inside object"} suffix'}}],
		}),
		{title: "Embedded", transcription: "inside object"},
	);
	assert.deepEqual(
		extractTranscriptionResultFromResponse({
			choices: [{message: {content: 'before\n```json\n{"title":"Not fenced","transcription":"whole text"}\n```\nafter'}}],
		}),
		{title: "Not fenced", transcription: "whole text"},
	);
});

void test("extractTranscriptionResultFromResponse repairs quoted transcripts with braces", () => {
	assert.deepEqual(
		extractTranscriptionResultFromResponse({
			choices: [{message: {content: '{"title":"Escaped \\"demo\\"","transcription":"line with } brace"}'}}],
		}),
		{title: 'Escaped "demo"', transcription: "line with } brace"},
	);
	assert.deepEqual(
		extractTranscriptionResultFromResponse({
			choices: [
				{
					message: {
						content:
							'{"title" : "  Escaped \\"demo\\"  ","transcription" : " first line\\nsecond line "}',
					},
				},
			],
		}),
		{title: 'Escaped "demo"', transcription: "first line\nsecond line"},
	);
});

void test("extractTitleFromResponse parses JSON and rejects empty titles", () => {
	assert.equal(
		extractTitleFromResponse({
			choices: [{message: {content: '{"title":"Useful summary"}'}}],
		}),
		"Useful summary",
	);
	assert.equal(
		extractTitleFromResponse({
			choices: [{message: {content: "  Plain summary  "}}],
		}),
		"Plain summary",
	);
	assert.equal(
		extractTitleFromResponse({
			choices: [{message: {content: '```json\n{"title":"Fenced summary"}\n```'}}],
		}),
		"Fenced summary",
	);
	assert.equal(
		extractTitleFromResponse({
			choices: [{message: {content: JSON.stringify('{"title":"Double encoded"}')}}],
		}),
		"Double encoded",
	);
	assert.equal(
		extractTitleFromResponse({
			choices: [{message: {content: 'prefix {"title":"Embedded summary"} suffix'}}],
		}),
		"Embedded summary",
	);
	assert.throws(
		() =>
			extractTitleFromResponse({
				choices: [{message: {content: '{"title":""}'}}],
			}),
		/without a usable English title/,
	);
	assert.throws(
		() =>
			extractTitleFromResponse({
				choices: [{message: {content: "{}"}}],
			}),
		/without a usable English title/,
	);
	assert.throws(
		() =>
			extractTitleFromResponse({
				choices: [{message: {content: ""}}],
			}),
		/without a usable English title/,
	);
	assert.throws(
		() =>
			extractTitleFromResponse({
				choices: [{message: {content: "  {not json}  "}}],
			}),
		/without a usable English title/,
	);
});

void test("requestTranscription sends the expected OpenRouter request and returns text", async () => {
	const capturedRequests: RequestUrlRequest[] = [];

	const transcription = await requestTranscription({
		apiKey: "test-key",
		audioBuffer: Uint8Array.from([1, 2, 3]).buffer,
		audioPath: "Recordings/demo.m4a",
		requestUrl: createSuccessfulOpenRouterStub(capturedRequests),
	});

	assert.deepEqual(transcription, {
		title: "Greeting",
		transcription: "hello world",
	});
	assertSuccessfulTranscriptionRequest(capturedRequests);
	assertSuccessfulTitleRequest(capturedRequests);
});

void test("requestTranscription rejects blank API keys before reading requests", async () => {
	await assert.rejects(
		requestTranscription({
			apiKey: "   ",
			audioBuffer: Uint8Array.from([1, 2, 3]).buffer,
			audioPath: "Recordings/demo.m4a",
			requestUrl: async () => {
				throw new Error("Should not request OpenRouter with a blank key.");
			},
		}),
		/OpenRouter API key is required/,
	);
});

void test("requestTranscription reports transcription request failures", async () => {
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(async () => ({
				status: 401,
				text: JSON.stringify({error: {message: "Invalid API key"}}),
			})),
		),
		/OpenRouter transcription request failed \(401\): Invalid API key/,
	);
});

void test("requestTranscription treats low non-2xx transcription statuses as failures", async () => {
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(async () => ({
				status: 199,
				text: "",
			})),
		),
		/OpenRouter transcription request failed \(199\): Unknown OpenRouter error\./,
	);
});

void test("requestTranscription treats status 300 as a transcription failure", async () => {
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(async () => ({
				status: 300,
				text: JSON.stringify({error: {message: "redirect"}}),
			})),
		),
		/OpenRouter transcription request failed \(300\): redirect/,
	);
});

void test("requestTranscription reports title request failures", async () => {
	await assert.rejects(
		requestTranscription(createRequestTranscriptionParams(createTitleFailureStub(503, "  unavailable  "))),
		/OpenRouter title request failed \(503\): unavailable/,
	);
});

void test("requestTranscription treats low non-2xx title statuses as failures", async () => {
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(createTitleFailureStub(199, JSON.stringify({error: {message: "too early"}}))),
		),
		/OpenRouter title request failed \(199\): too early/,
	);
});

void test("requestTranscription treats status 300 as a title failure", async () => {
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(createTitleFailureStub(300, JSON.stringify({error: {message: "redirect"}}))),
		),
		/OpenRouter title request failed \(300\): redirect/,
	);
});

function assertSuccessfulTranscriptionRequest(capturedRequests: RequestUrlRequest[]): void {
	assert.equal(capturedRequests.length, 2);
	const request = capturedRequests[0];
	assert.ok(request);
	assertRequestMetadata(request, OPENROUTER_AUDIO_TRANSCRIPTIONS_URL);

	const parsedTranscriptionBody = JSON.parse(request.body) as {
		model: string;
		input_audio: {format: string};
	};

	assert.equal(parsedTranscriptionBody.model, OPENROUTER_TRANSCRIPTION_MODEL);
	assert.equal(parsedTranscriptionBody.input_audio.format, "m4a");
}

function assertSuccessfulTitleRequest(capturedRequests: RequestUrlRequest[]): void {
	const request = capturedRequests[1];
	assert.ok(request);
	assertRequestMetadata(request, OPENROUTER_CHAT_COMPLETIONS_URL);
	const parsedTitleBody = JSON.parse(request.body) as {
		model: string;
		response_format: unknown;
		messages: Array<{content: Array<{type: string; text?: string}>;}>;
	};

	assert.equal(parsedTitleBody.model, OPENROUTER_TITLE_MODEL);
	assert.deepEqual(parsedTitleBody.response_format, TITLE_RESPONSE_FORMAT);
	assert.equal(parsedTitleBody.messages[0]?.content[1]?.type, "text");
	assert.equal(parsedTitleBody.messages[0]?.content[1]?.text, "hello world");
}

function assertRequestMetadata(request: RequestUrlRequest, url: string): void {
	assert.equal(request.url, url);
	assert.equal(request.method, "POST");
	assert.equal(request.throw, false);
	assert.equal(request.headers.Authorization, "Bearer test-key");
	assert.equal(request.headers["Content-Type"], "application/json");
	assert.equal(request.headers["X-OpenRouter-Title"], "Obsidian STT Plugin");
}

function createSuccessfulOpenRouterStub(capturedRequests: RequestUrlRequest[]) {
	return async (request: RequestUrlRequest) => {
		capturedRequests.push(request);
		if (request.url === OPENROUTER_AUDIO_TRANSCRIPTIONS_URL) {
			return {
				status: 200,
				text: JSON.stringify({text: "hello world"}),
			};
		}

		return {
			status: 200,
			text: JSON.stringify({
				choices: [
					{
						message: {
							content: '{"title":"Greeting"}',
						},
					},
				],
			}),
		};
	};
}

function createRequestTranscriptionParams(requestUrl: RequestTranscriptionParams["requestUrl"]): RequestTranscriptionParams {
	return {
		apiKey: "test-key",
		audioBuffer: Uint8Array.from([1]).buffer,
		audioPath: "Recordings/demo.m4a",
		requestUrl,
	};
}

function createTitleFailureStub(status: number, text: string): RequestTranscriptionParams["requestUrl"] {
	return async (request: RequestUrlRequest) => {
		if (request.url === OPENROUTER_AUDIO_TRANSCRIPTIONS_URL) {
			return {status: 200, text: JSON.stringify({text: "hello"})};
		}

		return {status, text};
	};
}

void test("requestTranscription surfaces provider errors", async () => {
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(async () => ({
				status: 401,
				text: JSON.stringify({
					error: {
						message: "Invalid API key",
					},
				}),
			})),
		),
		/OpenRouter transcription request failed \(401\): Invalid API key/,
	);
});

void test("requestTranscription surfaces title provider errors", async () => {
	await assert.rejects(
		requestTranscription(createRequestTranscriptionParams(createTitleFailureStub(500, "provider unavailable"))),
		/OpenRouter title request failed \(500\): provider unavailable/,
	);
});

void test("requestTranscription rejects missing keys and invalid JSON", async () => {
	await assert.rejects(
		requestTranscription({
			apiKey: " ",
			audioBuffer: Uint8Array.from([1]).buffer,
			audioPath: "Recordings/demo.m4a",
			requestUrl: async () => ({
				status: 200,
				text: "{}",
			}),
		}),
		/OpenRouter API key is required/,
	);
	await assert.rejects(
		requestTranscription(
			createRequestTranscriptionParams(async () => ({
				status: 200,
				text: "not json",
			})),
		),
		/invalid JSON response/,
	);
});
