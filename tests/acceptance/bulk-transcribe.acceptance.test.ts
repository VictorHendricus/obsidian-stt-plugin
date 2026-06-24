/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import {createPluginTestingApi} from "../../src/testing/plugin-testing-api.ts";

const bulkTranscribeEntryPoints = ["ribbon button", "command palette button"] as const;

for (const entryPoint of bulkTranscribeEntryPoints) {
	void test(`user opens bulk transcribe from the ${entryPoint} and transcribes all unwrapped recordings`, async () => {
		const api = createPluginTestingApi();
		const paths = ["Recordings/2025.m4a", "Recordings/2026.m4a"];

		for (const path of paths) {
			api.given.unwrappedAudio(path);
		}

		const modal = await api.when.bulkTranscribe(entryPoint);
		await modal.transcribeAll();

		api.then.transcription.expectRequests(paths);
		api.then.wrapper.expectCreatedFor(paths);

		for (const path of paths) {
			api.then.wrapper.expectGeneratedTitle(path);
			api.then.wrapper.expectTranscriptReturnedForRecording(path);
			api.then.wrapper.expectStatus("transcribed", path);
		}

		api.then.editor.expectNoInsertedLink();
		api.then.workspace.expectNoOpenedFile();
	});
}

void test("user uses bulk transcribe and skips already transcribed recordings", async () => {
	const api = createPluginTestingApi();

	api.given.unwrappedAudio("Recordings/idea.m4a");
	api.given.transcribedAudio("Recordings/done.m4a");

	const modal = await api.when.bulkTranscribe("ribbon button");
	await modal.transcribeAll();

	api.then.transcription.expectRequest("Recordings/idea.m4a");
	api.then.transcription.expectRequestCount(1);
	api.then.transcription.expectNoRequestFor("Recordings/done.m4a");
	api.then.wrapper.expectCreated("Recordings/idea.m4a");
	api.then.wrapper.expectNotCreated("Recordings/done.m4a");
});

void test("user chooses a single unwrapped recording without inserting an editor link", async () => {
	const api = createPluginTestingApi();

	api.given.unwrappedAudio("Recordings/idea.m4a");

	const modal = await api.when.bulkTranscribe("command palette button");
	await modal.chooseRecording("Recordings/idea.m4a");

	api.then.transcription.expectRequest("Recordings/idea.m4a");
	api.then.wrapper.expectCreated("Recordings/idea.m4a");
	api.then.wrapper.expectGeneratedTitle("Recordings/idea.m4a");
	api.then.wrapper.expectTranscriptReturnedForRecording("Recordings/idea.m4a");
	api.then.wrapper.expectStatus("transcribed", "Recordings/idea.m4a");
	api.then.editor.expectNoInsertedLink();
	api.then.workspace.expectOpenedWrapper("Recordings/idea.m4a");
});

void test("user chooses a single already-transcribed recording without sending a transcription request", async () => {
	const api = createPluginTestingApi();

	api.given.transcribedAudio("Recordings/done.m4a");

	const modal = await api.when.bulkTranscribe("command palette button");
	await modal.chooseRecording("Recordings/done.m4a");

	api.then.transcription.expectNoRequest();
	api.then.wrapper.expectNotCreated("Recordings/done.m4a");
	api.then.editor.expectNoInsertedLink();
	api.then.workspace.expectOpenedWrapper("Recordings/done.m4a");
});

void test("user opens bulk transcribe and sees an empty-state notice when there are no matching recordings", async () => {
	const api = createPluginTestingApi();

	const modal = await api.when.bulkTranscribe("ribbon button");
	await modal.transcribeAll();

	api.then.transcription.expectNoRequest();
	api.then.wrapper.expectCreatedCount(0);
	api.then.editor.expectNoInsertedLink();
	api.then.workspace.expectNoOpenedFile();
	api.then.notifications.expectEmitted();
});
