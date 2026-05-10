/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {createTranscriptionNoteBasename} from "../src/note-titles.ts";
import {
	applyFailedTranscriptionToWrapper,
	applyProcessingTranscriptionToWrapper,
	applyTranscriptionToWrapper,
	formatPendingVoiceNoteWrapperContent,
	formatRawVoiceNoteWrapperContent,
} from "../src/recording-wrappers.ts";

const wrapperFixture = {
	title: "idea",
	audioLink: "[[Recordings/idea.m4a]]",
	createdAt: new Date(2026, 4, 8, 9, 10, 11),
	recordedAt: new Date(2026, 4, 7),
};

void test("createTranscriptionNoteBasename preserves long generated titles", () => {
	const title = "Learning to consciously interrupt the flow of thoughts through physical body awareness";

	assert.equal(createTranscriptionNoteBasename(title), title);
});

void test("createTranscriptionNoteBasename still limits unusually long filenames", () => {
	const title = [
		"Learning to consciously interrupt the flow of thoughts through physical body awareness",
		"while practicing attention during a long reflective walk through a familiar neighborhood",
		"and comparing different techniques for returning to the present moment",
	].join(" ");

	assert.equal(createTranscriptionNoteBasename(title).length <= 180, true);
});

void test("createTranscriptionNoteBasename falls back when title is unusable", () => {
	assert.equal(createTranscriptionNoteBasename(""), "Transcribed recording");
	assert.equal(createTranscriptionNoteBasename("/// ###"), "Transcribed recording");
});

void test("createTranscriptionNoteBasename removes unsafe filename characters", () => {
	assert.equal(createTranscriptionNoteBasename("Meeting: plan / risks?"), "Meeting plan risks");
});

void test("formatPendingVoiceNoteWrapperContent creates a durable pending wrapper", () => {
	const content = formatPendingVoiceNoteWrapperContent(wrapperFixture);

	assert.match(content, /type: voice-note/);
	assert.match(content, /status: pending/);
	assert.match(content, /# idea/);
	assert.match(content, /!\[\[Recordings\/idea\.m4a\]\]/);
	assert.match(content, /Pending transcription\./);
	assert.doesNotMatch(content, /#[^\n]*\n\n/);
});

void test("formatRawVoiceNoteWrapperContent creates a non-transcribed wrapper", () => {
	const content = formatRawVoiceNoteWrapperContent(wrapperFixture);

	assert.match(content, /type: voice-note/);
	assert.match(content, /status: raw/);
	assert.match(content, /# idea/);
	assert.match(content, /!\[\[Recordings\/idea\.m4a\]\]/);
	assert.match(content, /Not transcribed yet\./);
	assert.doesNotMatch(content, /#[^\n]*\n\n/);
});

void test("applyTranscriptionToWrapper replaces pending transcript and marks transcribed", () => {
	const pending = formatPendingVoiceNoteWrapperContent({
		title: "idea",
		audioLink: "[[Recordings/idea.m4a]]",
		createdAt: new Date(2026, 4, 8),
		recordedAt: new Date(2026, 4, 7),
	});

	const transcribed = applyTranscriptionToWrapper(pending, "final transcript");

	assert.match(transcribed, /status: transcribed/);
	assert.match(transcribed, /## Transcript\nfinal transcript/);
	assert.doesNotMatch(transcribed, /## Transcript\n\n/);
	assert.doesNotMatch(transcribed, /Pending transcription\./);
});

void test("applyFailedTranscriptionToWrapper preserves wrapper and records failure", () => {
	const pending = formatPendingVoiceNoteWrapperContent({
		title: "idea",
		audioLink: "[[Recordings/idea.m4a]]",
		createdAt: new Date(2026, 4, 8),
		recordedAt: new Date(2026, 4, 7),
	});

	const failed = applyFailedTranscriptionToWrapper(pending, "Network unavailable");

	assert.match(failed, /status: failed/);
	assert.match(failed, /## Transcript\nNetwork unavailable/);
	assert.doesNotMatch(failed, /## Transcript\n\n/);
});

void test("applyProcessingTranscriptionToWrapper marks interrupted work visibly retryable", () => {
	const raw = formatRawVoiceNoteWrapperContent({
		title: "idea",
		audioLink: "[[Recordings/idea.m4a]]",
		createdAt: new Date(2026, 4, 8),
		recordedAt: new Date(2026, 4, 7),
	});

	const processing = applyProcessingTranscriptionToWrapper(raw);

	assert.match(processing, /status: processing/);
	assert.match(processing, /## Transcript\nTranscription in progress\./);
	assert.doesNotMatch(processing, /## Transcript\n\n/);
});
