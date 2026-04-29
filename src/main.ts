import {
	App,
	Editor,
	FuzzySuggestModal,
	MarkdownView,
	Notice,
	Plugin,
	TFolder,
	TFile,
	requestUrl,
} from "obsidian";
import {sortSupportedAudioFiles} from "./audio-files";
import {requestTranscription} from "./openrouter";
import {DEFAULT_SETTINGS, ObsidianSttPluginSettings, ObsidianSttSettingTab} from "./settings";

const MAX_RECORDING_BASENAME_LENGTH = 80;

export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

export function formatTimestamp(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export function createTranscriptionNoteBasename(title: string): string {
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

export function formatTranscriptionNoteContent(params: {
	recordingLink: string;
	recordedDate: string;
	transcribedDate: string;
	transcription: string;
}): string {
	return [
		`Source: ${params.recordingLink}`,
		`Recorded: ${params.recordedDate}  `,
		`Transcribed: ${params.transcribedDate}`,
		"",
		"---",
		"## Transcript",
		params.transcription,
		"",
	].join("\n");
}

export default class ObsidianSttPlugin extends Plugin {
	settings: ObsidianSttPluginSettings;
	private isTranscribing = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "transcribe-audio-file",
			name: "Transcribe audio file into note",
			editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
				if (!(view instanceof MarkdownView)) {
					return false;
				}

				if (!checking) {
					this.openAudioPicker(editor, view.file?.path ?? "");
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

	private openAudioPicker(editor: Editor, sourcePath: string): void {
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
			await this.transcribeIntoNote(file, editor, sourcePath);
		}).open();
	}

	private async transcribeIntoNote(file: TFile, editor: Editor, sourcePath: string): Promise<void> {
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

			const transcribedAt = new Date();
			const transcribedDate = formatTimestamp(transcribedAt);
			const recordedDate = formatTimestamp(new Date(file.stat.ctime));
			const noteBasename = createTranscriptionNoteBasename(transcriptionResult.title);
			const noteParent = this.app.fileManager.getNewFileParent("");
			const notePath = this.getAvailableMarkdownPath(noteParent, noteBasename);
			await this.renameRecordingAsTranscribed(file, transcribedDate);
			const recordingLink = this.app.fileManager.generateMarkdownLink(file, notePath);
			const note = await this.app.vault.create(
				notePath,
				formatTranscriptionNoteContent({
					recordingLink,
					recordedDate,
					transcribedDate,
					transcription: transcriptionResult.transcription,
				}),
			);
			const noteLink = this.app.fileManager.generateMarkdownLink(note, sourcePath);
			editor.replaceSelection(noteLink);
			new Notice("Transcription note created.");
		} catch (error) {
			console.error("Audio transcription failed", error);
			const message = error instanceof Error ? error.message : "Unknown transcription error.";
			new Notice(message);
		} finally {
			this.isTranscribing = false;
		}
	}

	private async renameRecordingAsTranscribed(file: TFile, transcribedDate: string): Promise<void> {
		const basename = `${file.basename} -> Transcribed ${transcribedDate}`;
		const newPath = this.getAvailableRecordingPath(file, basename);

		if (newPath !== file.path) {
			await this.app.fileManager.renameFile(file, newPath);
		}
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

	private getAvailableMarkdownPath(parent: TFolder, basename: string): string {
		const folderPrefix = parent.path === "/" ? "" : `${parent.path}/`;

		for (let index = 0; ; index += 1) {
			const suffix = index === 0 ? "" : ` ${index + 1}`;
			const path = `${folderPrefix}${basename}${suffix}.md`;

			if (!this.app.vault.getAbstractFileByPath(path)) {
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
