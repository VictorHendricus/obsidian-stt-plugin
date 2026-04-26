import {
	App,
	Editor,
	FuzzySuggestModal,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
	requestUrl,
} from "obsidian";
import {sortSupportedAudioFiles} from "./audio-files";
import {requestTranscription} from "./openrouter";
import {DEFAULT_SETTINGS, ObsidianSttPluginSettings, ObsidianSttSettingTab} from "./settings";

const MAX_RECORDING_BASENAME_LENGTH = 80;

export function formatTranscriptionInsertion(recordingFileName: string, transcription: string): string {
	return `Recording: [[${recordingFileName}]]. Transcription: "${transcription}"`;
}

export function createRecordingBasename(title: string): string {
	const firstSentence = title
		.replace(/\s+/g, " ")
		.trim()
		.match(/^[^.!?]+[.!?]?/)?.[0]
		.trim();
	const fallback = "Transcribed recording";
	const safeName = (firstSentence || fallback)
		.replace(/[\\/:*?"<>|#^[\]]+/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_RECORDING_BASENAME_LENGTH)
		.replace(/[.!?,;:\s]+$/g, "")
		.trim();

	return safeName || fallback;
}

export default class ObsidianSttPlugin extends Plugin {
	settings: ObsidianSttPluginSettings;
	private isTranscribing = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "transcribe-audio-file",
			name: "Transcribe audio file into editor",
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				if (!(view instanceof MarkdownView)) {
					return false;
				}

				if (!checking) {
					this.openAudioPicker(editor);
				}

				return true;
			},
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

	private openAudioPicker(editor: Editor): void {
		const apiKey = this.settings.apiKey.trim();
		if (!apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Add your OpenRouter key in the plugin settings first.");
			return;
		}

		const audioFiles = sortSupportedAudioFiles(this.app.vault.getFiles());
		if (audioFiles.length === 0) {
			new Notice("No m4a or mp3 files were found in this vault.");
			return;
		}

		new AudioFileSuggestModal(this.app, audioFiles, async (file: TFile) => {
			await this.transcribeIntoEditor(file, editor);
		}).open();
	}

	private async transcribeIntoEditor(file: TFile, editor: Editor): Promise<void> {
		if (this.isTranscribing) {
			new Notice("A transcription is already in progress.");
			return;
		}

		this.isTranscribing = true;
		new Notice(`Transcribing ${file.path}...`);

		try {
			const audioBuffer = await this.app.vault.readBinary(file);
			const transcriptionResult = await requestTranscription({
				apiKey: this.settings.apiKey,
				audioBuffer,
				audioPath: file.path,
				requestUrl: async (request) => {
					const response = await requestUrl(request);
					return {
						status: response.status,
						text: response.text,
					};
				},
			});

			const recordingFileName = await this.renameRecordingFromTranscription(file, transcriptionResult.title);
			editor.replaceSelection(formatTranscriptionInsertion(recordingFileName, transcriptionResult.transcription));
			new Notice("Transcription inserted.");
		} catch (error) {
			console.error("Audio transcription failed", error);
			const message = error instanceof Error ? error.message : "Unknown transcription error.";
			new Notice(message);
		} finally {
			this.isTranscribing = false;
		}
	}

	private async renameRecordingFromTranscription(file: TFile, title: string): Promise<string> {
		const basename = createRecordingBasename(title);
		const newPath = this.getAvailableRecordingPath(file, basename);

		if (newPath !== file.path) {
			await this.app.fileManager.renameFile(file, newPath);
		}

		return newPath.split("/").pop() || file.name;
	}

	private getAvailableRecordingPath(file: TFile, basename: string): string {
		const folderPrefix = file.parent && file.parent.path !== "/" ? `${file.parent.path}/` : "";
		const extension = file.extension;

		for (let index = 0; ; index += 1) {
			const suffix = index === 0 ? "" : ` ${index + 1}`;
			const path = `${folderPrefix}${basename}${suffix}.${extension}`;
			const existingFile = this.app.vault.getAbstractFileByPath(path);

			if (!existingFile || existingFile === file) {
				return path;
			}
		}
	}
}

class AudioFileSuggestModal extends FuzzySuggestModal<TFile> {
	private readonly files: TFile[];
	private readonly onChooseFile: (file: TFile) => Promise<void>;

	constructor(app: App, files: TFile[], onChooseFile: (file: TFile) => Promise<void>) {
		super(app);
		this.files = files;
		this.onChooseFile = onChooseFile;
		this.setPlaceholder("Type an m4a or mp3 path in your vault");
		this.setInstructions([
			{command: "Type", purpose: "Filter m4a or mp3 files by path"},
			{command: "Enter", purpose: "Choose file"},
			{command: "Esc", purpose: "Cancel"},
		]);
		this.emptyStateText = "No matching m4a or mp3 files.";
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		void this.onChooseFile(file);
	}
}
