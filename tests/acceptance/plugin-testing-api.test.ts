/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {createPluginTestingApi} from "../../src/testing/plugin-testing-api.ts";

void test("testing API assertions fail with useful messages", () => {
	const api = createPluginTestingApi();

	assert.throws(
		() => api.then.wrapper.expectCreated("Recordings/missing.m4a"),
		/Expected audio file Recordings\/missing\.m4a to exist/,
	);
});

void test("testing API models explicit wrapper creation from the ribbon action", async () => {
	const api = createPluginTestingApi();

	api.given.unwrappedAudio("Recordings/idea.m4a");

	await api.when.createMissingRecordingWrappers();

	api.then.wrapper.expectCreated();
	api.then.wrapper.expectCreatedCount(1);
	api.then.wrapper.expectStatus("raw");
	api.then.editor.expectNoInsertedLink();
	api.then.workspace.expectNoOpenedFile();
});

void test("testing API skips recordings that already have wrappers", async () => {
	const api = createPluginTestingApi();

	api.given.wrappedAudio("Recordings/idea.m4a");

	await api.when.createMissingRecordingWrappers();

	api.then.wrapper.expectCreatedCount(0);
});

void test("testing API models File Transcribe all from the ribbon action", async () => {
	const api = createPluginTestingApi();

	api.given.unwrappedAudio("Recordings/idea.m4a");

	const modal = await api.when.fileTranscribe();
	await modal.transcribeAll();

	api.then.wrapper.expectCreated();
	api.then.wrapper.expectCreatedCount(1);
	api.then.transcription.expectRequestCount(1);
	api.then.wrapper.expectStatus("transcribed");
	api.then.editor.expectNoInsertedLink();
	api.then.workspace.expectNoOpenedFile();
});

void test("testing API skips recordings that are already transcribed", async () => {
	const api = createPluginTestingApi();

	api.given.transcribedAudio("Recordings/idea.m4a");

	const modal = await api.when.fileTranscribe();
	await modal.transcribeAll();

	api.then.wrapper.expectCreatedCount(0);
	api.then.transcription.expectNoRequest();
});
