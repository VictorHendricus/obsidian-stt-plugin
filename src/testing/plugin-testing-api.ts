type TranscriptStatus = "raw" | "transcribed";

interface AudioRecord {
	path: string;
	wrapperCreated: boolean;
	status: TranscriptStatus | null;
	title: string | null;
	transcript: string | null;
}

interface TestingState {
	audio: AudioRecord[];
	wrappersCreatedByAction: string[];
	transcriptionRequests: string[];
	insertedLinks: string[];
	openedFiles: string[];
	notifications: string[];
}

export interface PluginTestingApi {
	vault: {
		addUnwrappedAudio(path: string): void;
		addWrappedAudio(path: string): void;
		addTranscribedAudio(path: string): void;
	};
	plugin: {
		createMissingRecordingWrappers(entryPoint?: "ribbon button" | "command palette button"): Promise<void>;
		bulkTranscribeRecordings(entryPoint?: "ribbon button" | "command palette button"): Promise<void>;
	};
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
	};
	notifications: {
		expectEmitted(): void;
	};
}

export function createPluginTestingApi(): PluginTestingApi {
	const state: TestingState = {
		audio: [],
		wrappersCreatedByAction: [],
		transcriptionRequests: [],
		insertedLinks: [],
		openedFiles: [],
		notifications: [],
	};

	return {
		vault: createVaultApi(state),
		plugin: createPluginApi(state),
		transcription: createTranscriptionApi(state),
		wrapper: createWrapperApi(state),
		editor: createEditorApi(state),
		workspace: createWorkspaceApi(state),
		notifications: createNotificationsApi(state),
	};
}

function createVaultApi(state: TestingState): PluginTestingApi["vault"] {
	return {
		addUnwrappedAudio(path) {
			addAudio(state, {path, wrapperCreated: false, status: null, title: null, transcript: null});
		},
		addWrappedAudio(path) {
			addAudio(state, {path, wrapperCreated: true, status: "raw", title: basename(path), transcript: null});
		},
		addTranscribedAudio(path) {
			addAudio(state, {
				path,
				wrapperCreated: true,
				status: "transcribed",
				title: basename(path),
				transcript: transcriptFor(path),
			});
		},
	};
}

function createPluginApi(state: TestingState): PluginTestingApi["plugin"] {
	return {
		async createMissingRecordingWrappers() {
			createMissingWrappers(state);
		},
		async bulkTranscribeRecordings() {
			bulkTranscribe(state);
		},
	};
}

function createTranscriptionApi(state: TestingState): PluginTestingApi["transcription"] {
	return {
		expectNoRequest() {
			expect(state.transcriptionRequests.length === 0, "Expected no transcription request to be sent.");
		},
		expectRequest(path) {
			expect(
				state.transcriptionRequests.includes(path),
				`Expected a transcription request to be sent for ${path}.`,
			);
		},
		expectNoRequestFor(path) {
			expect(
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
			expect(
				state.transcriptionRequests.length === expectedCount,
				`Expected ${expectedCount} transcription request(s), got ${state.transcriptionRequests.length}.`,
			);
		},
	};
}

function createWrapperApi(state: TestingState): PluginTestingApi["wrapper"] {
	return {
		expectCreated(path) {
			const audio = findTargetAudio(state, path);
			expect(audio.wrapperCreated, `Expected a voice note wrapper for ${audio.path}.`);
		},
		expectNotCreated(path) {
			expect(
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
			expect(
				state.wrappersCreatedByAction.length === expectedCount,
				`Expected ${expectedCount} created wrapper(s), got ${state.wrappersCreatedByAction.length}.`,
			);
		},
		expectStatus(status, path) {
			const audio = findTargetAudio(state, path);
			expect(audio.status === status, `Expected ${audio.path} wrapper status ${status}, got ${audio.status ?? "none"}.`);
		},
		expectGeneratedTitle(path) {
			const audio = findTargetAudio(state, path);
			expect(audio.title === generatedTitleFor(audio.path), `Expected ${audio.path} wrapper to contain a generated title.`);
		},
		expectTranscriptReturnedForRecording(path) {
			const audio = findTargetAudio(state, path);
			expect(
				audio.transcript === transcriptFor(audio.path),
				`Expected ${audio.path} wrapper to contain the transcript returned for its recording.`,
			);
		},
	};
}

function createEditorApi(state: TestingState): PluginTestingApi["editor"] {
	return {
		expectNoInsertedLink() {
			expect(state.insertedLinks.length === 0, "Expected no hyperlink to be inserted.");
		},
	};
}

function createWorkspaceApi(state: TestingState): PluginTestingApi["workspace"] {
	return {
		expectNoOpenedFile() {
			expect(state.openedFiles.length === 0, "Expected no transcription note to be opened.");
		},
	};
}

function createNotificationsApi(state: TestingState): PluginTestingApi["notifications"] {
	return {
		expectEmitted() {
			expect(state.notifications.length > 0, "Expected an Obsidian notification pop-up to be emitted.");
		},
	};
}

function createMissingWrappers(state: TestingState): void {
	for (const audio of state.audio) {
		if (audio.wrapperCreated) {
			continue;
		}

		audio.wrapperCreated = true;
		audio.status = "raw";
		audio.title = basename(audio.path);
		state.wrappersCreatedByAction.push(audio.path);
	}
}

function bulkTranscribe(state: TestingState): void {
	let transcribed = 0;

	for (const audio of state.audio) {
		if (audio.status === "transcribed") {
			continue;
		}

		if (!audio.wrapperCreated) {
			audio.wrapperCreated = true;
			state.wrappersCreatedByAction.push(audio.path);
		}

		audio.status = "transcribed";
		audio.title = generatedTitleFor(audio.path);
		audio.transcript = transcriptFor(audio.path);
		state.transcriptionRequests.push(audio.path);
		transcribed += 1;
	}

	if (transcribed === 0) {
		state.notifications.push("No recordings need transcription.");
	}
}

function addAudio(state: TestingState, audio: AudioRecord): void {
	const existingAudio = state.audio.find((candidate) => candidate.path === audio.path);
	if (existingAudio) {
		existingAudio.wrapperCreated = audio.wrapperCreated;
		existingAudio.status = audio.status;
		return;
	}

	state.audio.push(audio);
}

function findTargetAudio(state: TestingState, path: string | undefined): AudioRecord {
	const audio = path ? state.audio.find((candidate) => candidate.path === path) : state.audio[0];
	if (!audio) {
		throw new Error(path ? `Expected audio file ${path} to exist.` : "Expected at least one audio file to exist.");
	}

	return audio;
}

function basename(path: string): string {
	return path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
}

function generatedTitleFor(path: string): string {
	return `Generated title for ${basename(path)}`;
}

function transcriptFor(path: string): string {
	return `Transcript returned for ${path}`;
}

function expect(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}
