Feature: Bulk recording transcription

    Scenario Outline: User bulk transcribes all unwrapped recordings from a bulk transcribe entry point
        Given the vault contains unwrapped audio files:
            | path                |
            | Recordings/2025.m4a |
            | Recordings/2026.m4a |
        When the user selects the bulk transcribe recordings <entry point>
        Then transcription requests are sent for:
            | path                |
            | Recordings/2025.m4a |
            | Recordings/2026.m4a |
        And voice note wrapper files are created for:
            | path                |
            | Recordings/2025.m4a |
            | Recordings/2026.m4a |
        And each created wrapper contains a generated title
        And each created wrapper contains the transcript returned for its recording
        And each created wrapper status is "transcribed"
        And no hyperlink is inserted into the active editor
        And no transcription note is opened

        Examples:
            | entry point            |
            | ribbon button          |
            | command palette button |

    Scenario: User bulk transcribes unwrapped recordings and skips already transcribed recordings
        Given the vault contains an unwrapped audio file "Recordings/idea.m4a"
        And the vault contains an audio file "Recordings/done.m4a" with a wrapper status of "transcribed"
        When the user selects the bulk transcribe recordings ribbon button
        Then a transcription request is sent for "Recordings/idea.m4a"
        And no transcription request is sent for "Recordings/done.m4a"
        And a voice note wrapper file is created for "Recordings/idea.m4a"
        And no new voice note wrapper file is created for "Recordings/done.m4a"

    Scenario: User bulk transcribes when there are no unwrapped recordings
        Given the vault contains no unwrapped audio files
        When the user selects the bulk transcribe recordings ribbon button
        Then no transcription request is sent
        And no voice note wrapper file is created
        And no hyperlink is inserted into the active editor
        And no transcription note is opened
        And obsidian notification pop-up is emited