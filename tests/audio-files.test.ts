/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {isMp3FilePath, sortMp3Files} from "../src/audio-files.ts";

void test("isMp3FilePath matches mp3 extensions case-insensitively", () => {
	assert.equal(isMp3FilePath("Recordings/clip.mp3"), true);
	assert.equal(isMp3FilePath("Recordings/clip.MP3"), true);
	assert.equal(isMp3FilePath("Recordings/clip.wav"), false);
});

void test("sortMp3Files keeps only mp3 files and sorts by path", () => {
	const files = [
		{path: "z-last.mp3", extension: "mp3"},
		{path: "notes.md", extension: "md"},
		{path: "Audio/first.MP3", extension: "MP3"},
	];

	assert.deepEqual(sortMp3Files(files), [
		{path: "Audio/first.MP3", extension: "MP3"},
		{path: "z-last.mp3", extension: "mp3"},
	]);
});
