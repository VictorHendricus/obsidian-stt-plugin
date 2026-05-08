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
	type RequestUrlRequest,
} from "../src/openrouter.ts";

void test("encodeArrayBufferToBase64 encodes raw audio bytes", () => {
	const buffer = Uint8Array.from([0, 1, 2, 3, 255]).buffer;
	assert.equal(encodeArrayBufferToBase64(buffer), "AAECA/8=");
});

void test("getAudioFormat extracts a lowercase extension", () => {
	assert.equal(getAudioFormat("Recordings/Demo.MP3"), "mp3");
	assert.throws(() => getAudioFormat(""), /valid extension/);
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

void test("extractTranscriptionFromResponse supports audio transcription text", () => {
	assert.equal(extractTranscriptionFromResponse({text: "transcribed text"}), "transcribed text");
	assert.equal(extractTranscriptionFromResponse({transcription: "legacy text"}), "legacy text");
	assert.throws(() => extractTranscriptionFromResponse({text: ""}), /empty transcription/);
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
			choices: [{message: {content: "Plain summary"}}],
		}),
		"Plain summary",
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

function assertSuccessfulTranscriptionRequest(capturedRequests: RequestUrlRequest[]): void {
	assert.equal(capturedRequests.length, 2);
	assert.equal(capturedRequests[0]?.url, OPENROUTER_AUDIO_TRANSCRIPTIONS_URL);
	assert.equal(capturedRequests[0]?.method, "POST");
	assert.equal(capturedRequests[0]?.throw, false);
	assert.equal(capturedRequests[0]?.headers.Authorization, "Bearer test-key");
	assert.equal(capturedRequests[0]?.headers["Content-Type"], "application/json");

	const parsedTranscriptionBody = JSON.parse(capturedRequests[0]?.body ?? "") as {
		model: string;
		input_audio: {format: string};
	};

	assert.equal(parsedTranscriptionBody.model, OPENROUTER_TRANSCRIPTION_MODEL);
	assert.equal(parsedTranscriptionBody.input_audio.format, "m4a");
}

function assertSuccessfulTitleRequest(capturedRequests: RequestUrlRequest[]): void {
	assert.equal(capturedRequests[1]?.url, OPENROUTER_CHAT_COMPLETIONS_URL);
	const parsedTitleBody = JSON.parse(capturedRequests[1]?.body ?? "") as {
		model: string;
		response_format: unknown;
		messages: Array<{content: Array<{type: string; text?: string}>;}>;
	};

	assert.equal(parsedTitleBody.model, OPENROUTER_TITLE_MODEL);
	assert.deepEqual(parsedTitleBody.response_format, TITLE_RESPONSE_FORMAT);
	assert.equal(parsedTitleBody.messages[0]?.content[1]?.type, "text");
	assert.equal(parsedTitleBody.messages[0]?.content[1]?.text, "hello world");
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

void test("requestTranscription surfaces provider errors", async () => {
	await assert.rejects(
		requestTranscription({
			apiKey: "test-key",
			audioBuffer: Uint8Array.from([1]).buffer,
			audioPath: "Recordings/demo.m4a",
			requestUrl: async () => ({
				status: 401,
				text: JSON.stringify({
					error: {
						message: "Invalid API key",
					},
				}),
			}),
		}),
		/OpenRouter transcription request failed \(401\): Invalid API key/,
	);
});

void test("requestTranscription surfaces title provider errors", async () => {
	await assert.rejects(
		requestTranscription({
			apiKey: "test-key",
			audioBuffer: Uint8Array.from([1]).buffer,
			audioPath: "Recordings/demo.m4a",
			requestUrl: async (request) => {
				if (request.url === OPENROUTER_AUDIO_TRANSCRIPTIONS_URL) {
					return {
						status: 200,
						text: JSON.stringify({text: "hello"}),
					};
				}

				return {
					status: 500,
					text: "provider unavailable",
				};
			},
		}),
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
		requestTranscription({
			apiKey: "test-key",
			audioBuffer: Uint8Array.from([1]).buffer,
			audioPath: "Recordings/demo.m4a",
			requestUrl: async () => ({
				status: 200,
				text: "not json",
			}),
		}),
		/invalid JSON response/,
	);
});
