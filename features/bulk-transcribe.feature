Feature: Bulk transcribe
  Users can transcribe existing audio recordings in one action without inserting links into the active note.

  Scenario Outline: Transcribe all eligible recordings
    Given unwrapped audio exists at "Recordings/2025.m4a"
    And unwrapped audio exists at "Recordings/2026.m4a"
    When the user opens bulk transcribe from the <entry point>
    And the user starts bulk transcription
    Then transcription requests are sent for:
      | path                 |
      | Recordings/2025.m4a  |
      | Recordings/2026.m4a  |
    And voice note wrappers are created for:
      | path                 |
      | Recordings/2025.m4a  |
      | Recordings/2026.m4a  |
    And each wrapper uses a generated title
    And each wrapper contains the transcript returned for its recording
    And each wrapper status is "transcribed"
    And no hyperlink is inserted in the active editor
    And no transcription note is opened

    Examples:
      | entry point            |
      | ribbon button          |
      | command palette button |

  Scenario: Skip recordings that are already transcribed
    Given unwrapped audio exists at "Recordings/idea.m4a"
    And transcribed audio exists at "Recordings/done.m4a"
    When the user opens bulk transcribe from the ribbon button
    And the user starts bulk transcription
    Then a transcription request is sent for "Recordings/idea.m4a"
    And no transcription request is sent for "Recordings/done.m4a"
    And a voice note wrapper is created for "Recordings/idea.m4a"
    And no new voice note wrapper is created for "Recordings/done.m4a"

  Scenario: Create wrappers while bulk transcribing
    Given unwrapped audio exists at "Recordings/idea.m4a"
    When the user opens bulk transcribe from the ribbon button
    And the user starts bulk transcription
    Then a voice note wrapper is created for "Recordings/idea.m4a"
    And one voice note wrapper is created
    And one transcription request is sent
    And the wrapper status is "transcribed" for "Recordings/idea.m4a"
    And no hyperlink is inserted in the active editor
    And no transcription note is opened

  Scenario: Do nothing when there are no eligible recordings
    Given there are no matching recordings
    When the user opens bulk transcribe from the ribbon button
    And the user starts bulk transcription
    Then no transcription request is sent
    And no voice note wrappers are created
    And no hyperlink is inserted in the active editor
    And no transcription note is opened
    And an Obsidian notification is shown
