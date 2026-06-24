Feature: Recording wrappers
  Users can create voice note wrappers for recordings that do not already have one.

  Scenario: Create missing recording wrappers
    Given unwrapped audio exists at "Recordings/idea.m4a"
    When the user creates missing recording wrappers
    Then a voice note wrapper is created for "Recordings/idea.m4a"
    And one voice note wrapper is created
    And the wrapper status is "raw" for "Recordings/idea.m4a"
    And no hyperlink is inserted in the active editor
    And no transcription note is opened

  Scenario: Skip recordings that already have wrappers
    Given wrapped audio exists at "Recordings/idea.m4a"
    When the user creates missing recording wrappers
    Then no voice note wrappers are created

  Scenario: Transcribe all from the default File Transcribe entry point
    Given unwrapped audio exists at "Recordings/idea.m4a"
    When the user opens File Transcribe
    And the user transcribes all recordings
    Then a voice note wrapper is created for "Recordings/idea.m4a"
    And one voice note wrapper is created
    And one transcription request is sent
    And the wrapper status is "transcribed" for "Recordings/idea.m4a"
    And no hyperlink is inserted in the active editor
    And no transcription note is opened

  Scenario: Skip recordings that are already transcribed
    Given transcribed audio exists at "Recordings/idea.m4a"
    When the user opens File Transcribe
    And the user transcribes all recordings
    Then no voice note wrappers are created
    And no transcription request is sent
