import {Modal, Notice, requestUrl, setIcon, type App} from "obsidian";
import type ObsidianSttPlugin from "./main.ts";
import {saveRecordedAudioAttachment} from "./radio-recording-save.ts";
import {
	formatRadioTranscriptWithSummary,
	getRecordedAudioFormat,
	selectRecorderFormat,
	summarizeRecordedTranscript,
	transcribeRecordedAudio,
	type RecordedAudio,
	type RadioTranscriptionStatusEvent,
} from "./radio-transcription.ts";

type RadioModeSubmit = (transcript: string) => void;
type RadioModeComplete = () => void;
type RadioModeAction = "insert" | "summarize";

export class RadioModeModal extends Modal {
	private readonly plugin: ObsidianSttPlugin;
	private readonly onTranscript: RadioModeSubmit;
	private readonly onComplete: RadioModeComplete;
	private audioContext: AudioContext | null = null;
	private animationFrame = 0;
	private elapsedEl: HTMLElement | null = null;
	private elapsedTimer = 0;
	private insertButton: HTMLButtonElement | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private statusEl: HTMLElement | null = null;
	private statusMessage = "Recording";
	private statusStartedAt = 0;
	private statusTimer = 0;
	private summarizeButton: HTMLButtonElement | null = null;
	private startedAt = 0;
	private stream: MediaStream | null = null;
	private readonly chunks: Blob[] = [];
	private isDiscarding = false;
	private isSubmitting = false;
	private didStartRecording = false;
	private didComplete = false;

	constructor(app: App, plugin: ObsidianSttPlugin, onTranscript: RadioModeSubmit, onComplete: RadioModeComplete) {
		super(app);
		this.plugin = plugin;
		this.onTranscript = onTranscript;
		this.onComplete = onComplete;
	}

