/* eslint-disable import/no-nodejs-modules */
import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import type {App, RequestUrlParam, TAbstractFile, TFile, Vault} from "obsidian";
import {
	OPENROUTER_AUDIO_TRANSCRIPTIONS_URL,
	OPENROUTER_CHAT_COMPLETIONS_URL,
	type RequestUrlRequest,
} from "../openrouter.ts";
import {bulkTranscribeRecordings, transcribeRecordingIntoWrapper} from "../recording-wrapper-creator.ts";
import {buildRecordingCandidates, getTranscriptStatus} from "../recording-wrappers.ts";

type EntryPoint = "ribbon button" | "command palette button";

interface TestingState {
	app: FakeObsidianApp;
	transcriptionRequests: string[];
	insertedLinks: string[];
	openedFiles: string[];
	notifications: string[];
	wrappersCreatedByAction: string[];
}

export interface PluginTestingApi {
	given: {
		unwrappedAudio(path: string): void;
		transcribedAudio(path: string): void;
	};
	when: {
		bulkTranscribe(entryPoint?: EntryPoint): Promise<{
			transcribeAll(): Promise<void>;
			chooseRecording(path: string): Promise<void>;
		}>;
	};
	then: {
		transcription: {
			expectNoRequest(): void;
			expectRequest(path: string): void;
			expectNoRequestFor(path: string): void;
			expectRequests(paths: string[]): void;
			expectRequestCount(expectedCount: number): void;
		};
		wrapper: {
			expectCreated(path?: string): void;
			expectNotCreated(path: string): void;
			expectCreatedFor(paths: string[]): void;
			expectCreatedCount(expectedCount: number): void;
			expectStatus(status: string, path?: string): void;
			expectGeneratedTitle(path?: string): void;
			expectTranscriptReturnedForRecording(path?: string): void;
		};
		editor: {
			expectNoInsertedLink(): void;
		};
		workspace: {
			expectNoOpenedFile(): void;
			expectOpenedWrapper(path: string): void;
		};
		notifications: {
			expectEmitted(): void;
		};
	};
}

export function createPluginTestingApi(): PluginTestingApi {
	const state: TestingState = {
		app: createFakeObsidianApp(),
		transcriptionRequests: [],
		insertedLinks: [],
		openedFiles: [],
		notifications: [],
		wrappersCreatedByAction: [],
	};

	const given = createGivenApi(state);
	const when = createWhenApi(state);
	const then = createThenApi(state);

	return {
		given,
		when,
		then,
	};
}

function createGivenApi(state: TestingState): PluginTestingApi["given"] {
	return {
		unwrappedAudio(path) {
			state.app.addAudio(path);
		},
		transcribedAudio(path) {
			const audio = state.app.addAudio(path);
			state.app.addMarkdown(adjacentWrapperPath(audio), transcribedWrapperContent(audio));
		},
	};
}

function createWhenApi(state: TestingState): PluginTestingApi["when"] {
	return {
		async bulkTranscribe() {
			return {
				async transcribeAll() {
					const before = markdownPaths(state);
					const result = await bulkTranscribeRecordings({
						app: state.app.app,
						apiKey: "test-key",
						requestUrl: createRequestUrlStub(state),
						now: stableNow,
						concurrency: 1,
					});
					rememberCreatedWrappers(state, before);

					if (result.created + result.transcribed + result.failed === 0) {
						state.notifications.push("No recordings need transcription.");
					}
				},
				async chooseRecording(path: string) {
					const audio = state.app.getFile(path);
					const candidate = buildRecordingCandidates(state.app.app).find((item) => item.audio.path === path);
					assert.ok(candidate, `Expected audio file ${path} to exist.`);

					if (candidate.wrapper && getTranscriptStatus(state.app.app, candidate.wrapper) === "transcribed") {
						state.openedFiles.push(path);
						return;
					}

					const before = markdownPaths(state);
					const result = await transcribeRecordingIntoWrapper({
						app: state.app.app,
						apiKey: "test-key",
						audio,
						existingWrapper: candidate.wrapper,
						requestUrl: createRequestUrlStub(state),
						now: stableNow,
					});
					rememberCreatedWrappers(state, before);
					state.openedFiles.push(audioPathFromWrapper(state, result.wrapper) ?? path);
				},
			};
		},
	};
}

