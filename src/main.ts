import {Editor, MarkdownView, Notice, Plugin, TFile, requestUrl} from "obsidian";
import {bulkTranscribeRecordings, transcribeRecordingIntoWrapper} from "./recording-wrapper-creator";
import {RecordingPickerModal} from "./recording-picker-modal";
import {
	buildRecordingCandidates,
	findAdjacentWrapper,
	getTranscriptStatus,
	type RecordingCandidate,
} from "./recording-wrappers";
import {RadioModeModal} from "./radio-mode-modal.ts";
import {DEFAULT_SETTINGS, ObsidianSttPluginSettings, ObsidianSttSettingTab} from "./settings";

export default class ObsidianSttPlugin extends Plugin {
	settings: ObsidianSttPluginSettings;
	private isTranscribing = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "file-transcribe",
			name: "Bulk transcribe",
			callback: async () => {
				this.openRecordingPicker();
			},
		});

		this.addCommand({
			id: "radio-mode",
			name: "Radio mode",
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				if (!(view instanceof MarkdownView)) {
					return false;
				}

				if (!checking) {
					this.openRadioMode(editor);
				}

				return true;
			},
		});

		this.addRibbonIcon("file-audio", "Bulk transcribe", () => {
			this.openRecordingPicker();
		});

		this.addSettingTab(new ObsidianSttSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<ObsidianSttPluginSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private openRecordingPicker(): void {
		const candidates = buildRecordingCandidates(this.app);
		if (candidates.length === 0) {
			new Notice("No audio recordings were found in this vault.");
			return;
		}

		new RecordingPickerModal({
			app: this.app,
			candidates,
			isTranscribing: () => this.isTranscribing,
			onChooseCandidate: async (candidate) => {
				await this.handleRecordingCandidate(candidate);
			},
			onTranscribeAll: async () => {
				await this.bulkTranscribeAll();
			},
		}).open();
	}

	private openRadioMode(editor: Editor): void {
		const apiKey = this.getApiKeyOrNotify();
		if (!apiKey || !this.canStartTranscription()) {
			return;
		}

		const cursor = editor.getCursor();
		this.isTranscribing = true;
		new RadioModeModal(this.app, this, (transcript) => {
			editor.replaceRange(transcript, cursor);
		}, () => {
			this.isTranscribing = false;
		}).open();
	}

	private async handleRecordingCandidate(candidate: RecordingCandidate): Promise<void> {
		const existingWrapper = candidate.wrapper ?? findAdjacentWrapper(this.app, candidate.audio);
		if (existingWrapper && getTranscriptStatus(this.app, existingWrapper) === "transcribed") {
			await this.openWrapper(existingWrapper);
			return;
		}

		const wrapper = await this.transcribeRecording(candidate.audio, existingWrapper);
		if (wrapper) {
			await this.openWrapper(wrapper);
		}
	}

	private async transcribeRecording(audio: TFile, existingWrapper?: TFile | null): Promise<TFile | null> {
		const apiKey = this.getApiKeyOrNotify();
		const adjacentWrapper = existingWrapper ?? findAdjacentWrapper(this.app, audio);
		if (!apiKey || !this.canStartTranscription()) {
			return null;
		}

		if (adjacentWrapper && getTranscriptStatus(this.app, adjacentWrapper) === "transcribed") {
			return adjacentWrapper;
		}

		this.isTranscribing = true;

		try {
			return await this.createOrRetryTranscriptionWrapper(audio, apiKey, adjacentWrapper);
		} catch (error) {
			console.error("Recording transcription failed", error);
			const message = error instanceof Error ? error.message : "Unknown transcription error.";
			new Notice(message);
			return null;
		} finally {
			this.isTranscribing = false;
		}
	}

	private getApiKeyOrNotify(): string | null {
		const apiKey = this.settings.apiKey.trim();
		if (!apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Add your OpenRouter key in the plugin settings first.");
			return null;
		}

		return apiKey;
	}

	private canStartTranscription(): boolean {
		if (this.isTranscribing) {
			new Notice("A transcription is already in progress.");
			return false;
		}

		return true;
	}

	private async createOrRetryTranscriptionWrapper(
		audio: TFile,
		apiKey: string,
		existingWrapper: TFile | null,
	): Promise<TFile> {
		new Notice(`Transcribing ${audio.path}...`);
		const result = await transcribeRecordingIntoWrapper({
			app: this.app,
			apiKey,
			audio,
			existingWrapper,
			requestUrl: async (request) => {
				const response = await requestUrl(request);
				return {
					status: response.status,
					text: response.text,
				};
			},
		});

		this.notifyTranscriptionResult(result);
		return result.wrapper;
	}

	private notifyTranscriptionResult(result: {created: boolean; transcribed: boolean; error?: unknown}): void {
		if (!result.transcribed) {
			const message = result.error instanceof Error ? result.error.message : "Unknown transcription error.";
			new Notice(message);
			return;
		}

		if (result.created) {
			new Notice("Transcription wrapper created.");
		}
	}

	private async openWrapper(wrapper: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(wrapper);
	}

	private async bulkTranscribeAll(): Promise<void> {
		const apiKey = this.settings.apiKey.trim();
		if (!apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Add your OpenRouter key in the plugin settings first.");
			return;
		}

		if (!this.canStartTranscription()) {
			return;
		}

		const targetCount = countBulkTranscriptionTargets(buildRecordingCandidates(this.app));
		if (targetCount > 0) {
			new Notice(`${targetCount} recording${targetCount === 1 ? "" : "s"} need transcription. Starting bulk transcribe.`);
		}

		this.isTranscribing = true;

		try {
			const result = await bulkTranscribeRecordings({
				app: this.app,
				apiKey,
				requestUrl: async (request) => {
					const response = await requestUrl(request);
					return {
						status: response.status,
						text: response.text,
					};
				},
			});

			new Notice(formatBulkTranscribeNotice(result));
		} finally {
			this.isTranscribing = false;
		}
	}
}

function countBulkTranscriptionTargets(candidates: RecordingCandidate[]): number {
	return candidates.filter(shouldBulkTranscribeCandidate).length;
}

function shouldBulkTranscribeCandidate(candidate: RecordingCandidate): boolean {
	return !candidate.wrapper || candidate.transcriptStatus === "raw" || candidate.transcriptStatus === "failed" || candidate.transcriptStatus === "pending" || candidate.transcriptStatus === "processing";
}

function formatBulkTranscribeNotice(result: {created: number; transcribed: number; failed: number; skipped: number}): string {
	if (result.transcribed === 0 && result.failed === 0 && result.created === 0) {
		return "No recordings need transcription.";
	}

	return `Bulk transcribe complete: ${result.transcribed} transcribed, ${result.failed} failed, ${result.created} wrapper${result.created === 1 ? "" : "s"} created.`;
}
