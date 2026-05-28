/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import {createPluginTestingApi} from "../src/testing/plugin-testing-api.ts";

const fileTranscribeEntryPoints = ["ribbon button", "command palette button"] as const;

for (const entryPoint of fileTranscribeEntryPoints) {
	void test(`user opens File Transcribe from the ${entryPoint} and transcribes all unwrapped recordings`, async () => {
		const api = createPluginTestingApi();
		const paths = ["Recordings/2025.m4a", "Recordings/2026.m4a"];

		for (const path of paths) {
			api.vault.addUnwrappedAudio(path);
		}

		const modal = await api.plugin.fileTranscribe(entryPoint);
		await modal.transcribeAll();

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

void test("user uses File Transcribe all and skips already transcribed recordings", async () => {
	const api = createPluginTestingApi();

	api.vault.addUnwrappedAudio("Recordings/idea.m4a");
	api.vault.addTranscribedAudio("Recordings/done.m4a");

	const modal = await api.plugin.fileTranscribe("ribbon button");
	await modal.transcribeAll();

	api.transcription.expectRequest("Recordings/idea.m4a");
	api.transcription.expectNoRequestFor("Recordings/done.m4a");
	api.wrapper.expectCreated("Recordings/idea.m4a");
	api.wrapper.expectNotCreated("Recordings/done.m4a");
});

void test("user chooses a single unwrapped recording without inserting an editor link", async () => {
	const api = createPluginTestingApi();

	api.vault.addUnwrappedAudio("Recordings/idea.m4a");

	const modal = await api.plugin.fileTranscribe("command palette button");
	await modal.chooseRecording("Recordings/idea.m4a");

	api.transcription.expectRequest("Recordings/idea.m4a");
	api.wrapper.expectCreated("Recordings/idea.m4a");
	api.wrapper.expectGeneratedTitle("Recordings/idea.m4a");
	api.wrapper.expectTranscriptReturnedForRecording("Recordings/idea.m4a");
	api.wrapper.expectStatus("transcribed", "Recordings/idea.m4a");
	api.editor.expectNoInsertedLink();
	api.workspace.expectOpenedWrapper("Recordings/idea.m4a");
});

void test("user chooses a single already-transcribed recording without sending a transcription request", async () => {
	const api = createPluginTestingApi();

	api.vault.addTranscribedAudio("Recordings/done.m4a");

	const modal = await api.plugin.fileTranscribe("command palette button");
	await modal.chooseRecording("Recordings/done.m4a");

	api.transcription.expectNoRequest();
	api.wrapper.expectNotCreated("Recordings/done.m4a");
	api.editor.expectNoInsertedLink();
	api.workspace.expectOpenedWrapper("Recordings/done.m4a");
});

void test("user opens File Transcribe and sees an empty-state notice when there are no matching recordings", async () => {
	const api = createPluginTestingApi();

	const modal = await api.plugin.fileTranscribe("ribbon button");
	await modal.transcribeAll();

	api.transcription.expectNoRequest();
	api.wrapper.expectCreatedCount(0);
	api.editor.expectNoInsertedLink();
	api.workspace.expectNoOpenedFile();
	api.notifications.expectEmitted();
});
