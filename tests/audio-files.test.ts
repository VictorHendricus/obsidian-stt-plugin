/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {isSupportedAudioFilePath, sortSupportedAudioFiles} from "../src/audio-files.ts";

void test("isSupportedAudioFilePath matches m4a and mp3 extensions case-insensitively", () => {
	assert.equal(isSupportedAudioFilePath("Recordings/clip.m4a"), true);
	assert.equal(isSupportedAudioFilePath("Recordings/clip.M4A"), true);
	assert.equal(isSupportedAudioFilePath("Recordings/clip.mp3"), true);
	assert.equal(isSupportedAudioFilePath("Recordings/clip.wav"), false);
});

void test("sortSupportedAudioFiles keeps only supported audio files and sorts by path", () => {
	const files = [
		{path: "z-last.mp3", extension: "mp3"},
		{path: "voice-note.m4a", extension: "m4a"},
		{path: "notes.md", extension: "md"},
		{path: "Audio/first.M4A", extension: "M4A"},
	];

	assert.deepEqual(sortSupportedAudioFiles(files), [
		{path: "Audio/first.M4A", extension: "M4A"},
		{path: "voice-note.m4a", extension: "m4a"},
		{path: "z-last.mp3", extension: "mp3"},
	]);
});
