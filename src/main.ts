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
import {sortMp3Files} from "./audio-files";
import {requestTranscription} from "./openrouter";
import {DEFAULT_SETTINGS, ObsidianSttPluginSettings, ObsidianSttSettingTab} from "./settings";

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

		const mp3Files = sortMp3Files(this.app.vault.getFiles());
		if (mp3Files.length === 0) {
			new Notice("No mp3 files were found in this vault.");
			return;
		}

		new AudioFileSuggestModal(this.app, mp3Files, async (file: TFile) => {
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
			const transcription = await requestTranscription({
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

			editor.replaceSelection(transcription);
			new Notice("Transcription inserted.");
		} catch (error) {
			console.error("Audio transcription failed", error);
			const message = error instanceof Error ? error.message : "Unknown transcription error.";
			new Notice(message);
		} finally {
			this.isTranscribing = false;
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
		this.setPlaceholder("Type an mp3 path in your vault");
		this.setInstructions([
			{command: "Type", purpose: "Filter mp3 files by path"},
			{command: "Enter", purpose: "Choose file"},
			{command: "Esc", purpose: "Cancel"},
		]);
		this.emptyStateText = "No matching mp3 files.";
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
