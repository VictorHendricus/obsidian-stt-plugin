/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {
	createTranscriptionRequestBody,
	encodeArrayBufferToBase64,
	extractTranscriptionFromResponse,
	extractTranscriptionResultFromResponse,
	OPENROUTER_CHAT_COMPLETIONS_URL,
	OPENROUTER_MODEL,
	requestTranscription,
	TRANSCRIPTION_PROMPT,
	TRANSCRIPTION_RESPONSE_FORMAT,
	type RequestUrlRequest,
} from "../src/openrouter.ts";

void test("encodeArrayBufferToBase64 encodes raw audio bytes", () => {
	const buffer = Uint8Array.from([0, 1, 2, 3, 255]).buffer;
	assert.equal(encodeArrayBufferToBase64(buffer), "AAECA/8=");
});

void test("createTranscriptionRequestBody matches the OpenRouter chat format", () => {
	const body = createTranscriptionRequestBody("ZmFrZS1hdWRpbw==", "m4a");

	assert.equal(body.model, OPENROUTER_MODEL);
	assert.deepEqual(body.reasoning, {
		effort: "minimal",
		exclude: true,
	});
	assert.deepEqual(body.response_format, TRANSCRIPTION_RESPONSE_FORMAT);
	assert.equal(body.messages[0]?.content[0].text, TRANSCRIPTION_PROMPT);
	assert.deepEqual(body.messages[0]?.content[1], {
		type: "input_audio",
		input_audio: {
			data: "ZmFrZS1hdWRpbw==",
			format: "m4a",
		},
	});
});

void test("extractTranscriptionFromResponse supports string content", () => {
	const response = {
		choices: [
			{
				message: {
					content: '{"title":"Demo recording","transcription":"transcribed text"}',
				},
			},
		],
	};

	assert.equal(extractTranscriptionFromResponse(response), "transcribed text");
});

void test("extractTranscriptionFromResponse supports array content blocks", () => {
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

	assert.equal(extractTranscriptionFromResponse(response), "first line\nsecond line");
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

void test("extractTranscriptionResultFromResponse rejects content without a title", () => {
	const response = {
		choices: [
			{
				message: {
					content: "plain transcript only",
				},
			},
		],
	};

	assert.throws(() => extractTranscriptionResultFromResponse(response), /without a usable English title/);
});

void test("requestTranscription sends the expected OpenRouter request and returns text", async () => {
	let capturedRequest: RequestUrlRequest | undefined;

	const transcription = await requestTranscription({
		apiKey: "test-key",
		audioBuffer: Uint8Array.from([1, 2, 3]).buffer,
		audioPath: "Recordings/demo.m4a",
		requestUrl: async (request) => {
			capturedRequest = request;
			return {
				status: 200,
				text: JSON.stringify({
					choices: [
						{
							message: {
								content: '{"title":"Greeting","transcription":"hello world"}',
							},
						},
					],
				}),
			};
		},
	});

	assert.deepEqual(transcription, {
		title: "Greeting",
		transcription: "hello world",
	});
	assert.ok(capturedRequest);
	assert.equal(capturedRequest.url, OPENROUTER_CHAT_COMPLETIONS_URL);
	assert.equal(capturedRequest.method, "POST");
	assert.equal(capturedRequest.throw, false);
	assert.equal(capturedRequest.headers.Authorization, "Bearer test-key");
	assert.equal(capturedRequest.headers["Content-Type"], "application/json");

	const parsedBody = JSON.parse(capturedRequest.body) as {
		model: string;
		response_format: unknown;
		messages: Array<{content: Array<{type: string; input_audio?: {format: string}}>;}>;
	};

	assert.equal(parsedBody.model, OPENROUTER_MODEL);
	assert.deepEqual(parsedBody.response_format, TRANSCRIPTION_RESPONSE_FORMAT);
	assert.equal(parsedBody.messages[0]?.content[1]?.type, "input_audio");
	assert.equal(parsedBody.messages[0]?.content[1]?.input_audio?.format, "m4a");
});

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
		/OpenRouter request failed \(401\): Invalid API key/,
	);
});
