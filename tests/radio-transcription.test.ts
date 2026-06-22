/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import type {App, TFile} from "obsidian";
import {createRecordingAttachmentFilename, saveRecordedAudioAttachment} from "../src/radio-recording-save.ts";
import {formatRadioTranscriptWithSummary, getRecordedAudioFormat, selectRecorderFormat} from "../src/radio-transcription.ts";

void test("selectRecorderFormat prefers mobile-friendly mp4 when supported", () => {
	const selected = selectRecorderFormat((mimeType) => mimeType === "audio/mp4" || mimeType === "audio/webm;codecs=opus");

	assert.deepEqual(selected, {
		mimeType: "audio/mp4",
		format: "m4a",
	});
});

void test("selectRecorderFormat prefers webm opus when supported", () => {
	const selected = selectRecorderFormat((mimeType) => mimeType === "audio/webm;codecs=opus");

	assert.deepEqual(selected, {
		mimeType: "audio/webm;codecs=opus",
		format: "webm",
	});
});

void test("selectRecorderFormat selects mp4 when it is the only supported format", () => {
	const selected = selectRecorderFormat((mimeType) => mimeType === "audio/mp4");

	assert.deepEqual(selected, {
		mimeType: "audio/mp4",
		format: "m4a",
	});
});

void test("selectRecorderFormat reports unsupported recorders", () => {
	assert.equal(selectRecorderFormat(() => false), null);
});

void test("getRecordedAudioFormat maps media recorder mime types to OpenRouter formats", () => {
	assert.equal(getRecordedAudioFormat("audio/webm;codecs=opus"), "webm");
	assert.equal(getRecordedAudioFormat("audio/mp4"), "m4a");
	assert.equal(getRecordedAudioFormat("audio/mpeg"), "mp3");
	assert.equal(getRecordedAudioFormat("audio/ogg;codecs=opus"), "ogg");
	assert.equal(getRecordedAudioFormat("audio/wav"), "wav");
	assert.throws(() => getRecordedAudioFormat("audio/aac"), /not supported/);
});

void test("formatRadioTranscriptWithSummary matches the note insertion structure", () => {
	assert.equal(
		formatRadioTranscriptWithSummary("Actual transcription text", ["Point 1", "Point 2"]),
		[
			"ST",
			"    - Transcription:",
			"        - Actual transcription text",
			"    - Summary:",
			"        - Point 1",
			"        - Point 2",
		].join("\n"),
	);
});

void test("createRecordingAttachmentFilename creates a safe m4a attachment name", () => {
	assert.equal(
		createRecordingAttachmentFilename("m4a", new Date(2026, 4, 10, 9, 8, 7)),
		"Radio recording 20260510-090807.m4a",
	);
});

void test("saveRecordedAudioAttachment uses the default attachment location", async () => {
	const app = createFakeApp("Attachments/Radio recording 20260510-090807.m4a");
	const audioBuffer = Uint8Array.from([1, 2, 3]).buffer;

	const saved = await saveRecordedAudioAttachment({
		app,
		audio: {buffer: audioBuffer, format: "m4a"},
		now: () => new Date(2026, 4, 10, 9, 8, 7),
		sourcePath: "Notes/current.md",
	});

	assert.equal(saved.path, "Attachments/Radio recording 20260510-090807.m4a");
	assert.equal(app.capturedFilename, "Radio recording 20260510-090807.m4a");
	assert.equal(app.capturedSourcePath, "Notes/current.md");
	assert.equal(app.capturedBinary, audioBuffer);
});

interface FakeApp extends App {
	capturedBinary: ArrayBuffer | null;
	capturedFilename: string;
	capturedSourcePath: string | undefined;
}

function createFakeApp(attachmentPath: string): FakeApp {
	const app = {
		capturedBinary: null,
		capturedFilename: "",
		capturedSourcePath: undefined,
		fileManager: {
			getAvailablePathForAttachment: async (filename: string, sourcePath?: string): Promise<string> => {
				app.capturedFilename = filename;
				app.capturedSourcePath = sourcePath;
				return attachmentPath;
			},
		},
		vault: {
			createBinary: async (path: string, data: ArrayBuffer): Promise<TFile> => {
				app.capturedBinary = data;
				return new FakeTFile(path);
			},
		},
	} as FakeApp;

	return app;
}

class FakeTFile implements TFile {
	vault!: TFile["vault"];
	path: string;
	name: string;
	parent = null;
	stat = {ctime: new Date(2026, 4, 10).getTime(), mtime: new Date(2026, 4, 10).getTime(), size: 1};
	basename: string;
	extension: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
		this.basename = this.name.replace(/\.[^.]+$/, "");
		this.extension = path.split(".").pop() ?? "";
	}
}
