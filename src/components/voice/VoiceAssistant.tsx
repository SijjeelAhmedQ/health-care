import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Input, Tag, Tooltip } from 'antd';
import { AlertCircle, Bug, Check, CheckCircle2, Keyboard, Loader2, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { voiceActions, type VoiceStatus } from '@/store/slices/voiceSlice';
import { uiActions } from '@/store/slices/uiSlice';
import { getVoiceController } from '@/services/ai/voiceController';
import { aiConfig } from '@/services/ai/config';
import { getSpeakReplies, isSpeechSupported, setSpeakReplies, stopSpeaking } from '@/services/ai/speech';
import { PageRegistry } from '@/registry/pageRegistry';

const statusMeta: Record<VoiceStatus, { label: string; color: string }> = {
  idle: { label: 'Ready', color: '#5b6b7a' },
  listening: { label: 'Listening…', color: '#d64545' },
  transcribing: { label: 'Transcribing…', color: '#d98800' },
  processing: { label: 'Understanding…', color: '#d98800' },
  executing: { label: 'Executing…', color: '#0f6e8c' },
  confirmation_required: { label: 'Waiting for confirmation', color: '#b86e00' },
  completed: { label: 'Completed', color: '#0f9d58' },
  error: { label: 'Error', color: '#d64545' },
  cancelled: { label: 'Cancelled', color: '#5b6b7a' },
};

/** The panel sits above antd's default tooltip layer (1070), so its tooltips must sit higher still. */
const TOOLTIP_Z = 1300;

const hints = [
  'Select patient John Smith',
  'Open medications',
  'Add amoxicillin 500 mg twice daily for 7 days',
  'Add diagnosis hypertension',
  'Add task blood pressure monitoring due next Friday',
  'Set recall for review in 3 months',
  'Read the medication list',
  'Give me a summary of this patient',
  'Open summary and show me the diagnosis tab',
];

/** In the Inbox the assistant suggests Inbox commands. */
const inboxHints = ['Open the first record', 'File this', 'Next', 'Show Lab', 'Search blood test', 'Clear search', 'What can I say?'];

/** On the Patient page the assistant suggests patient commands. */
const patientHints = ['Add patient John Smith, date of birth January 10 1990', 'Find John Smith', 'Open the first result', "Change John Smith's phone number", 'Save patient'];

export function VoiceAssistant() {
  const dispatch = useAppDispatch();
  const voice = useAppSelector((s) => s.voice);
  const page = PageRegistry.matchPath(useLocation().pathname);
  const inInbox = page?.module === 'inbox';
  const inPatients = page?.id === 'patients';
  const [typed, setTyped] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  // Read-back commands ("read the medication list") are spoken unless the user mutes them.
  const [speakReplies, setSpeak] = useState(getSpeakReplies);
  const meta = statusMeta[voice.status];
  const busy = voice.status === 'processing' || voice.status === 'executing' || voice.status === 'transcribing';
  // The microphone switch is owned by the user (micActive) — not by the transcription lifecycle.
  const micOn = voice.micActive;
  const controller = getVoiceController();

  // Typing or changing the spoken-reply setting means the user is not talking: the mic goes off.
  const micOffForOtherInput = () => {
    if (controller.isMicActive) controller.stopListening();
  };

  const submitTyped = () => {
    if (!typed.trim()) return;
    void controller.handleTranscript(typed.trim());
    setTyped('');
  };

  return (
    <>
      {voice.panelOpen && (
        <div className="voice-panel" role="dialog" aria-label="Voice assistant">
          <div className="voice-panel-header">
            <Mic size={16} color={micOn ? '#d64545' : '#0f6e8c'} />
            <span className="voice-panel-title">Voice Assistant</span>
            {micOn && (
              <Tag color="red" style={{ margin: 0, fontSize: 11 }}>
                Mic on
              </Tag>
            )}
            <Tag color={voice.llmProvider.startsWith('mock') ? 'default' : 'blue'} style={{ margin: 0, fontSize: 11 }}>
              {voice.llmProvider.startsWith('mock') ? 'Mock mode' : voice.llmProvider}
            </Tag>
            {aiConfig.enableDebugPanel && (
              <Tooltip title="Debug" zIndex={TOOLTIP_Z}>
                <Button type="text" size="small" icon={<Bug size={14} />} onClick={() => dispatch(uiActions.setDebugPanelOpen(true))} aria-label="Open debug panel" />
              </Tooltip>
            )}
            <Button type="text" size="small" icon={<X size={16} />} onClick={() => dispatch(voiceActions.setPanelOpen(false))} aria-label="Close voice assistant" />
          </div>

          <div className="voice-panel-body">
            <div className="voice-status-row" style={{ color: meta.color }}>
              {voice.status === 'listening' || (micOn && voice.status === 'idle') ? (
                <span className="voice-waveform"><span /><span /><span /><span /><span /></span>
              ) : busy ? (
                <Loader2 size={16} className="spin" />
              ) : voice.status === 'completed' ? (
                <CheckCircle2 size={16} />
              ) : voice.status === 'error' ? (
                <AlertCircle size={16} />
              ) : voice.status === 'confirmation_required' ? (
                <AlertCircle size={16} />
              ) : (
                <Mic size={16} />
              )}
              <span>{micOn && voice.status === 'idle' ? 'Listening…' : meta.label}</span>
              {voice.currentAction && <span className="muted" style={{ fontWeight: 400 }}>· {voice.currentAction}</span>}
              {micOn && voice.status !== 'listening' && voice.status !== 'idle' && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· mic still on</span>}
            </div>

            {voice.interimTranscript || voice.transcript ? (
              <div className="voice-transcript">“{voice.interimTranscript || voice.transcript}”</div>
            ) : (
              <div className="voice-transcript placeholder">{micOn ? 'Listening — speak whenever you are ready. The mic turns off after a 10 second pause.' : voice.micSupported ? 'Tap the microphone and speak a command…' : 'Microphone not supported here — type a command below.'}</div>
            )}

            {voice.pendingSlot && voice.status !== 'error' && (
              <div className="voice-confirm-box is-question">
                <strong>Question:</strong> {voice.pendingSlot.question}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Answer by voice or type below — e.g. “500 mg”.</div>
              </div>
            )}

            {voice.response && <div className="voice-response">{voice.error ?? voice.response}</div>}
            {voice.error && !voice.response && <div className="voice-response" style={{ color: '#d64545' }}>{voice.error}</div>}

            {voice.pendingConfirmation && (
              <div className="voice-confirm-box">
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {voice.pendingConfirmation.kind === 'delete'
                    ? `${voice.pendingConfirmation.formTitle} — confirm deletion`
                    : voice.pendingConfirmation.kind === 'inbox_file'
                      ? voice.pendingConfirmation.formTitle
                      : `${voice.pendingConfirmation.formTitle} — ready to save`}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', marginBottom: 8 }}>
                  {voice.pendingConfirmation.summary.slice(0, 8).map((s) => (
                    <div key={s.label} style={{ display: 'contents' }}>
                      <span className="muted">{s.label}</span>
                      <span style={{ fontWeight: 500 }}>{s.value}</span>
                    </div>
                  ))}
                  {voice.pendingConfirmation.summary.length > 8 && <span className="muted">+{voice.pendingConfirmation.summary.length - 8} more</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  {voice.pendingConfirmation.kind === 'delete'
                    ? 'This cannot be undone. Say “yes, delete it” or “cancel”.'
                    : voice.pendingConfirmation.kind === 'inbox_file'
                      ? 'Say “yes” to confirm or “cancel”.'
                      : 'Review the form, then confirm. Say “save it” or “cancel”.'}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="primary"
                    danger={voice.pendingConfirmation.kind === 'delete'}
                    size="small"
                    icon={<Check size={14} />}
                    onClick={() => void controller.handleTranscript('yes')}
                  >
                    {voice.pendingConfirmation.kind === 'delete'
                      ? 'Delete'
                      : voice.pendingConfirmation.kind === 'inbox_file'
                        ? voice.pendingConfirmation.inboxFile === false
                          ? 'Yes, unfile'
                          : 'Yes, file'
                        : 'Save'}
                  </Button>
                  <Button size="small" onClick={() => void controller.handleTranscript('cancel')}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {voice.history.length === 0 && voice.status === 'idle' && !micOn && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Try saying</div>
                <div className="voice-hint-chips">
                  {(inInbox ? inboxHints : inPatients ? patientHints : hints).map((h) => (
                    <Tag key={h} className="voice-hint-chip" onClick={() => void controller.handleTranscript(h)}>
                      {h}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {voice.history.length > 0 && (
              <div className="voice-history">
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent</div>
                {voice.history.slice(0, 4).map((h) => (
                  <div key={h.id} className="voice-history-item">
                    <span style={{ color: h.status === 'error' ? '#d64545' : h.status === 'confirmation' ? '#b86e00' : '#0f9d58' }}>●</span>
                    <span>
                      {h.transcript && <b>“{h.transcript}” </b>}
                      <span>{h.response.split('\n')[0]}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="voice-panel-footer">
            {showTyping || !voice.micSupported ? (
              <Input.Search
                placeholder="Type a command…"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onSearch={submitTyped}
                enterButton={<Send size={14} />}
                autoFocus
                aria-label="Type a voice command"
              />
            ) : (
              <>
                <Button
                  type="primary"
                  danger={micOn}
                  icon={micOn ? <MicOff size={14} /> : <Mic size={15} />}
                  onClick={() => controller.toggleListening()}
                  disabled={!micOn && busy}
                  aria-pressed={micOn}
                >
                  {micOn ? 'Mic Off' : 'Speak'}
                </Button>
                {(busy || micOn) && (
                  <Button icon={<X size={14} />} onClick={() => controller.cancel()}>
                    Cancel
                  </Button>
                )}
              </>
            )}
            <div style={{ flex: 1 }} />
            {isSpeechSupported() && (
              <Tooltip title={speakReplies ? 'Spoken replies on — click to mute' : 'Spoken replies muted'} zIndex={TOOLTIP_Z}>
                <Button
                  type="text"
                  icon={speakReplies ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  onClick={() => {
                    micOffForOtherInput();
                    const next = !speakReplies;
                    setSpeak(next);
                    setSpeakReplies(next);
                    if (!next) stopSpeaking();
                  }}
                  aria-label={speakReplies ? 'Mute spoken replies' : 'Enable spoken replies'}
                  aria-pressed={speakReplies}
                />
              </Tooltip>
            )}
            {voice.micSupported && (
              <Tooltip title={showTyping ? 'Use microphone' : 'Type instead'} zIndex={TOOLTIP_Z}>
                <Button
                  type="text"
                  icon={showTyping ? <Mic size={15} /> : <Keyboard size={15} />}
                  onClick={() => {
                    if (!showTyping) micOffForOtherInput();
                    setShowTyping((v) => !v);
                  }}
                  aria-label="Toggle typing mode"
                />
              </Tooltip>
            )}
          </div>
        </div>
      )}

      <Tooltip title={micOn ? 'Turn microphone off' : 'Turn microphone on (Ctrl+Shift+V)'} placement="left" zIndex={TOOLTIP_Z}>
        <button
          type="button"
          className={`voice-fab ${micOn ? 'listening' : ''}`}
          onClick={() => {
            // Explicit user toggle.
            if (micOn) controller.stopListening();
            else if (voice.micSupported) controller.startListening();
            else dispatch(voiceActions.setPanelOpen(!voice.panelOpen));
          }}
          aria-label={micOn ? 'Turn microphone off' : 'Turn microphone on'}
          aria-pressed={micOn}
        >
          {micOn ? <MicOff size={22} /> : voice.micSupported ? <Mic size={22} /> : <Keyboard size={22} />}
        </button>
      </Tooltip>
    </>
  );
}
