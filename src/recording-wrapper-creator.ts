import type {App, RequestUrlParam, TFile} from "obsidian";
import {requestTranscription, type TranscriptionResult} from "./openrouter";
import {
	applyFailedTranscriptionToWrapper,
	applyProcessingTranscriptionToWrapper,
	applyTranscriptionToWrapper,
	buildRecordingCandidates,
	formatRawVoiceNoteWrapperContent,
	getAdjacentWrapperPath,
	getTranscriptStatus,
	type RecordingCandidate,
} from "./recording-wrappers";

export interface RecordingWrapperCreationResult {
	created: number;
	skipped: number;
}

export interface BulkTranscriptionResult {
	created: number;
	transcribed: number;
	failed: number;
	skipped: number;
}

export type RequestUrlAdapter = (request: RequestUrlParam) => Promise<{status: number; text: string}>;
const DEFAULT_BULK_TRANSCRIPTION_CONCURRENCY = 3;

export async function createMissingRecordingWrappers(app: App, now: () => Date = () => new Date()): Promise<RecordingWrapperCreationResult> {
	const candidates = buildRecordingCandidates(app);
	let created = 0;
	let skipped = 0;

	for (const candidate of candidates) {
		if (candidate.status === "wrapped") {
			skipped += 1;
			continue;
		}

		await createRecordingWrapper(app, candidate.audio, now());
		created += 1;
	}

	return {created, skipped};
}

export async function bulkTranscribeRecordings(params: {
	app: App;
	apiKey: string;
	requestUrl: RequestUrlAdapter;
	now?: () => Date;
	concurrency?: number;
}): Promise<BulkTranscriptionResult> {
	const now = params.now ?? (() => new Date());
	const concurrency = params.concurrency ?? DEFAULT_BULK_TRANSCRIPTION_CONCURRENCY;
	const result: BulkTranscriptionResult = {created: 0, transcribed: 0, failed: 0, skipped: 0};
	const candidates = buildRecordingCandidates(params.app);

	await runWithConcurrency(candidates, concurrency, async (candidate) => {
		await processCandidate(params, candidate, now(), result);
	});

	return result;
}

async function processCandidate(
	params: {app: App; apiKey: string; requestUrl: RequestUrlAdapter},
	candidate: RecordingCandidate,
	createdAt: Date,
	result: BulkTranscriptionResult,
): Promise<void> {
	const target = await ensureTranscriptionTarget(params.app, candidate, createdAt, result);
	if (!target) {
		result.skipped += 1;
		return;
	}

	await transcribeTarget(params, target.audio, target.wrapper, result);
}

async function ensureTranscriptionTarget(
	app: App,
	candidate: RecordingCandidate,
	createdAt: Date,
	result: BulkTranscriptionResult,
): Promise<{audio: TFile; wrapper: TFile} | null> {
	if (!candidate.wrapper) {
		const wrapper = await createRecordingWrapper(app, candidate.audio, createdAt);
		result.created += 1;
		return {audio: candidate.audio, wrapper};
	}

	if (isRetryableTranscriptStatus(getTranscriptStatus(app, candidate.wrapper))) {
		return {audio: candidate.audio, wrapper: candidate.wrapper};
	}

	return null;
}

async function transcribeTarget(
	params: {app: App; apiKey: string; requestUrl: RequestUrlAdapter},
	audio: TFile,
	wrapper: TFile,
	result: BulkTranscriptionResult,
): Promise<void> {
	try {
		await markProcessing(params.app, wrapper);
		const transcription = await requestRecordingTranscription(params, audio);
		await applySuccessfulTranscription(params.app, wrapper, transcription);
		result.transcribed += 1;
	} catch (error) {
		await applyFailedTranscription(params.app, wrapper, error);
		result.failed += 1;
	}
}

async function markProcessing(app: App, wrapper: TFile): Promise<void> {
	const content = await app.vault.read(wrapper);
	await app.vault.modify(wrapper, applyProcessingTranscriptionToWrapper(content));
}

async function requestRecordingTranscription(
	params: {app: App; apiKey: string; requestUrl: RequestUrlAdapter},
	audio: TFile,
): Promise<TranscriptionResult> {
	const audioBuffer = await params.app.vault.readBinary(audio);

	return requestTranscription({
		apiKey: params.apiKey,
		audioBuffer,
		audioPath: audio.path,
		requestUrl: params.requestUrl,
	});
}

async function applySuccessfulTranscription(app: App, wrapper: TFile, transcription: TranscriptionResult): Promise<void> {
	const content = await app.vault.read(wrapper);
	await app.vault.modify(wrapper, applyTranscriptionToWrapper(content, transcription.transcription));
}

async function applyFailedTranscription(app: App, wrapper: TFile, error: unknown): Promise<void> {
	const content = await app.vault.read(wrapper);
	const message = error instanceof Error ? error.message : "Unknown transcription error.";
	await app.vault.modify(wrapper, applyFailedTranscriptionToWrapper(content, message));
}

async function createRecordingWrapper(app: App, audio: TFile, createdAt: Date): Promise<TFile> {
	const wrapperPath = getAdjacentWrapperPath(audio);
	const audioLink = app.fileManager.generateMarkdownLink(audio, wrapperPath);

	return app.vault.create(
		wrapperPath,
		formatRawVoiceNoteWrapperContent({
			title: audio.basename,
			audioLink,
			createdAt,
			recordedAt: new Date(audio.stat.ctime),
		}),
	);
}

function isRetryableTranscriptStatus(status: string): boolean {
	return status === "raw" || status === "failed" || status === "pending" || status === "processing";
}

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	worker: (item: T) => Promise<void>,
): Promise<void> {
	const normalizedConcurrency = Math.min(Math.max(1, concurrency), items.length);
	const workers = Array.from({length: normalizedConcurrency}, async (_, workerIndex) => {
		for (let index = workerIndex; index < items.length; index += normalizedConcurrency) {
			await worker(items[index] as T);
		}
	});

	await Promise.all(workers);
}
