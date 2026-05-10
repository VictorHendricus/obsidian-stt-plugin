Feature: Bulk recording transcription

  Scenario: User bulk transcribes unwrapped recordings
    Given the vault contains an unwrapped audio file "Recordings/idea.m4a"
    When the user selects the bulk transcribe recordings ribbon button
    Then a voice note wrapper file is created
    And the audio file is transcribed
    And the wrapper status is "transcribed"
    And no hyperlink is inserted into the active editor
    And no transcription note is opened

  Scenario: User skips recordings that are already transcribed
    Given the vault contains an audio file "Recordings/idea.m4a" with a wrapper status of "transcribed"
    When the user selects the bulk transcribe recordings ribbon button
    Then no voice note wrapper file is created
    And no transcription request is sent