function createThenApi(state: TestingState): PluginTestingApi["then"] {
	return {
		transcription: {
			expectNoRequest() {
				assert.equal(state.transcriptionRequests.length, 0, "Expected no transcription request to be sent.");
			},
			expectRequest(path) {
				assert.ok(
					state.transcriptionRequests.includes(path),
					`Expected a transcription request to be sent for ${path}.`,
				);
			},
			expectNoRequestFor(path) {
				assert.ok(
					!state.transcriptionRequests.includes(path),
					`Expected no transcription request to be sent for ${path}.`,
				);
			},
			expectRequests(paths) {
				for (const path of paths) {
					this.expectRequest(path);
				}

				this.expectRequestCount(paths.length);
			},
			expectRequestCount(expectedCount) {
				assert.equal(
					state.transcriptionRequests.length,
					expectedCount,
					`Expected ${expectedCount} transcription request(s), got ${state.transcriptionRequests.length}.`,
				);
			},
		},
		wrapper: {
			expectCreated(path) {
				const audio = findTargetAudio(state, path);
				assert.ok(findWrapperForAudio(state, audio), `Expected a voice note wrapper for ${audio.path}.`);
			},
			expectNotCreated(path) {
				assert.ok(
					!state.wrappersCreatedByAction.includes(path),
					`Expected no new voice note wrapper to be created for ${path}.`,
				);
			},
			expectCreatedFor(paths) {
				for (const path of paths) {
					this.expectCreated(path);
				}

				this.expectCreatedCount(paths.length);
			},
			expectCreatedCount(expectedCount) {
				assert.equal(
					state.wrappersCreatedByAction.length,
					expectedCount,
					`Expected ${expectedCount} created wrapper(s), got ${state.wrappersCreatedByAction.length}.`,
				);
			},
			expectStatus(status, path) {
				const audio = findTargetAudio(state, path);
				const wrapper = findWrapperForAudio(state, audio);
				assert.ok(wrapper, `Expected a voice note wrapper for ${audio.path}.`);
				assert.equal(
					getTranscriptStatus(state.app.app, wrapper),
					status,
					`Expected ${audio.path} wrapper status ${status}.`,
				);
			},
			expectGeneratedTitle(path) {
				const audio = findTargetAudio(state, path);
				const wrapper = findWrapperForAudio(state, audio);
				assert.ok(wrapper, `Expected a voice note wrapper for ${audio.path}.`);
				assert.equal(wrapper.basename, generatedTitleFor(audio.path), `Expected ${audio.path} wrapper to use a generated title.`);
			},
			expectTranscriptReturnedForRecording(path) {
				const audio = findTargetAudio(state, path);
				const wrapper = findWrapperForAudio(state, audio);
				assert.ok(wrapper, `Expected a voice note wrapper for ${audio.path}.`);
				assert.match(
					state.app.readText(wrapper.path),
					new RegExp(escapeRegExp(transcriptFor(audio.path))),
					`Expected ${audio.path} wrapper to contain the transcript returned for its recording.`,
				);
			},
		},
		editor: {
			expectNoInsertedLink() {
				assert.equal(state.insertedLinks.length, 0, "Expected no hyperlink to be inserted.");
			},
		},
		workspace: {
			expectNoOpenedFile() {
				assert.equal(state.openedFiles.length, 0, "Expected no transcription note to be opened.");
			},
			expectOpenedWrapper(path) {
				assert.ok(
					state.openedFiles.includes(path),
					`Expected the transcription note for ${path} to be opened.`,
				);
			},
		},
		notifications: {
			expectEmitted() {
				assert.ok(state.notifications.length > 0, "Expected an Obsidian notification pop-up to be emitted.");
			},
		},
	};
}

interface FakeObsidianApp {
	app: App;
	addAudio(path: string): TFile;
	addMarkdown(path: string, content: string): TFile;
	getFile(path: string): TFile;
	getFiles(): TFile[];
	readText(path: string): string;
}

