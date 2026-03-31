export interface FilePathLike {
	path: string;
	extension?: string;
}

export const SUPPORTED_AUDIO_EXTENSIONS = ["m4a", "mp3"] as const;

export function isSupportedAudioFilePath(path: string): boolean {
	const normalizedPath = path.trim().toLowerCase();
	return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => normalizedPath.endsWith(`.${extension}`));
}

export function isSupportedAudioFile(file: FilePathLike): boolean {
	if (typeof file.extension === "string" && file.extension.length > 0) {
		return SUPPORTED_AUDIO_EXTENSIONS.includes(file.extension.toLowerCase() as (typeof SUPPORTED_AUDIO_EXTENSIONS)[number]);
	}

	return isSupportedAudioFilePath(file.path);
}

export function sortSupportedAudioFiles<T extends FilePathLike>(files: readonly T[]): T[] {
	return files
		.filter((file) => isSupportedAudioFile(file))
		.slice()
		.sort((left, right) => left.path.localeCompare(right.path, undefined, {sensitivity: "base"}));
}
