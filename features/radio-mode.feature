Feature: Radio mode
  Users can record a short voice note from the active editor and insert the resulting text into the note.

  Scenario: Insert a radio mode transcription
    Given the active note is open
    And the user has configured an OpenRouter API key
    When the user starts radio mode
    And the user records audio
    And the user selects "Insert"
    Then the recording is saved as an attachment for the active note
    And an audio transcription request is sent for the recording
    And the returned transcript is inserted into the active editor
    And no summary request is sent

  Scenario: Insert a radio mode transcription with a summary
    Given the active note is open
    And the user has configured an OpenRouter API key
    When the user starts radio mode
    And the user records audio
    And the user selects "Summarize"
    Then the recording is saved as an attachment for the active note
    And an audio transcription request is sent for the recording
    And a chat completion request is sent to summarize the transcript
    And the transcript and summary are inserted into the active editor

  Scenario: Discard a radio mode recording
    Given the active note is open
    And the user has configured an OpenRouter API key
    When the user starts radio mode
    And the user records audio
    And the user closes radio mode
    And the user confirms the discard
    Then no recording attachment is saved
    And no transcription request is sent
    And no text is inserted into the active editor

  Scenario: Report unsupported radio mode devices
    Given the active note is open
    And the user has configured an OpenRouter API key
    And the device cannot record supported audio
    When the user starts radio mode
    Then radio mode closes
    And an Obsidian notification is shown
    And no text is inserted into the active editor
