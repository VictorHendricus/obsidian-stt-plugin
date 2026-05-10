import {Editor, MarkdownView, Notice, Plugin, TFile, requestUrl} from "obsidian";
import {requestTranscription} from "./openrouter";
import {bulkTranscribeRecordings} from "./recording-wrapper-creator";
import {RecordingPickerModal} from "./recording-picker-modal";
import {
	buildRecordingCandidates,
	createTranscriptionNoteBasename,
	findAdjacentWrapper,
	formatVoiceNoteWrapperContent,
	getAvailableMarkdownPath,
	type RecordingCandidate,
} from "./recording-wrappers";
import {DEFAULT_SETTINGS, ObsidianSttPluginSettings, ObsidianSttSettingTab} from "./settings";

export default class ObsidianSttPlugin extends Plugin {
	settings: ObsidianSttPluginSettings;
	private isTranscribing = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "transcribe-recording",
			name: "Transcribe recording",
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				if (!(view instanceof MarkdownView)) {
					return false;
				}

				if (!checking) {
					this.openRecordingPicker(editor, view.file?.path ?? "");
				}

				return true;
			},
		});

		this.addCommand({
			id: "bulk-transcribe-recordings",
			name: "Bulk transcribe recordings",
			callback: async () => {
				await this.bulkTranscribeRecordings();
			},
		});

		this.addRibbonIcon("file-audio", "Bulk transcribe recordings", async () => {
			await this.bulkTranscribeRecordings();
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

	private openRecordingPicker(editor: Editor, sourcePath: string): void {
		const candidates = buildRecordingCandidates(this.app);
		if (candidates.length === 0) {
			new Notice("No audio recordings were found in this vault.");
			return;
		}

		new RecordingPickerModal(this.app, candidates, async (candidate) => {
			await this.handleRecordingCandidate(candidate, editor, sourcePath);
		}).open();
	}

	private async handleRecordingCandidate(candidate: RecordingCandidate, editor: Editor, sourcePath: string): Promise<void> {
		const existingWrapper = candidate.wrapper ?? findAdjacentWrapper(this.app, candidate.audio);
		if (existingWrapper) {
			this.insertWrapperLink(editor, existingWrapper, sourcePath);
			await this.openWrapper(existingWrapper);
			return;
		}

		const wrapper = await this.transcribeRecording(candidate.audio);
		if (wrapper) {
			this.insertWrapperLink(editor, wrapper, sourcePath);
			await this.openWrapper(wrapper);
		}
	}

	private async transcribeRecording(audio: TFile): Promise<TFile | null> {
		const apiKey = this.settings.apiKey.trim();
		if (!apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Add your OpenRouter key in the plugin settings first.");
			return null;
		}

		if (this.isTranscribing) {
			new Notice("A transcription is already in progress.");
			return null;
		}

		const adjacentWrapper = findAdjacentWrapper(this.app, audio);
		if (adjacentWrapper) {
			return adjacentWrapper;
		}

		this.isTranscribing = true;

		try {
			new Notice(`Transcribing ${audio.path}...`);
			const audioBuffer = await this.app.vault.readBinary(audio);
			const transcriptionResult = await requestTranscription({
				apiKey,
				audioBuffer,
				audioPath: audio.path,
				requestUrl: async (request) => {
					const response = await requestUrl(request);
					return {
						status: response.status,
						text: response.text,
					};
				},
			});

			const title = createTranscriptionNoteBasename(transcriptionResult.title);
			const folderPath = this.app.fileManager.getNewFileParent("", `${title}.md`).path;
			const finalPath = getAvailableMarkdownPath(this.app, folderPath, title);
			const finalAudioLink = this.app.fileManager.generateMarkdownLink(audio, finalPath);
			const createdAt = new Date();

			const wrapper = await this.app.vault.create(
				finalPath,
				formatVoiceNoteWrapperContent({
					title,
					audioLink: finalAudioLink,
					createdAt,
					recordedAt: new Date(audio.stat.ctime),
					transcriptStatus: "transcribed",
					transcript: transcriptionResult.transcription,
				}),
			);

			new Notice("Transcription wrapper created.");
			return wrapper;
		} catch (error) {
			console.error("Recording transcription failed", error);
			const message = error instanceof Error ? error.message : "Unknown transcription error.";
			new Notice(message);
			return null;
		} finally {
			this.isTranscribing = false;
		}
	}

	private insertWrapperLink(editor: Editor, wrapper: TFile, sourcePath: string): void {
		const wrapperLink = this.app.fileManager.generateMarkdownLink(wrapper, sourcePath);
		editor.replaceSelection(wrapperLink);
	}

	private async openWrapper(wrapper: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(wrapper);
	}

	private async bulkTranscribeRecordings(): Promise<void> {
		const apiKey = this.settings.apiKey.trim();
		if (!apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Add your OpenRouter key in the plugin settings first.");
			return;
		}

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

		new Notice(formatBulkTranscriptionNotice(result));
	}
}

function formatBulkTranscriptionNotice(result: {created: number; transcribed: number; failed: number; skipped: number}): string {
	if (result.transcribed === 0 && result.failed === 0 && result.created === 0) {
		return "No recordings need transcription.";
	}

	return `Bulk transcription complete: ${result.transcribed} transcribed, ${result.failed} failed, ${result.created} wrapper${result.created === 1 ? "" : "s"} created.`;
}
