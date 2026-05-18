// @ts-check

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
	$schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
	mutate: [
		"src/audio-files.ts",
		"src/note-titles.ts",
		"src/openrouter.ts",
	],
	testRunner: "command",
	commandRunner: {
		command: "npm test",
	},
	reporters: ["clear-text", "progress", "html"],
	coverageAnalysis: "off",
	thresholds: {
		high: 80,
		low: 75,
		break: 75,
	},
};

export default config;
