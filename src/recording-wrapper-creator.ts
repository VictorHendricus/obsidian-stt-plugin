import type {App, RequestUrlParam, TFile} from "obsidian";
import {requestTranscription, type TranscriptionResult} from "./openrouter.ts";
import {
	buildRecordingCandidates,
	createTranscriptionNoteBasename,
	formatFailedVoiceNoteWrapperContent,
	formatRawVoiceNoteWrapperContent,
	formatVoiceNoteWrapperContent,
	getAvailableMarkdownPath,
	getTranscriptStatus,
	type RecordingCandidate,
} from "./recording-wrappers.ts";

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

export interface TranscribeRecordingIntoWrapperResult {
	wrapper: TFile;
	created: boolean;
	transcribed: boolean;
	error?: unknown;
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

export async function transcribeRecordingIntoWrapper(params: {
	app: App;
	apiKey: string;
	audio: TFile;
	requestUrl: RequestUrlAdapter;
	existingWrapper?: TFile | null;
	now?: () => Date;
}): Promise<TranscribeRecordingIntoWrapperResult> {
	const createdAt = params.now?.() ?? new Date();
	const created = !params.existingWrapper;
	let wrapper = params.existingWrapper ?? (await createRecordingWrapper(params.app, params.audio, createdAt, "processing"));

	try {
		wrapper = await rewriteProcessingWrapper(params.app, params.audio, wrapper, createdAt);
		const transcription = await requestRecordingTranscription(params, params.audio);
		wrapper = await rewriteSuccessfulWrapper(params.app, params.audio, wrapper, transcription, createdAt);

		return {wrapper, created, transcribed: true};
	} catch (error) {
		wrapper = await rewriteFailedWrapper(params.app, params.audio, wrapper, error, createdAt);

		return {wrapper, created, transcribed: false, error};
	}
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
		const wrapper = await createRecordingWrapper(app, candidate.audio, createdAt, "processing");
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
		wrapper = await rewriteProcessingWrapper(params.app, audio, wrapper, new Date());
		const transcription = await requestRecordingTranscription(params, audio);
		await rewriteSuccessfulWrapper(params.app, audio, wrapper, transcription, new Date());
		result.transcribed += 1;
	} catch (error) {
		await rewriteFailedWrapper(params.app, audio, wrapper, error, new Date());
		result.failed += 1;
	}
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

async function rewriteProcessingWrapper(app: App, audio: TFile, wrapper: TFile, createdAt: Date): Promise<TFile> {
	const title = audio.basename;
	return rewriteWrapperContent(app, audio, wrapper, title, createdAt, (base) =>
		formatVoiceNoteWrapperContent({
			...base,
			transcriptStatus: "processing",
			transcript: "Transcription in progress.",
		}),
	);
}

async function rewriteSuccessfulWrapper(
	app: App,
	audio: TFile,
	wrapper: TFile,
	transcription: TranscriptionResult,
	createdAt: Date,
): Promise<TFile> {
	const title = createTranscriptionNoteBasename(transcription.title);
	return rewriteWrapperContent(app, audio, wrapper, title, createdAt, (base) =>
		formatVoiceNoteWrapperContent({
			...base,
			transcriptStatus: "transcribed",
			transcript: transcription.transcription,
		}),
	);
}

async function rewriteFailedWrapper(
	app: App,
	audio: TFile,
	wrapper: TFile,
	error: unknown,
	createdAt: Date,
): Promise<TFile> {
	const message = error instanceof Error ? error.message : "Unknown transcription error.";
	const title = audio.basename;
	return rewriteWrapperContent(app, audio, wrapper, title, createdAt, (base) =>
		formatFailedVoiceNoteWrapperContent({
			...base,
			error: message,
		}),
	);
}

async function rewriteWrapperContent(
	app: App,
	audio: TFile,
	wrapper: TFile,
	title: string,
	createdAt: Date,
	formatContent: (base: {title: string; audioLink: string; createdAt: Date; recordedAt: Date}) => string,
): Promise<TFile> {
	const target = await moveWrapperToTitle(app, wrapper, title);
	const audioLink = app.fileManager.generateMarkdownLink(audio, target.path);

	await app.vault.modify(target, formatContent({title, audioLink, createdAt, recordedAt: new Date(audio.stat.ctime)}));

	return target;
}

async function createRecordingWrapper(
	app: App,
	audio: TFile,
	createdAt: Date,
	status: "raw" | "processing" = "raw",
): Promise<TFile> {
	const wrapperPath = getRootWrapperPath(app, audio.basename);
	const audioLink = app.fileManager.generateMarkdownLink(audio, wrapperPath);
	const content =
		status === "processing"
			? formatVoiceNoteWrapperContent({
					title: audio.basename,
					audioLink,
					createdAt,
					recordedAt: new Date(audio.stat.ctime),
					transcriptStatus: "processing",
					transcript: "Transcription in progress.",
				})
			: formatRawVoiceNoteWrapperContent({
					title: audio.basename,
					audioLink,
					createdAt,
					recordedAt: new Date(audio.stat.ctime),
				});

	return app.vault.create(wrapperPath, content);
}

async function moveWrapperToTitle(app: App, wrapper: TFile, title: string): Promise<TFile> {
	const targetPath = getRootWrapperPath(app, title, wrapper);
	if (wrapper.path !== targetPath) {
		await app.fileManager.renameFile(wrapper, targetPath);
	}

	const target = app.vault.getAbstractFileByPath(targetPath);
	return isFile(target) ? target : wrapper;
}

function getRootWrapperPath(app: App, title: string, currentFile?: TFile): string {
	const folderPath = app.fileManager.getNewFileParent("", `${title}.md`).path;
	return getAvailableMarkdownPath(app, folderPath, title, currentFile);
}

function isRetryableTranscriptStatus(status: string): boolean {
	return status === "raw" || status === "failed" || status === "pending" || status === "processing";
}

function isFile(file: unknown): file is TFile {
	return typeof file === "object" && file !== null && "path" in file && "extension" in file;
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
