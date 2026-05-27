/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {formatRadioTranscriptWithSummary, getRecordedAudioFormat, selectRecorderFormat} from "../src/radio-transcription.ts";

void test("selectRecorderFormat prefers webm opus when supported", () => {
	const selected = selectRecorderFormat((mimeType) => mimeType === "audio/webm;codecs=opus");

	assert.deepEqual(selected, {
		mimeType: "audio/webm;codecs=opus",
		format: "webm",
	});
});

void test("selectRecorderFormat falls back to mobile-friendly mp4", () => {
	const selected = selectRecorderFormat((mimeType) => mimeType === "audio/mp4");

	assert.deepEqual(selected, {
		mimeType: "audio/mp4",
		format: "m4a",
	});
});

void test("selectRecorderFormat reports unsupported recorders", () => {
	assert.equal(selectRecorderFormat(() => false), null);
});

void test("getRecordedAudioFormat maps media recorder mime types to OpenRouter formats", () => {
	assert.equal(getRecordedAudioFormat("audio/webm;codecs=opus"), "webm");
	assert.equal(getRecordedAudioFormat("audio/mp4"), "m4a");
	assert.equal(getRecordedAudioFormat("audio/mpeg"), "mp3");
	assert.equal(getRecordedAudioFormat("audio/ogg;codecs=opus"), "ogg");
	assert.equal(getRecordedAudioFormat("audio/wav"), "wav");
	assert.throws(() => getRecordedAudioFormat("audio/aac"), /not supported/);
});

void test("formatRadioTranscriptWithSummary matches the note insertion structure", () => {
	assert.equal(
		formatRadioTranscriptWithSummary("Actual transcription text", ["Point 1", "Point 2"]),
		[
			"ST",
			"    - Transcription:",
			"        - Actual transcription text",
			"    - Summary:",
			"        - Point 1",
			"        - Point 2",
		].join("\n"),
	);
});