function createFakeObsidianApp(): FakeObsidianApp {
	const files = new Map<string, FakeTFile>();
	const contents = new Map<string, string>();

	const app = {
		vault: createFakeVault(files, contents),
		fileManager: {
			getNewFileParent: () => ({path: "/"}),
			generateMarkdownLink: (file: TFile): string => `[[${file.path}]]`,
			renameFile: async (file: TAbstractFile, newPath: string): Promise<void> => {
				assert.ok(isFile(file), "Expected a file to rename.");
				const existingContent = contents.get(file.path);
				files.delete(file.path);
				contents.delete(file.path);
				file.path = newPath;
				file.name = filename(newPath);
				file.basename = basename(newPath);
				file.extension = extension(newPath);
				file.parent = parentForPath(newPath);
				files.set(newPath, file as FakeTFile);
				if (existingContent !== undefined) {
					contents.set(newPath, existingContent);
				}
			},
		},
		metadataCache: {
			resolvedLinks: {},
			getFileCache: (file: TFile) => parseFileCache(contents.get(file.path) ?? ""),
			getFirstLinkpathDest: (linkpath: string): TFile | null => files.get(linkpath) ?? findByBasename(files, linkpath),
		},
		workspace: {
			getLeaf: () => ({
				openFile: async () => undefined,
			}),
		},
	} as unknown as App;

	return {
		app,
		addAudio(path) {
			return addFile(files, path);
		},
		addMarkdown(path, content) {
			const file = addFile(files, path);
			contents.set(path, content);
			return file;
		},
		getFile(path) {
			const file = files.get(path);
			assert.ok(file, `Expected audio file ${path} to exist.`);
			return file;
		},
		getFiles() {
			return Array.from(files.values());
		},
		readText(path) {
			const content = contents.get(path);
			assert.ok(content !== undefined, `Expected ${path} to exist.`);
			return content;
		},
	};
}

function createFakeVault(files: Map<string, FakeTFile>, contents: Map<string, string>): Partial<Vault> {
	return {
		create: async (path: string, data: string): Promise<TFile> => {
			const file = addFile(files, path);
			contents.set(path, data);
			return file;
		},
		modify: async (file: TFile, data: string): Promise<void> => {
			contents.set(file.path, data);
		},
		readBinary: async (file: TFile): Promise<ArrayBuffer> => Uint8Array.from(file.path, charCode).buffer,
		getAbstractFileByPath: (path: string): TAbstractFile | null => files.get(path) ?? null,
		getFiles: (): TFile[] => Array.from(files.values()),
		getMarkdownFiles: (): TFile[] => Array.from(files.values()).filter((file) => file.extension === "md"),
	};
}

function createRequestUrlStub(state: TestingState): (request: RequestUrlParam) => Promise<{status: number; text: string}> {
	return async (request: RequestUrlParam) => {
		const capturedRequest = request as RequestUrlRequest;

		if (capturedRequest.url === OPENROUTER_AUDIO_TRANSCRIPTIONS_URL) {
			const body = JSON.parse(capturedRequest.body) as {input_audio?: {data?: string}};
			const audioPath = Buffer.from(body.input_audio?.data ?? "", "base64").toString();
			state.transcriptionRequests.push(audioPath);

			return {
				status: 200,
				text: JSON.stringify({text: transcriptFor(audioPath)}),
			};
		}

		if (capturedRequest.url === OPENROUTER_CHAT_COMPLETIONS_URL) {
			const body = JSON.parse(capturedRequest.body) as {response_format?: {json_schema?: {name?: string}}; messages?: unknown[]};
			if (body.response_format?.json_schema?.name === "transcription_summary") {
				return {
					status: 200,
					text: JSON.stringify({choices: [{message: {content: JSON.stringify({summary: ["Summary point"]})}}]}),
				};
			}

			const transcription = extractTranscriptionFromChatBody(body);
			const audioPath = transcription.replace(/^Transcript returned for /, "");
			return {
				status: 200,
				text: JSON.stringify({choices: [{message: {content: JSON.stringify({title: generatedTitleFor(audioPath)})}}]}),
			};
		}

		throw new Error(`Unexpected request URL: ${capturedRequest.url}`);
	};
}

function rememberCreatedWrappers(state: TestingState, before: Set<string>): void {
	for (const candidate of buildRecordingCandidates(state.app.app)) {
		if (candidate.wrapper && !before.has(candidate.wrapper.path)) {
			state.wrappersCreatedByAction.push(candidate.audio.path);
		}
	}
}

function markdownPaths(state: TestingState): Set<string> {
	return new Set(state.app.getFiles().filter((file) => file.extension === "md").map((file) => file.path));
}

