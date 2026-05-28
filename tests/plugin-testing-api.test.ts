/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {createPluginTestingApi} from "../src/testing/plugin-testing-api.ts";

void test("testing API assertions fail with useful messages", () => {
	const api = createPluginTestingApi();

	assert.throws(
		() => api.wrapper.expectCreated("Recordings/missing.m4a"),
		/Expected audio file Recordings\/missing\.m4a to exist/,
	);
});

void test("testing API models explicit wrapper creation from the ribbon action", async () => {
	const api = createPluginTestingApi();

	api.vault.addUnwrappedAudio("Recordings/idea.m4a");

	await api.plugin.createMissingRecordingWrappers();

	api.wrapper.expectCreated();
	api.wrapper.expectCreatedCount(1);
	api.wrapper.expectStatus("raw");
	api.editor.expectNoInsertedLink();
	api.workspace.expectNoOpenedFile();
});

void test("testing API skips recordings that already have wrappers", async () => {
	const api = createPluginTestingApi();

	api.vault.addWrappedAudio("Recordings/idea.m4a");

	await api.plugin.createMissingRecordingWrappers();

	api.wrapper.expectCreatedCount(0);
});

void test("testing API models File Transcribe all from the ribbon action", async () => {
	const api = createPluginTestingApi();

	api.vault.addUnwrappedAudio("Recordings/idea.m4a");

	const modal = await api.plugin.fileTranscribe();
	await modal.transcribeAll();

	api.wrapper.expectCreated();
	api.wrapper.expectCreatedCount(1);
	api.transcription.expectRequestCount(1);
	api.wrapper.expectStatus("transcribed");
	api.editor.expectNoInsertedLink();
	api.workspace.expectNoOpenedFile();
});

void test("testing API skips recordings that are already transcribed", async () => {
	const api = createPluginTestingApi();

	api.vault.addTranscribedAudio("Recordings/idea.m4a");

	const modal = await api.plugin.fileTranscribe();
	await modal.transcribeAll();

	api.wrapper.expectCreatedCount(0);
	api.transcription.expectNoRequest();
});
