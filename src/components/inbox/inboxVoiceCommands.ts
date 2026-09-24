/**
 * The Inbox voice command reference — what the help sheet shows and what
 * "what can I say?" opens. Every phrase here is checked against the real
 * interpreter by a test, so the list can never promise a command that does
 * not work.
 */
export interface VoiceCommandExample {
  say: string;
  does: string;
}

export interface VoiceCommandGroup {
  id: 'patient' | 'inbox' | 'search' | 'records' | 'filing' | 'voice';
  title: string;
  hint: string;
  /** The page the phrases are spoken on (the patient list, or the Inbox). */
  context: 'patients' | 'inbox';
  commands: VoiceCommandExample[];
}

export const inboxVoiceCommandGroups: VoiceCommandGroup[] = [
  {
    id: 'patient',
    title: 'Patient',
    hint: 'Required after every sign-in — nothing patient-specific runs without one.',
    context: 'patients',
    commands: [
      { say: 'Search patient John Smith', does: 'Find patients by name' },
      { say: 'Find John Smith', does: 'Same, without saying "patient"' },
      { say: 'Search patient with MRN 102934', does: 'Find by MRN' },
      { say: 'Open first patient', does: 'Select the first match' },
      { say: 'Open patient', does: 'Select the only match' },
      { say: 'Select John Smith', does: 'Select by name' },
    ],
  },
  {
    id: 'inbox',
    title: 'Inbox',
    hint: 'Opened by voice, the Inbox shows the selected patient’s items.',
    context: 'inbox',
    commands: [
      { say: 'Open Inbox', does: 'Open the Inbox' },
      { say: 'Show all Inbox items', does: 'Every category' },
      { say: 'Show Lab', does: 'Lab results' },
      { say: 'Show Radiology', does: 'Radiology reports' },
      { say: 'Show Referrals', does: 'Referrals' },
      { say: 'Show Discharge Summary', does: 'Discharge summaries' },
      { say: 'Show this patient’s items', does: 'Only the selected patient' },
      { say: 'Show all patients', does: 'Every patient again' },
    ],
  },
  {
    id: 'search',
    title: 'Search',
    hint: 'Searches patient, test or subject, sender, NHI and date.',
    context: 'inbox',
    commands: [
      { say: 'Search blood test', does: 'Lab results mentioning blood' },
      { say: 'Search MRI', does: 'Radiology: MRI' },
      { say: 'Search for cardiology referral', does: 'Referrals: cardiology' },
      { say: 'Search discharge summary', does: 'Discharge summaries' },
      { say: 'Clear search', does: 'Show everything again' },
    ],
  },
  {
    id: 'records',
    title: 'Records',
    hint: 'Numbers follow the list on screen — they appear beside each row while the mic is on.',
    context: 'inbox',
    commands: [
      { say: 'Open first record', does: 'Open row 1' },
      { say: 'Open the second referral', does: 'Second referral in the list' },
      { say: 'Open record number three', does: 'Open row 3' },
      { say: 'Next', does: 'Open the next record' },
      { say: 'Open previous record', does: 'Open the one before' },
      { say: 'Open this record', does: 'The ticked record' },
      { say: 'Close this record', does: 'Back to the list' },
      { say: 'Select this patient', does: 'Make its patient the selected one' },
    ],
  },
  {
    id: 'filing',
    title: 'Filing',
    hint: 'Only for the selected patient’s records. Asks “File this record?” first unless you turn that off.',
    context: 'inbox',
    commands: [
      { say: 'File this', does: 'File the open record' },
      { say: 'File first record', does: 'File row 1' },
      { say: 'Mark this as filed', does: 'Same as “file this”' },
      { say: 'Unfile this', does: 'Back to unfiled' },
      { say: 'Remove this from filed', does: 'Same as “unfile this”' },
      { say: 'Unfile second record', does: 'Unfile row 2' },
      { say: 'Yes', does: 'Confirm' },
      { say: 'Cancel', does: 'Keep it as it was' },
    ],
  },
  {
    id: 'voice',
    title: 'Voice',
    hint: 'The microphone stays on in the Inbox until you turn it off.',
    context: 'inbox',
    commands: [
      { say: 'Stop listening', does: 'Microphone off' },
      { say: 'Mic off', does: 'Microphone off' },
      { say: 'Turn off microphone', does: 'Microphone off' },
      { say: 'Cancel voice', does: 'Microphone off' },
      { say: 'What can I say?', does: 'This list' },
    ],
  },
];
