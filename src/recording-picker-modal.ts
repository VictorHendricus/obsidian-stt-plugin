import {App, Modal} from "obsidian";
import type {RecordingCandidate} from "./recording-wrappers";

export class RecordingPickerModal extends Modal {
	private readonly candidates: RecordingCandidate[];
	private readonly onChooseCandidate: (candidate: RecordingCandidate) => Promise<void>;
	private searchInputEl: HTMLInputElement | null = null;
	private hideWrappedInputEl: HTMLInputElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private query = "";
	private hideWrapped = false;

	constructor(
		app: App,
		candidates: RecordingCandidate[],
		onChooseCandidate: (candidate: RecordingCandidate) => Promise<void>,
	) {
		super(app);
		this.candidates = candidates;
		this.onChooseCandidate = onChooseCandidate;
	}

	onOpen(): void {
		this.setTitle("Transcribe recording");
		this.contentEl.empty();
		this.contentEl.addClass("obsidian-stt-recording-picker");

		this.searchInputEl = this.contentEl.createEl("input", {
			type: "search",
			placeholder: "Search recordings...",
			cls: "obsidian-stt-recording-search",
		});
		this.searchInputEl.addEventListener("input", () => {
			this.query = this.searchInputEl?.value.trim().toLowerCase() ?? "";
			this.renderResults();
		});

		const toggleLabel = this.contentEl.createEl("label", {
			cls: "obsidian-stt-recording-toggle",
		});
		this.hideWrappedInputEl = toggleLabel.createEl("input", {type: "checkbox"});
		toggleLabel.createSpan({text: "Hide recordings that already have wrappers"});
		this.hideWrappedInputEl.addEventListener("change", () => {
			this.hideWrapped = this.hideWrappedInputEl?.checked ?? false;
			this.renderResults();
		});

		this.resultsEl = this.contentEl.createDiv({cls: "obsidian-stt-recording-results"});
		this.renderResults();
		this.searchInputEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
		this.searchInputEl = null;
		this.hideWrappedInputEl = null;
		this.resultsEl = null;
	}

	private renderResults(): void {
		if (!this.resultsEl) {
			return;
		}

		this.resultsEl.empty();
		const visibleCandidates = this.getVisibleCandidates();
		const needsWrapper = visibleCandidates.filter((candidate) => candidate.status === "unwrapped");
		const wrapped = visibleCandidates.filter((candidate) => candidate.status === "wrapped");

		this.renderGroup("Needs wrapper", needsWrapper);
		this.renderGroup("Already has wrapper", wrapped);

		if (visibleCandidates.length === 0) {
			this.resultsEl.createDiv({
				text: "No matching recordings.",
				cls: "obsidian-stt-recording-empty",
			});
		}
	}

	private renderGroup(title: string, candidates: RecordingCandidate[]): void {
		if (!this.resultsEl || candidates.length === 0) {
			return;
		}

		const groupEl = this.resultsEl.createDiv({cls: "obsidian-stt-recording-group"});
		groupEl.createEl("h3", {text: title});
		groupEl.createDiv({cls: "obsidian-stt-recording-divider"});

		for (const candidate of candidates) {
			const rowEl = groupEl.createEl("button", {
				type: "button",
				cls: "obsidian-stt-recording-row",
			});
			rowEl.addEventListener("click", () => {
				this.close();
				void this.onChooseCandidate(candidate);
			});

			rowEl.createDiv({
				text: candidate.audio.name,
				cls: "obsidian-stt-recording-name",
			});
			rowEl.createDiv({
				text: candidate.audio.path,
				cls: "obsidian-stt-recording-path",
			});
			rowEl.createDiv({
				text: `Status: ${this.getStatusText(candidate)}`,
				cls: "obsidian-stt-recording-status",
			});

			if (candidate.wrapper) {
				rowEl.createDiv({
					text: `Wrapper: ${candidate.wrapper.path}`,
					cls: "obsidian-stt-recording-wrapper",
				});
			}
		}
	}

	private getVisibleCandidates(): RecordingCandidate[] {
		return this.candidates.filter((candidate) => {
			if (this.hideWrapped && candidate.status === "wrapped") {
				return false;
			}

			if (!this.query) {
				return true;
			}

			const haystack = [
				candidate.audio.name,
				candidate.audio.path,
				candidate.wrapper?.path ?? "",
				candidate.transcriptStatus ?? "",
			]
				.join("\n")
				.toLowerCase();

			return haystack.includes(this.query);
		});
	}

	private getStatusText(candidate: RecordingCandidate): string {
		if (candidate.status === "unwrapped") {
			return "no wrapper";
		}

		return candidate.transcriptStatus ?? "wrapped";
	}
}
