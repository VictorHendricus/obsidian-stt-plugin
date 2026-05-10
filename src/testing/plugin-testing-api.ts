type TranscriptStatus = "raw" | "transcribed";

interface AudioRecord {
	path: string;
	wrapperCreated: boolean;
	status: TranscriptStatus | null;
}

interface TestingState {
	audio: AudioRecord[];
	wrappersCreatedByAction: string[];
	transcriptionRequests: string[];
	insertedLinks: string[];
	openedFiles: string[];
}

export interface PluginTestingApi {
	vault: {
		addUnwrappedAudio(path: string): void;
		addWrappedAudio(path: string): void;
		addTranscribedAudio(path: string): void;
	};
	plugin: {
		createMissingRecordingWrappers(): Promise<void>;
		bulkTranscribeRecordings(): Promise<void>;
	};
	transcription: {
		expectNoRequest(): void;
		expectRequestCount(expectedCount: number): void;
	};
	wrapper: {
		expectCreated(path?: string): void;
		expectCreatedCount(expectedCount: number): void;
		expectStatus(status: string, path?: string): void;
	};
	editor: {
		expectNoInsertedLink(): void;
	};
	workspace: {
		expectNoOpenedFile(): void;
	};
}

export function createPluginTestingApi(): PluginTestingApi {
	const state: TestingState = {
		audio: [],
		wrappersCreatedByAction: [],
		transcriptionRequests: [],
		insertedLinks: [],
		openedFiles: [],
	};

	return {
		vault: createVaultApi(state),
		plugin: createPluginApi(state),
		transcription: createTranscriptionApi(state),
		wrapper: createWrapperApi(state),
		editor: createEditorApi(state),
		workspace: createWorkspaceApi(state),
	};
}

function createVaultApi(state: TestingState): PluginTestingApi["vault"] {
	return {
		addUnwrappedAudio(path) {
			addAudio(state, {path, wrapperCreated: false, status: null});
		},
		addWrappedAudio(path) {
			addAudio(state, {path, wrapperCreated: true, status: "raw"});
		},
		addTranscribedAudio(path) {
			addAudio(state, {path, wrapperCreated: true, status: "transcribed"});
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

function createMissingWrappers(state: TestingState): void {
	for (const audio of state.audio) {
		if (audio.wrapperCreated) {
			continue;
		}

		audio.wrapperCreated = true;
		audio.status = "raw";
		state.wrappersCreatedByAction.push(audio.path);
	}
}

function bulkTranscribe(state: TestingState): void {
	for (const audio of state.audio) {
		if (audio.status === "transcribed") {
			continue;
		}

		if (!audio.wrapperCreated) {
			audio.wrapperCreated = true;
			state.wrappersCreatedByAction.push(audio.path);
		}

		audio.status = "transcribed";
		state.transcriptionRequests.push(audio.path);
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

function expect(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}