	override onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass("obsidian-stt-radio-modal");
		this.buildInterface();
		void this.startRecording();
	}

	override onClose(): void {
		this.stopRecording();
		this.stopVisualizer();
		this.stopElapsedTimer();
		this.stopStatusTimer();
		this.chunks.length = 0;
		if (!this.isSubmitting) {
			this.complete();
		}
	}

	private buildInterface(): void {
		const container = this.contentEl.createDiv({cls: "obsidian-stt-radio"});
		const closeButton = container.createEl("button", {
			cls: "obsidian-stt-radio-close",
			attr: {"aria-label": "Close radio mode", type: "button"},
		});
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", () => {
			void this.confirmDiscard();
		});

		const actions = container.createDiv({cls: "obsidian-stt-radio-actions"});
		this.insertButton = actions.createEl("button", {
			cls: "mod-cta",
			text: "Insert",
			attr: {type: "button"},
		});
		this.insertButton.addEventListener("click", () => {
			void this.submitRecording("insert");
		});

		this.summarizeButton = actions.createEl("button", {
			text: "Summarize",
			attr: {type: "button"},
		});
		this.summarizeButton.addEventListener("click", () => {
			void this.submitRecording("summarize");
		});

		this.elapsedEl = container.createDiv({cls: "obsidian-stt-radio-time", text: "0:00"});
		this.statusEl = container.createDiv({cls: "obsidian-stt-radio-status", text: "Recording"});
		container.createDiv({cls: "obsidian-stt-radio-visualizer"});
	}

	private async startRecording(): Promise<void> {
		if (!this.canUseMediaRecorder()) {
			new Notice("Radio mode is not supported by this device.");
			this.close();
			return;
		}

		const selectedFormat = selectRecorderFormat(MediaRecorder.isTypeSupported.bind(MediaRecorder));
		if (!selectedFormat) {
			new Notice("Radio mode cannot record a supported audio format on this device.");
			this.close();
			return;
		}

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({audio: true});
			this.mediaRecorder = new MediaRecorder(this.stream, {mimeType: selectedFormat.mimeType});
			this.mediaRecorder.addEventListener("dataavailable", (event) => {
				if (event.data.size > 0) {
					this.chunks.push(event.data);
				}
			});
			this.mediaRecorder.start();
			this.didStartRecording = true;
			this.startElapsedTimer();
			this.startVisualizer(this.stream);
		} catch (error) {
			console.error("Radio mode recording failed", error);
			new Notice("Could not start radio mode recording.");
			this.close();
		}
	}

	private canUseMediaRecorder(): boolean {
		return typeof navigator.mediaDevices?.getUserMedia === "function" && typeof globalThis.MediaRecorder === "function";
	}

	private async submitRecording(action: RadioModeAction): Promise<void> {
		if (this.isSubmitting) {
			return;
		}

		this.isSubmitting = true;
		this.showSubmittingState(action === "summarize" ? "Preparing summary..." : "Preparing transcription...");
		let audio: RecordedAudio | null = null;

		try {
			audio = await this.stopAndReadRecording();
			const transcript = await transcribeRecordedAudio({
				apiKey: this.plugin.settings.apiKey,
				audio,
				onStatus: (event) => this.showTranscriptionStatus(event),
				requestUrl: async (request) => {
					const response = await requestUrl(request);
					return {
						status: response.status,
						text: response.text,
					};
				},
			});

			if (action === "summarize") {
				this.showTimedStatus("Processing summary");
				const summary = await summarizeRecordedTranscript({
					apiKey: this.plugin.settings.apiKey,
					transcript,
					requestUrl: async (request) => {
						const response = await requestUrl(request);
						return {
							status: response.status,
							text: response.text,
						};
					},
				});
				this.onTranscript(formatRadioTranscriptWithSummary(transcript, summary));
			} else {
				this.onTranscript(transcript);
			}

			this.isSubmitting = false;
			this.close();
		} catch (error) {
			console.error("Radio mode submission failed", error);
			this.showTimedStatus("Saving recording");
			await this.saveFailedSubmissionRecording(audio);
			const message = error instanceof Error ? error.message : "Radio mode failed.";
			new Notice(message);
			this.isSubmitting = false;
			this.close();
		}
	}

	private async saveFailedSubmissionRecording(audio: RecordedAudio | null): Promise<void> {
		if (!audio) {
			return;
		}

		try {
			const activeFile = this.app.workspace.getActiveFile();
			const attachment = await saveRecordedAudioAttachment({
				app: this.app,
				audio,
				sourcePath: activeFile?.path,
			});
			new Notice(`Saved failed recording to ${attachment.path}`);
		} catch (saveError) {
			console.error("Could not save failed radio mode recording", saveError);
			new Notice("Could not save the failed recording.");
		}
	}

	private showSubmittingState(message: string): void {
		this.setActionButtonsDisabled(true);

		const closeButton = this.contentEl.querySelector(".obsidian-stt-radio-close");
		if (closeButton instanceof HTMLButtonElement) {
			closeButton.disabled = true;
		}

		this.contentEl.addClass("is-transcribing");
		this.showTimedStatus(message);
	}

	private showTranscriptionStatus(event: RadioTranscriptionStatusEvent): void {
		if (event.status === "sending") {
			this.showTimedStatus(`Sending request #${event.attempt}`);
			return;
		}

		if (event.status === "processing") {
			this.showTimedStatus("Processing");
			return;
		}

		this.showTimedStatus(`Request #${event.attempt} failed`);
	}

	private setActionButtonsDisabled(disabled: boolean): void {
		if (this.insertButton) {
			this.insertButton.disabled = disabled;
		}

		if (this.summarizeButton) {
			this.summarizeButton.disabled = disabled;
		}
	}

	private async stopAndReadRecording(): Promise<RecordedAudio> {
		const recorder = this.mediaRecorder;
		if (!recorder || !this.didStartRecording) {
			throw new Error("No radio recording is available.");
		}

		const mimeType = recorder.mimeType;
		await this.stopMediaRecorder(recorder);
		this.stopVisualizer();
		this.stopElapsedTimer();
		this.stopStream();

		const blob = new Blob(this.chunks, {type: mimeType});
		if (blob.size === 0) {
			throw new Error("The radio recording is empty.");
		}

		return {
			buffer: await blob.arrayBuffer(),
			format: getRecordedAudioFormat(mimeType),
		};
	}

	private stopMediaRecorder(recorder: MediaRecorder): Promise<void> {
		if (recorder.state === "inactive") {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			recorder.addEventListener("stop", () => resolve(), {once: true});
			recorder.stop();
		});
	}

	private async confirmDiscard(): Promise<void> {
		if (this.isDiscarding || this.isSubmitting) {
			return;
		}

		this.isDiscarding = true;
		const shouldDiscard = !this.didStartRecording || (await confirmDiscardRecording(this.app));
		if (shouldDiscard) {
			this.close();
			return;
		}

		this.isDiscarding = false;
	}

	private startElapsedTimer(): void {
		this.startedAt = Date.now();
		this.updateElapsedTime();
		this.elapsedTimer = window.setInterval(() => this.updateElapsedTime(), 1000);
	}

	private updateElapsedTime(): void {
		if (!this.elapsedEl) {
			return;
		}

		const elapsedSeconds = Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000));
		const minutes = Math.floor(elapsedSeconds / 60);
		const seconds = String(elapsedSeconds % 60).padStart(2, "0");
		this.elapsedEl.setText(`${minutes}:${seconds}`);
	}

	private stopElapsedTimer(): void {
		if (this.elapsedTimer) {
			window.clearInterval(this.elapsedTimer);
			this.elapsedTimer = 0;
		}
	}

	private showTimedStatus(message: string): void {
		this.statusMessage = message;
		this.statusStartedAt = Date.now();
		this.updateStatusText();
		this.restartStatusTimer();
	}

	private restartStatusTimer(): void {
		this.stopStatusTimer();
		this.statusTimer = window.setInterval(() => this.updateStatusText(), 1000);
	}

	private updateStatusText(): void {
		if (!this.statusEl) {
			return;
		}

		this.statusEl.setText(`${this.statusMessage} ${this.formatElapsedSeconds(this.getStatusElapsedSeconds())}`);
	}

	private getStatusElapsedSeconds(): number {
		return Math.max(0, Math.floor((Date.now() - this.statusStartedAt) / 1000));
	}

	private formatElapsedSeconds(elapsedSeconds: number): string {
		const minutes = Math.floor(elapsedSeconds / 60);
		const seconds = String(elapsedSeconds % 60).padStart(2, "0");
		return `${minutes}:${seconds}`;
	}

	private stopStatusTimer(): void {
		if (this.statusTimer) {
			window.clearInterval(this.statusTimer);
			this.statusTimer = 0;
		}
	}

	private startVisualizer(stream: MediaStream): void {
		const visualizerEl = this.contentEl.querySelector(".obsidian-stt-radio-visualizer");
		if (!(visualizerEl instanceof HTMLElement) || !globalThis.AudioContext) {
			return;
		}

		try {
			this.audioContext = new AudioContext();
			const source = this.audioContext.createMediaStreamSource(stream);
			const analyser = this.audioContext.createAnalyser();
			const data = new Uint8Array(analyser.frequencyBinCount);
			source.connect(analyser);
			this.drawVisualizer(visualizerEl, analyser, data);
		} catch {
			this.stopVisualizer();
		}
	}

	private drawVisualizer(visualizerEl: HTMLElement, analyser: AnalyserNode, data: Uint8Array): void {
		analyser.getByteTimeDomainData(data);
		const peak = data.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0);
		visualizerEl.style.setProperty("--radio-level", String(Math.min(1, peak / 64)));
		this.animationFrame = window.requestAnimationFrame(() => this.drawVisualizer(visualizerEl, analyser, data));
	}

	private stopVisualizer(): void {
		if (this.animationFrame) {
			window.cancelAnimationFrame(this.animationFrame);
			this.animationFrame = 0;
		}

		void this.audioContext?.close();
		this.audioContext = null;
	}

	private stopRecording(): void {
		if (this.mediaRecorder?.state === "recording") {
			this.mediaRecorder.stop();
		}

		this.stopStream();
		this.mediaRecorder = null;
	}

	private stopStream(): void {
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
	}

	private complete(): void {
		if (this.didComplete) {
			return;
		}

		this.didComplete = true;
		this.onComplete();
	}
}

function confirmDiscardRecording(app: App): Promise<boolean> {
	return new Promise((resolve) => {
		new DiscardRadioRecordingModal(app, resolve).open();
	});
}

class DiscardRadioRecordingModal extends Modal {
	private readonly resolve: (confirmed: boolean) => void;
	private didResolve = false;

	constructor(app: App, resolve: (confirmed: boolean) => void) {
		super(app);
		this.resolve = resolve;
	}

	override onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass("obsidian-stt-radio-confirm");
		this.contentEl.createEl("h2", {text: "Discard this recording?"});
		this.contentEl.createEl("p", {text: "The audio will not be saved."});
		const actions = this.contentEl.createDiv({cls: "obsidian-stt-radio-confirm-actions"});

		const cancelButton = actions.createEl("button", {text: "Keep recording"});
		cancelButton.addEventListener("click", () => this.finish(false));

		const discardButton = actions.createEl("button", {
			cls: "mod-warning",
			text: "Discard",
		});
		discardButton.addEventListener("click", () => this.finish(true));
	}

	override onClose(): void {
		this.finish(false);
	}

	private finish(confirmed: boolean): void {
		if (this.didResolve) {
			return;
		}

		this.didResolve = true;
		this.resolve(confirmed);
		this.close();
	}
}
