Feature: File Transcribe
  Users can transcribe recordings from Obsidian without inserting links into the active editor.

  Scenario Outline: Transcribe all unwrapped recordings from File Transcribe
    Given unwrapped audio exists at "Recordings/2025.m4a"
    And unwrapped audio exists at "Recordings/2026.m4a"
    When the user opens File Transcribe from the <entry point>
    And the user transcribes all recordings
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

  Scenario: Transcribe all skips already transcribed recordings
    Given unwrapped audio exists at "Recordings/idea.m4a"
    And transcribed audio exists at "Recordings/done.m4a"
    When the user opens File Transcribe from the ribbon button
    And the user transcribes all recordings
    Then a transcription request is sent for "Recordings/idea.m4a"
    And no transcription request is sent for "Recordings/done.m4a"
    And a voice note wrapper is created for "Recordings/idea.m4a"
    And no new voice note wrapper is created for "Recordings/done.m4a"

  Scenario: Choose a single unwrapped recording
    Given unwrapped audio exists at "Recordings/idea.m4a"
    When the user opens File Transcribe from the command palette button
    And the user chooses "Recordings/idea.m4a"
    Then a transcription request is sent for "Recordings/idea.m4a"
    And a voice note wrapper is created for "Recordings/idea.m4a"
    And the wrapper uses a generated title for "Recordings/idea.m4a"
    And the wrapper contains the transcript returned for "Recordings/idea.m4a"
    And the wrapper status is "transcribed" for "Recordings/idea.m4a"
    And no hyperlink is inserted in the active editor
    And the transcription note is opened for "Recordings/idea.m4a"

  Scenario: Choose a single already transcribed recording
    Given transcribed audio exists at "Recordings/done.m4a"
    When the user opens File Transcribe from the command palette button
    And the user chooses "Recordings/done.m4a"
    Then no transcription request is sent
    And no new voice note wrapper is created for "Recordings/done.m4a"
    And no hyperlink is inserted in the active editor
    And the transcription note is opened for "Recordings/done.m4a"

  Scenario: Empty File Transcribe state
    Given there are no matching recordings
    When the user opens File Transcribe from the ribbon button
    And the user transcribes all recordings
    Then no transcription request is sent
    And no voice note wrappers are created
    And no hyperlink is inserted in the active editor
    And no transcription note is opened
    And an Obsidian notification is shown
