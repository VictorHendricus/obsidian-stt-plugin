/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {
	createTranscriptionRequestBody,
	encodeArrayBufferToBase64,
	extractTranscriptionFromResponse,
	OPENROUTER_CHAT_COMPLETIONS_URL,
	OPENROUTER_MODEL,
	requestTranscription,
	TRANSCRIPTION_PROMPT,
	type RequestUrlRequest,
} from "../src/openrouter.ts";

void test("encodeArrayBufferToBase64 encodes raw audio bytes", () => {
	const buffer = Uint8Array.from([0, 1, 2, 3, 255]).buffer;
	assert.equal(encodeArrayBufferToBase64(buffer), "AAECA/8=");
});

void test("createTranscriptionRequestBody matches the OpenRouter chat format", () => {
	const body = createTranscriptionRequestBody("ZmFrZS1hdWRpbw==", "mp3");

	assert.equal(body.model, OPENROUTER_MODEL);
	assert.deepEqual(body.reasoning, {
		effort: "minimal",
		exclude: true,
	});
	assert.equal(body.messages[0]?.content[0].text, TRANSCRIPTION_PROMPT);
	assert.deepEqual(body.messages[0]?.content[1], {
		type: "input_audio",
		input_audio: {
			data: "ZmFrZS1hdWRpbw==",
			format: "mp3",
		},
	});
});

void test("extractTranscriptionFromResponse supports string content", () => {
	const response = {
		choices: [
			{
				message: {
					content: "transcribed text",
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
						{type: "text", text: "first line"},
						{type: "output_text", text: "second line"},
					],
				},
			},
		],
	};

	assert.equal(extractTranscriptionFromResponse(response), "first line\nsecond line");
});

void test("requestTranscription sends the expected OpenRouter request and returns text", async () => {
	let capturedRequest: RequestUrlRequest | undefined;

	const transcription = await requestTranscription({
		apiKey: "test-key",
		audioBuffer: Uint8Array.from([1, 2, 3]).buffer,
		audioPath: "Recordings/demo.mp3",
		requestUrl: async (request) => {
			capturedRequest = request;
			return {
				status: 200,
				text: JSON.stringify({
					choices: [
						{
							message: {
								content: "hello world",
							},
						},
					],
				}),
			};
		},
	});

	assert.equal(transcription, "hello world");
	assert.ok(capturedRequest);
	assert.equal(capturedRequest.url, OPENROUTER_CHAT_COMPLETIONS_URL);
	assert.equal(capturedRequest.method, "POST");
	assert.equal(capturedRequest.throw, false);
	assert.equal(capturedRequest.headers.Authorization, "Bearer test-key");
	assert.equal(capturedRequest.headers["Content-Type"], "application/json");

	const parsedBody = JSON.parse(capturedRequest.body) as {
		model: string;
		messages: Array<{content: Array<{type: string; input_audio?: {format: string}}>;}>;
	};

	assert.equal(parsedBody.model, OPENROUTER_MODEL);
	assert.equal(parsedBody.messages[0]?.content[1]?.type, "input_audio");
	assert.equal(parsedBody.messages[0]?.content[1]?.input_audio?.format, "mp3");
});

void test("requestTranscription surfaces provider errors", async () => {
	await assert.rejects(
		requestTranscription({
			apiKey: "test-key",
			audioBuffer: Uint8Array.from([1]).buffer,
			audioPath: "Recordings/demo.mp3",
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
