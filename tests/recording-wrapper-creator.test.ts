/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import type {App, RequestUrlParam, TAbstractFile, TFile} from "obsidian";
import {
	OPENROUTER_AUDIO_TRANSCRIPTIONS_URL,
	OPENROUTER_CHAT_COMPLETIONS_URL,
	type RequestUrlRequest,
} from "../src/openrouter.ts";
import {transcribeRecordingIntoWrapper} from "../src/recording-wrapper-creator.ts";

void test("transcribeRecordingIntoWrapper creates a root wrapper with the generated title", async () => {
	const app = createFakeApp();
	const audio = app.addAudio("Recordings/idea.m4a");
	const requests: RequestUrlRequest[] = [];

	const result = await transcribeRecordingIntoWrapper({
		app: app.app,
		apiKey: "test-key",
		audio,
		requestUrl: createSuccessfulOpenRouterStub(requests),
		now: () => new Date(2026, 4, 10, 9, 8, 7),
	});

	assert.equal(result.created, true);
	assert.equal(result.transcribed, true);
	assert.equal(result.wrapper.path, "Generated title.md");
	assert.equal(app.hasFile("Recordings/idea.md"), false);

	const content = app.readText("Generated title.md");
	assert.match(content, /# Generated title/);
	assert.match(content, /status: transcribed/);
	assert.match(content, /!\[\[Recordings\/idea\.m4a\]\]/);
	assert.match(content, /Transcript returned by Whisper/);
	assert.equal(requests.length, 2);
	assert.equal(requests[0]?.url, OPENROUTER_AUDIO_TRANSCRIPTIONS_URL);
	assert.equal(requests[1]?.url, OPENROUTER_CHAT_COMPLETIONS_URL);
});

void test("transcribeRecordingIntoWrapper recreates failed wrappers at the root from a complete template", async () => {
	const app = createFakeApp({readBinaryError: new Error("Audio file is damaged")});
	const audio = app.addAudio("Recordings/damaged.m4a");
	const existingWrapper = app.addMarkdown("Recordings/damaged.md", "broken partial content");

	const result = await transcribeRecordingIntoWrapper({
		app: app.app,
		apiKey: "test-key",
		audio,
		existingWrapper,
		requestUrl: async () => {
			throw new Error("Should not request transcription when reading audio fails.");
		},
		now: () => new Date(2026, 4, 10, 9, 8, 7),
	});

	assert.equal(result.created, false);
	assert.equal(result.transcribed, false);
	assert.equal(result.wrapper.path, "damaged.md");
	assert.equal(app.hasFile("Recordings/damaged.md"), false);

	const content = app.readText("damaged.md");
	assert.match(content, /type: voice-note/);
	assert.match(content, /# damaged/);
	assert.match(content, /status: failed/);
	assert.match(content, /!\[\[Recordings\/damaged\.m4a\]\]/);
	assert.match(content, /Audio file is damaged/);
	assert.doesNotMatch(content, /broken partial content/);
});

interface FakeApp {
	app: App;
	addAudio(path: string): TFile;
	addMarkdown(path: string, content: string): TFile;
	hasFile(path: string): boolean;
	readText(path: string): string;
}

function createFakeApp(options: {readBinaryError?: Error} = {}): FakeApp {
	const files = new Map<string, TFile>();
	const contents = new Map<string, string>();

	const vault = {
		create: async (path: string, data: string): Promise<TFile> => {
			const file = createFile(path);
			files.set(path, file);
			contents.set(path, data);
			return file;
		},
		modify: async (file: TFile, data: string): Promise<void> => {
			contents.set(file.path, data);
		},
		readBinary: async (): Promise<ArrayBuffer> => {
			if (options.readBinaryError) {
				throw options.readBinaryError;
			}

			return Uint8Array.from([1, 2, 3]).buffer;
		},
		getAbstractFileByPath: (path: string): TAbstractFile | null => files.get(path) ?? null,
	};

	const fileManager = {
		getNewFileParent: () => ({path: "/"}),
		generateMarkdownLink: (file: TFile): string => `[[${file.path}]]`,
		renameFile: async (file: TAbstractFile, newPath: string): Promise<void> => {
			if (!isFile(file)) {
				throw new Error("Expected a file to rename.");
			}

			files.delete(file.path);
			const content = contents.get(file.path);
			contents.delete(file.path);
			file.path = newPath;
			file.basename = basename(newPath);
			file.extension = extension(newPath);
			files.set(newPath, file);
			if (content !== undefined) {
				contents.set(newPath, content);
			}
		},
	};

	return {
		app: {vault, fileManager} as unknown as App,
		addAudio(path) {
			const file = createFile(path);
			files.set(path, file);
			return file;
		},
		addMarkdown(path, content) {
			const file = createFile(path);
			files.set(path, file);
			contents.set(path, content);
			return file;
		},
		hasFile(path) {
			return files.has(path);
		},
		readText(path) {
			const content = contents.get(path);
			if (content === undefined) {
				throw new Error(`Expected ${path} to exist.`);
			}

			return content;
		},
	};
}

function createSuccessfulOpenRouterStub(capturedRequests: RequestUrlRequest[]) {
	return async (request: RequestUrlParam) => {
		const capturedRequest = request as RequestUrlRequest;
		capturedRequests.push(capturedRequest);

		if (capturedRequest.url === OPENROUTER_AUDIO_TRANSCRIPTIONS_URL) {
			return {
				status: 200,
				text: JSON.stringify({text: "Transcript returned by Whisper"}),
			};
		}

		return {
			status: 200,
			text: JSON.stringify({
				choices: [{message: {content: '{"title":"Generated title"}'}}],
			}),
		};
	};
}

function createFile(path: string): TFile {
	return new FakeTFile(path);
}

function basename(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
}

function extension(path: string): string {
	return path.split(".").pop() ?? "";
}

function isFile(file: TAbstractFile): file is TFile {
	return "extension" in file;
}

class FakeTFile implements TFile {
	vault!: TFile["vault"];
	path: string;
	name: string;
	parent = null;
	stat = {ctime: new Date(2026, 4, 9).getTime(), mtime: new Date(2026, 4, 9).getTime(), size: 1};
	basename: string;
	extension: string;

	constructor(path: string) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
		this.basename = basename(path);
		this.extension = extension(path);
	}
}