function findTargetAudio(state: TestingState, path: string | undefined): TFile {
	const audioFiles = state.app.getFiles().filter((file) => file.extension !== "md");
	const audio = path ? audioFiles.find((candidate) => candidate.path === path) : audioFiles[0];
	assert.ok(audio, path ? `Expected audio file ${path} to exist.` : "Expected at least one audio file to exist.");

	return audio;
}

function findWrapperForAudio(state: TestingState, audio: TFile): TFile | null {
	return buildRecordingCandidates(state.app.app).find((candidate) => candidate.audio.path === audio.path)?.wrapper ?? null;
}

function audioPathFromWrapper(state: TestingState, wrapper: TFile): string | null {
	return buildRecordingCandidates(state.app.app).find((candidate) => candidate.wrapper?.path === wrapper.path)?.audio.path ?? null;
}

function parseFileCache(content: string): {frontmatter?: Record<string, unknown>; headings?: Array<{heading: string}>} {
	return {
		frontmatter: parseFrontmatter(content),
		headings: Array.from(content.matchAll(/^##?\s+(.+)$/gm), (match) => ({heading: match[1]?.trim() ?? ""})),
	};
}

function parseFrontmatter(content: string): Record<string, unknown> | undefined {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) {
		return undefined;
	}

	const frontmatter: Record<string, unknown> = {};
	for (const line of (match[1] ?? "").split("\n")) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, "\"");
		frontmatter[key] = value;
	}

	return frontmatter;
}

function extractTranscriptionFromChatBody(body: {messages?: unknown[]}): string {
	const message = body.messages?.[0];
	if (!isRecord(message) || !Array.isArray(message.content)) {
		return "";
	}

	const content = message.content as unknown[];
	const lastContent = content[content.length - 1];
	return isRecord(lastContent) && typeof lastContent.text === "string" ? lastContent.text : "";
}

function transcribedWrapperContent(audio: TFile): string {
	return [
		"---",
		"type: voice-note",
		`source: "[[${audio.path}]]"`,
		"status: transcribed",
		"---",
		`# ${audio.basename}`,
		"## Audio",
		`![[${audio.path}]]`,
		"## Transcript",
		transcriptFor(audio.path),
		"",
	].join("\n");
}

function adjacentWrapperPath(audio: TFile): string {
	return audio.parent && audio.parent.path !== "/" ? `${audio.parent.path}/${audio.basename}.md` : `${audio.basename}.md`;
}

function transcriptFor(path: string): string {
	return `Transcript returned for ${path}`;
}

function generatedTitleFor(path: string): string {
	return `Generated title for ${basename(path)}`;
}

function stableNow(): Date {
	return new Date(2026, 4, 10, 9, 8, 7);
}

function findByBasename(files: Map<string, FakeTFile>, linkpath: string): TFile | null {
	return Array.from(files.values()).find((file) => file.basename === linkpath || file.path === linkpath) ?? null;
}

function addFile(files: Map<string, FakeTFile>, path: string): FakeTFile {
	const file = createFile(path);
	files.set(path, file);
	return file;
}

function createFile(path: string): FakeTFile {
	return new FakeTFile(path);
}

function charCode(char: string): number {
	return char.charCodeAt(0);
}

function filename(path: string): string {
	return path.split("/").pop() ?? path;
}

function basename(path: string): string {
	return filename(path).replace(/\.[^.]+$/, "");
}

function extension(path: string): string {
	return path.split(".").pop() ?? "";
}

function parentForPath(path: string): TFile["parent"] {
	const parts = path.split("/");
	if (parts.length <= 1) {
		return null;
	}

	const parentPath = parts.slice(0, -1).join("/");
	return {path: parentPath || "/"} as TFile["parent"];
}

function isFile(file: TAbstractFile): file is TFile {
	return "extension" in file;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class FakeTFile implements TFile {
	vault!: Vault;
	path: string;
	name: string;
	parent: TFile["parent"];
	stat = {ctime: new Date(2026, 4, 9).getTime(), mtime: new Date(2026, 4, 9).getTime(), size: 1};
	basename: string;
	extension: string;

	constructor(path: string) {
		this.path = path;
		this.name = filename(path);
		this.parent = parentForPath(path);
		this.basename = basename(path);
		this.extension = extension(path);
	}
}
