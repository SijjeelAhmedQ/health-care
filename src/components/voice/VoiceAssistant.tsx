import { useEffect, useState } from 'react';
import { Button, Input, Tag, Tooltip } from 'antd';
import { AlertCircle, Bug, Check, CheckCircle2, CircleHelp, Keyboard, Loader2, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { voiceActions, type VoiceStatus } from '@/store/slices/voiceSlice';
import { uiActions } from '@/store/slices/uiSlice';
import { getVoiceController } from '@/services/ai/voiceController';
import { aiConfig } from '@/services/ai/config';
import { getSpeakReplies, isSpeechSupported, setSpeakReplies, stopSpeaking } from '@/services/ai/speech';

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

export function VoiceAssistant() {
  const dispatch = useAppDispatch();
  const voice = useAppSelector((s) => s.voice);
  const [typed, setTyped] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  // Answers and questions are spoken unless the user mutes them.
  const [speakReplies, setSpeak] = useState(getSpeakReplies);
  const meta = statusMeta[voice.status];
  const busy = voice.status === 'processing' || voice.status === 'executing' || voice.status === 'transcribing';
  // The microphone switch is owned by the user (micActive) — not by the transcription lifecycle.
  const micOn = voice.micActive;
  const controller = getVoiceController();
  // A ticking clock while the assistant works, so a slow request never looks frozen.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!voice.busySince && voice.model.status !== 'loading' && voice.model.status !== 'warming') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [voice.busySince, voice.model.status]);
  const elapsed = voice.busySince ? Math.max(0, Math.round((now - voice.busySince) / 1000)) : 0;
  const preparingFor = (voice.model.status === 'loading' || voice.model.status === 'warming') && voice.model.since ? Math.round((now - voice.model.since) / 1000) : 0;
  // Say nothing about a warm-up that takes a moment; explain one that takes long.
  const showLoading = (voice.model.status === 'loading' && preparingFor >= 3) || (voice.model.status === 'warming' && preparingFor >= 8);
  const modelName = voice.llmProvider.split(':').slice(1).join(':') || 'the model';

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
            <span className="voice-panel-title">Assistant</span>
            {micOn && (
              <Tag color="red" style={{ margin: 0, fontSize: 11 }}>
                Mic on
              </Tag>
            )}
            <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
              {voice.llmProvider}
            </Tag>
            <Tooltip title="What the assistant can do" zIndex={TOOLTIP_Z}>
              <Button type="text" size="small" icon={<CircleHelp size={14} />} onClick={() => dispatch(voiceActions.setHelpOpen(true))} aria-label="What the assistant can do" />
            </Tooltip>
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
              {voice.currentAction && voice.currentAction !== meta.label && <span className="muted" style={{ fontWeight: 400 }}>· {voice.currentAction}</span>}
              {elapsed >= 2 && <span className="muted" style={{ fontWeight: 400 }}>· {elapsed} s</span>}
              {micOn && voice.status !== 'listening' && voice.status !== 'idle' && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· mic still on</span>}
            </div>

            {showLoading && (
              <div className="voice-model-note">
                {voice.model.status === 'loading'
                  ? `Loading ${modelName} into memory · ${preparingFor} s — this happens after starting the computer or switching models (about 1–2 minutes on this GPU). After that, requests take a few seconds.`
                  : `Preparing ${modelName} · ${preparingFor} s — it is reading the assistant's instructions again (after an app update this takes 1–2 minutes). After that, requests take a few seconds.`}
              </div>
            )}
            {voice.model.status === 'error' && <div className="voice-model-note is-error">The model could not be loaded: {voice.model.error}</div>}
            {voice.interimTranscript || voice.transcript ? (
              <div className="voice-transcript">“{voice.interimTranscript || voice.transcript}”</div>
            ) : (
              <div className="voice-transcript placeholder">{micOn ? 'Listening — speak whenever you are ready. The mic turns off after a 10 second pause.' : voice.micSupported ? 'Tap the microphone and ask in your own words…' : 'Microphone not supported here — type your request below.'}</div>
            )}

            {voice.pendingSlot && voice.status !== 'error' && (
              <div className="voice-confirm-box is-question">
                <strong>Question:</strong> {voice.pendingSlot.question}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Answer by voice or type below.</div>
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
                    ? 'This cannot be undone. Confirm here, or tell the assistant.'
                    : voice.pendingConfirmation.kind === 'inbox_file'
                      ? 'Confirm here, or tell the assistant.'
                      : 'Review the form, then confirm here or tell the assistant.'}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="primary"
                    danger={voice.pendingConfirmation.kind === 'delete'}
                    size="small"
                    icon={<Check size={14} />}
                    onClick={() => void controller.resolvePending(true)}
                  >
                    {voice.pendingConfirmation.kind === 'delete'
                      ? 'Delete'
                      : voice.pendingConfirmation.kind === 'inbox_file'
                        ? voice.pendingConfirmation.inboxFile === false
                          ? 'Yes, unfile'
                          : 'Yes, file'
                        : 'Save'}
                  </Button>
                  <Button size="small" onClick={() => void controller.resolvePending(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {voice.history.length === 0 && voice.status === 'idle' && !micOn && (
              <Button type="link" size="small" icon={<CircleHelp size={14} />} style={{ paddingInline: 0 }} onClick={() => dispatch(voiceActions.setHelpOpen(true))}>
                What can the assistant do?
              </Button>
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
                placeholder="Ask the assistant…"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onSearch={submitTyped}
                enterButton={<Send size={14} />}
                autoFocus
                aria-label="Type a request for the assistant"
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
