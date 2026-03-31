/* eslint-disable import/no-nodejs-modules */
/* eslint-disable no-console */
/* eslint-disable no-restricted-globals */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
	OPENROUTER_CHAT_COMPLETIONS_URL,
	requestTranscription,
	type RequestUrlRequest,
	type RequestUrlResponse,
} from "../src/openrouter.ts";

const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
const fixtureFileName = process.env.OPENROUTER_AUDIO_FIXTURE?.trim() || "How to Convert Audio to MP3 - Pixel & Bracket.mp3";
const fixturePath = path.resolve("tests", fixtureFileName);

void test(
	"requestTranscription transcribes the real audio fixture through OpenRouter",
	{
		skip: apiKey.length === 0 ? "Set OPENROUTER_API_KEY in .env.test to run this test." : false,
		timeout: 120_000,
	},
	async () => {
		const audioBuffer = await readFile(fixturePath);
		const transcription = await requestTranscription({
			apiKey,
			audioBuffer: toArrayBuffer(audioBuffer),
			audioPath: fixtureFileName,
			requestUrl: fetchOpenRouter,
		});

		assert.match(transcription, /[A-Za-z]/, "Expected the transcription to contain human-readable text.");
		assert.ok(transcription.trim().length >= 20, "Expected a non-trivial transcription.");

		console.log(`Fixture: ${fixtureFileName}`);
		console.log(`Transcription preview: ${transcription.slice(0, 200)}`);
	},
);

async function fetchOpenRouter(request: RequestUrlRequest): Promise<RequestUrlResponse> {
	const response = await fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body,
	});

	return {
		status: response.status,
		text: await response.text(),
	};
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

void test("integration fixture exists", async () => {
	const audioBuffer = await readFile(fixturePath);
	assert.ok(audioBuffer.byteLength > 0);
	assert.ok([".m4a", ".mp3"].includes(path.extname(fixturePath).toLowerCase()));
	assert.equal(OPENROUTER_CHAT_COMPLETIONS_URL, "https://openrouter.ai/api/v1/chat/completions");
});
