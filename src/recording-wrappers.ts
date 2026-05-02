import {App, TFile, normalizePath} from "obsidian";
import {isAudioFile} from "./audio-files";
export {createTranscriptionNoteBasename} from "./note-titles";

export type TranscriptStatus = "raw" | "transcribed" | "failed" | "processing";

export type RecordingCandidate = {
	audio: TFile;
	wrapper: TFile | null;
	status: "unwrapped" | "wrapped";
	transcriptStatus?: TranscriptStatus;
};

export type WrapperIndex = {
	byAudioPath: Map<string, TFile>;
	byResolvedAudioPath: Map<string, TFile>;
};

const VOICE_NOTE_TYPE = "voice-note";

export function buildRecordingCandidates(app: App): RecordingCandidate[] {
	const index = buildWrapperIndex(app);

	return app.vault
		.getFiles()
		.filter(isAudioFile)
		.map((audio) => {
			const wrapper =
				findAdjacentWrapper(app, audio) ??
				index.byAudioPath.get(audio.path) ??
				index.byResolvedAudioPath.get(audio.path) ??
				null;

			const candidate: RecordingCandidate = {
				audio,
				wrapper,
				status: wrapper ? "wrapped" : "unwrapped",
				transcriptStatus: wrapper ? getTranscriptStatus(app, wrapper) : undefined,
			};

			return candidate;
		})
		.sort(compareRecordingCandidates);
}

export function buildWrapperIndex(app: App): WrapperIndex {
	const byAudioPath = new Map<string, TFile>();
	const byResolvedAudioPath = new Map<string, TFile>();
	const markdownFiles = app.vault
		.getMarkdownFiles()
		.slice()
		.sort((left, right) => left.path.localeCompare(right.path, undefined, {sensitivity: "base"}));

	for (const file of markdownFiles) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		const isVoiceNote = isVoiceNoteFrontmatter(frontmatter);

		if (isVoiceNote) {
			const audioPath = getFrontmatterString(frontmatter, "audio_path");
			if (audioPath) {
				addFirst(byAudioPath, audioPath, file);
			}

			const sourceLink = getFrontmatterString(frontmatter, "source") || getFrontmatterString(frontmatter, "audio");
			for (const resolvedPath of resolveMarkdownLinks(app, sourceLink, file.path)) {
				addFirst(byResolvedAudioPath, resolvedPath, file);
			}
		}

		if (isVoiceNote || looksLikeLegacyWrapper(cache)) {
			for (const resolvedPath of Object.keys(app.metadataCache.resolvedLinks[file.path] ?? {})) {
				const resolvedFile = app.vault.getAbstractFileByPath(resolvedPath);
				if (resolvedFile instanceof TFile && isAudioFile(resolvedFile)) {
					addFirst(byResolvedAudioPath, resolvedPath, file);
				}
			}
		}
	}

	return {byAudioPath, byResolvedAudioPath};
}

export function findAdjacentWrapper(app: App, audio: TFile): TFile | null {
	const folderPrefix = audio.parent && audio.parent.path !== "/" ? `${audio.parent.path}/` : "";
	const wrapperPath = `${folderPrefix}${audio.basename}.md`;
	const wrapper = app.vault.getAbstractFileByPath(wrapperPath);

	return wrapper instanceof TFile && wrapper.extension === "md" ? wrapper : null;
}

export function getTranscriptStatus(app: App, wrapper: TFile): TranscriptStatus {
	const frontmatter = app.metadataCache.getFileCache(wrapper)?.frontmatter;
	const status = getFrontmatterString(frontmatter, "status") || getFrontmatterString(frontmatter, "transcript_status");

	if (status === "raw" || status === "transcribed" || status === "failed" || status === "processing") {
		return status;
	}

	return "raw";
}

export function getAdjacentWrapperPath(audio: TFile): string {
	const folderPrefix = audio.parent && audio.parent.path !== "/" ? `${audio.parent.path}/` : "";
	return `${folderPrefix}${audio.basename}.md`;
}

