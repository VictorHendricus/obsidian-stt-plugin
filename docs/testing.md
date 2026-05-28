# Testing

This project uses a simple testing model:

- Gherkin files in `features/` are human-readable specifications.
- BDD-style acceptance tests use the testing API in `src/testing/plugin-testing-api.ts`.
- Unit tests can call production modules directly.
- There is no Gherkin parser, IR compiler, or test generator.

## Test Commands

Run the normal test suite:

```bash
npm test
```

Run the required full quality gate:

```bash
npm run quality
```

`npm run quality` runs build, lint, coverage, and CRAP checks. Work is not complete until this command passes.

## Specification Files

Feature files live in `features/`.

They describe intended behavior in Gherkin syntax, for example:

```gherkin
Feature: File Transcribe

  Scenario: User transcribes all unwrapped recordings
    Given the vault contains an unwrapped audio file "Recordings/idea.m4a"
    When the user opens File Transcribe from the ribbon button
    And selects Transcribe all
    Then a voice note wrapper file is created
    And the audio file is transcribed
    And the wrapper status is "transcribed"
```

These files are specifications only. They are not parsed or executed by tooling. When behavior changes, update the feature file and then update or add tests that express the same behavior.

## BDD-Style Tests

BDD-style tests live in regular `node:test` files and use `createPluginTestingApi()`.

The testing API provides a stable behavior-facing boundary:

```ts
const api = createPluginTestingApi();

api.vault.addUnwrappedAudio("Recordings/idea.m4a");

const modal = await api.plugin.fileTranscribe();
await modal.transcribeAll();

api.wrapper.expectCreated();
api.transcription.expectRequestCount(1);
api.wrapper.expectStatus("transcribed");
api.editor.expectNoInsertedLink();
api.workspace.expectNoOpenedFile();
```

Use the testing API when a test is expressing user-observable behavior from a feature file. This keeps acceptance-style tests from depending on private implementation details.

Current API areas:

- `api.vault`: arrange vault/audio/wrapper state.
- `api.plugin`: trigger user-facing plugin actions.
- `api.transcription`: assert transcription request behavior.
- `api.wrapper`: assert wrapper creation and status.
- `api.editor`: assert editor side effects.
- `api.workspace`: assert workspace/file-opening side effects.

## Unit Tests

Unit tests can call production code directly.

Use direct calls for small deterministic logic, such as:

- audio extension detection
- wrapper markdown formatting
- title sanitization
- OpenRouter request/response helpers

Example:

```ts
assert.equal(isSupportedAudioFilePath("Recordings/clip.m4a"), true);
```

Prefer unit tests when the behavior is local to one module and does not need the BDD testing API vocabulary.

## Choosing A Test Style

Use a feature file plus BDD-style testing API test when:

- the behavior is user-facing
- the test describes a workflow
- the behavior crosses plugin boundaries such as vault, editor, workspace, and transcription requests
- the test should read like acceptance criteria

Use a direct unit test when:

- the behavior is a pure function or small module contract
- setup through the testing API would obscure the intent
- the test needs to cover edge cases in parsing, formatting, or error handling

## No Parser Or Generator

The project intentionally does not generate tests from Gherkin.

Previous parser/generator experiments were removed to keep the workflow simpler:

1. Write or update the Gherkin spec.
2. Write the BDD-style test manually using the testing API.
3. Add focused unit tests for supporting logic as needed.
4. Implement the behavior.
5. Run `npm run quality`.

This keeps ambiguity visible. If a Gherkin sentence is unclear, clarify the spec text and choose explicit testing API calls in the test.

## Adding New BDD Vocabulary

When a feature needs a new behavior-facing operation, add it to `src/testing/plugin-testing-api.ts`.

Good testing API methods describe observable behavior:

```ts
const modal = await api.plugin.fileTranscribe();
await modal.transcribeAll();
api.wrapper.expectStatus("transcribed");
api.transcription.expectNoRequest();
```

Avoid exposing implementation details:

```ts
api.plugin.callPrivateMethod();
api.transcriber.setInternalQueue();
api.wrapper.expectExactPrivateCacheShape();
```

The testing API should stay small. Add methods only when they make feature-level tests clearer.

## Required Gate

Before marking testing or implementation work complete, run:

```bash
npm run quality
```

Fix failures rather than bypassing the gate.
