/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import {createPluginTestingApi} from "../src/testing/plugin-testing-api.ts";

const bulkTranscriptionEntryPoints = ["ribbon button", "command palette button"] as const;

for (const entryPoint of bulkTranscriptionEntryPoints) {
	void test(`user bulk transcribes all unwrapped recordings from the ${entryPoint}`, async () => {
		const api = createPluginTestingApi();
		const paths = ["Recordings/2025.m4a", "Recordings/2026.m4a"];

		for (const path of paths) {
			api.vault.addUnwrappedAudio(path);
		}

		await api.plugin.bulkTranscribeRecordings(entryPoint);

		api.transcription.expectRequests(paths);
		api.wrapper.expectCreatedFor(paths);

		for (const path of paths) {
			api.wrapper.expectGeneratedTitle(path);
			api.wrapper.expectTranscriptReturnedForRecording(path);
			api.wrapper.expectStatus("transcribed", path);
		}

		api.editor.expectNoInsertedLink();
		api.workspace.expectNoOpenedFile();
	});
}

void test("user bulk transcribes unwrapped recordings and skips already transcribed recordings", async () => {
	const api = createPluginTestingApi();

	api.vault.addUnwrappedAudio("Recordings/idea.m4a");
	api.vault.addTranscribedAudio("Recordings/done.m4a");

	await api.plugin.bulkTranscribeRecordings("ribbon button");

	api.transcription.expectRequest("Recordings/idea.m4a");
	api.transcription.expectNoRequestFor("Recordings/done.m4a");
	api.wrapper.expectCreated("Recordings/idea.m4a");
	api.wrapper.expectNotCreated("Recordings/done.m4a");
});

void test("user bulk transcribes when there are no unwrapped recordings", async () => {
	const api = createPluginTestingApi();

	await api.plugin.bulkTranscribeRecordings("ribbon button");

	api.transcription.expectNoRequest();
	api.wrapper.expectCreatedCount(0);
	api.editor.expectNoInsertedLink();
	api.workspace.expectNoOpenedFile();
	api.notifications.expectEmitted();
});
