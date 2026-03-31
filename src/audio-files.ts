export interface FilePathLike {
	path: string;
	extension?: string;
}

export function isMp3FilePath(path: string): boolean {
	return path.trim().toLowerCase().endsWith(".mp3");
}

export function isMp3File(file: FilePathLike): boolean {
	if (typeof file.extension === "string" && file.extension.length > 0) {
		return file.extension.toLowerCase() === "mp3";
	}

	return isMp3FilePath(file.path);
}

export function sortMp3Files<T extends FilePathLike>(files: readonly T[]): T[] {
	return files
		.filter((file) => isMp3File(file))
		.slice()
		.sort((left, right) => left.path.localeCompare(right.path, undefined, {sensitivity: "base"}));
}
