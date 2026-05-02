/* eslint-disable import/no-nodejs-modules */
import test from "node:test";
import assert from "node:assert/strict";
import {createTranscriptionNoteBasename} from "../src/note-titles.ts";

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