export function getAvailableMarkdownPath(app: App, folderPath: string, basename: string, currentFile?: TFile): string {
	const folderPrefix = folderPath === "/" || folderPath.length === 0 ? "" : `${folderPath}/`;

	for (let index = 0; ; index += 1) {
		const suffix = index === 0 ? "" : ` ${index + 1}`;
		const path = normalizePath(`${folderPrefix}${basename}${suffix}.md`);
		const existingFile = app.vault.getAbstractFileByPath(path);

		if (!existingFile || existingFile === currentFile) {
			return path;
		}
	}
}

export function formatVoiceNoteWrapperContent(params: {
	title: string;
	audioLink: string;
	createdAt: Date;
	recordedAt: Date;
	transcriptStatus: TranscriptStatus;
	transcript: string;
}): string {
	const bodyAudioLink = params.audioLink.startsWith("!") ? params.audioLink : `!${params.audioLink}`;

	return [
		"---",
		"type: voice-note",
		`source: ${quoteYamlString(params.audioLink)}`,
		`created: ${quoteYamlString(formatDateTimeProperty(params.createdAt))}`,
		`recorded: ${formatDateProperty(params.recordedAt)}`,
		`status: ${params.transcriptStatus}`,
		"tags:",
		"  - voice-note",
		"---",
		"",
		`# ${params.title}`,
		"",
		"## Audio",
		"",
		bodyAudioLink,
		"",
		"## Transcript",
		"",
		params.transcript.trim(),
		"",
	].join("\n");
}

export function upsertSection(markdown: string, heading: string, body: string): string {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const pattern = new RegExp(`(^## ${escaped}\\n)([\\s\\S]*?)(?=\\n## |$)`, "m");

	if (pattern.test(markdown)) {
		return markdown.replace(pattern, `$1\n${body.trim()}\n`);
	}

	return `${markdown.trim()}\n\n## ${heading}\n\n${body.trim()}\n`;
}

export function updateFrontmatterField(markdown: string, key: string, value: string): string {
	const line = `${key}: ${value}`;
	const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);

	if (!frontmatterMatch) {
		return `---\n${line}\n---\n\n${markdown.trim()}\n`;
	}

	const block = frontmatterMatch[1] ?? "";
	const pattern = new RegExp(`^${escapeRegExp(key)}:.*$`, "m");
	const nextBlock = pattern.test(block) ? block.replace(pattern, line) : `${block.trimEnd()}\n${line}`;

	return markdown.replace(/^---\n[\s\S]*?\n---/, `---\n${nextBlock}\n---`);
}

function compareRecordingCandidates(left: RecordingCandidate, right: RecordingCandidate): number {
	if (left.status !== right.status) {
		return left.status === "unwrapped" ? -1 : 1;
	}

	return left.audio.path.localeCompare(right.audio.path, undefined, {sensitivity: "base"});
}

function isVoiceNoteFrontmatter(frontmatter: Record<string, unknown> | undefined): frontmatter is Record<string, unknown> {
	return getFrontmatterString(frontmatter, "type") === VOICE_NOTE_TYPE;
}

function looksLikeLegacyWrapper(cache: {headings?: Array<{heading: string}>} | null): boolean {
	return cache?.headings?.some((heading) => heading.heading.trim().toLowerCase() === "transcript") ?? false;
}

function getFrontmatterString(frontmatter: Record<string, unknown> | undefined, key: string): string {
	const value = frontmatter?.[key];
	return typeof value === "string" ? value.trim() : "";
}

function resolveMarkdownLinks(app: App, markdown: string, sourcePath: string): string[] {
	const resolvedPaths: string[] = [];
	if (!markdown) {
		return resolvedPaths;
	}

	const wikiLinkPattern = /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
	for (const match of markdown.matchAll(wikiLinkPattern)) {
		const linkpath = match[1]?.trim();
		if (!linkpath) {
			continue;
		}

		const file = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
		if (file && isAudioFile(file)) {
			resolvedPaths.push(file.path);
		}
	}

	return resolvedPaths;
}

function addFirst(map: Map<string, TFile>, key: string, file: TFile): void {
	if (!map.has(key)) {
		map.set(key, file);
	}
}

function quoteYamlString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function formatDateTimeProperty(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function formatDateProperty(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
