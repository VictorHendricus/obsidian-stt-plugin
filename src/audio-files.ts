export interface FilePathLike {
	path: string;
	extension?: string;
}

export const AUDIO_EXTENSIONS = new Set([
	"m4a",
	"mp3",
	"wav",
	"ogg",
	"flac",
	"webm",
	"3gp",
]);

export function isSupportedAudioFilePath(path: string): boolean {
	const extension = path.trim().toLowerCase().split(".").pop();
	return typeof extension === "string" && AUDIO_EXTENSIONS.has(extension);
}

export function isAudioFile(file: FilePathLike): boolean {
	if (typeof file.extension === "string" && file.extension.length > 0) {
		return AUDIO_EXTENSIONS.has(file.extension.toLowerCase());
	}

	return isSupportedAudioFilePath(file.path);
}

export const isSupportedAudioFile = isAudioFile;

export function sortSupportedAudioFiles<T extends FilePathLike>(files: readonly T[]): T[] {
	return files
		.filter((file) => isAudioFile(file))
		.slice()
		.sort((left, right) => left.path.localeCompare(right.path, undefined, {sensitivity: "base"}));
}
