import { useState } from 'react';
import { Button, Input, Tag, Tooltip } from 'antd';
import { AlertCircle, Bug, Check, CheckCircle2, Keyboard, Loader2, Mic, MicOff, Send, Square, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { voiceActions, type VoiceStatus } from '@/store/slices/voiceSlice';
import { uiActions } from '@/store/slices/uiSlice';
import { getVoiceController } from '@/services/ai/voiceController';
import { aiConfig } from '@/services/ai/config';

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

const hints = ['Go to patient search', 'Open John Smith', 'Go to page 30 and add medication', 'Add Amoxicillin 500 mg twice daily for 7 days', 'Create an appointment for Ahmed tomorrow at 3 PM'];

export function VoiceAssistant() {
  const dispatch = useAppDispatch();
  const voice = useAppSelector((s) => s.voice);
  const [typed, setTyped] = useState('');
  const [showTyping, setShowTyping] = useState(false);
  const meta = statusMeta[voice.status];
  const busy = voice.status === 'processing' || voice.status === 'executing' || voice.status === 'transcribing';
  const controller = getVoiceController();

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
            <Mic size={16} color="#0f6e8c" />
            <span className="voice-panel-title">Voice Assistant</span>
            <Tag color={voice.llmProvider.startsWith('mock') ? 'default' : 'blue'} style={{ margin: 0, fontSize: 11 }}>
              {voice.llmProvider.startsWith('mock') ? 'Mock mode' : voice.llmProvider}
            </Tag>
            {aiConfig.enableDebugPanel && (
              <Tooltip title="Debug">
                <Button type="text" size="small" icon={<Bug size={14} />} onClick={() => dispatch(uiActions.setDebugPanelOpen(true))} aria-label="Open debug panel" />
              </Tooltip>
            )}
            <Button type="text" size="small" icon={<X size={16} />} onClick={() => dispatch(voiceActions.setPanelOpen(false))} aria-label="Close voice assistant" />
          </div>

          <div className="voice-panel-body">
            <div className="voice-status-row" style={{ color: meta.color }}>
              {voice.status === 'listening' ? (
                <span className="voice-waveform"><span /><span /><span /><span /><span /></span>
              ) : busy ? (
                <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              ) : voice.status === 'completed' ? (
                <CheckCircle2 size={16} />
              ) : voice.status === 'error' ? (
                <AlertCircle size={16} />
              ) : voice.status === 'confirmation_required' ? (
                <AlertCircle size={16} />
              ) : (
                <Mic size={16} />
              )}
              <span>{meta.label}</span>
              {voice.currentAction && <span className="muted" style={{ fontWeight: 400 }}>· {voice.currentAction}</span>}
            </div>

            {voice.interimTranscript || voice.transcript ? (
              <div className="voice-transcript">“{voice.interimTranscript || voice.transcript}”</div>
            ) : (
              <div className="voice-transcript placeholder">{voice.micSupported ? 'Tap the microphone and speak a command…' : 'Microphone not supported here — type a command below.'}</div>
            )}

            {voice.pendingSlot && voice.status !== 'error' && (
              <div className="voice-confirm-box" style={{ borderColor: '#b9dff0', background: '#eef7fb' }}>
                <strong>Question:</strong> {voice.pendingSlot.question}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Answer by voice or type below — e.g. “500 mg”.</div>
              </div>
            )}

            {voice.response && <div className="voice-response">{voice.error ?? voice.response}</div>}
            {voice.error && !voice.response && <div className="voice-response" style={{ color: '#d64545' }}>{voice.error}</div>}

            {voice.pendingConfirmation && (
              <div className="voice-confirm-box">
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{voice.pendingConfirmation.formTitle} — ready to save</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', marginBottom: 8 }}>
                  {voice.pendingConfirmation.summary.slice(0, 8).map((s) => (
                    <div key={s.label} style={{ display: 'contents' }}>
                      <span className="muted">{s.label}</span>
                      <span style={{ fontWeight: 500 }}>{s.value}</span>
                    </div>
                  ))}
                  {voice.pendingConfirmation.summary.length > 8 && <span className="muted">+{voice.pendingConfirmation.summary.length - 8} more</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Review the form, then confirm. Say “save it” or “cancel”.</div>
                <div className="flex gap-2">
                  <Button type="primary" size="small" icon={<Check size={14} />} onClick={() => void controller.handleTranscript('save it')}>
                    Save
                  </Button>
                  <Button size="small" onClick={() => void controller.handleTranscript('cancel')}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {voice.history.length === 0 && voice.status === 'idle' && (
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Try saying</div>
                <div className="voice-hint-chips">
                  {hints.map((h) => (
                    <Tag key={h} style={{ cursor: 'pointer', margin: 0 }} onClick={() => void controller.handleTranscript(h)}>
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
                disabled={busy}
                autoFocus
                aria-label="Type a voice command"
              />
            ) : (
              <>
                <Button
                  type="primary"
                  danger={voice.status === 'listening'}
                  icon={voice.status === 'listening' ? <Square size={14} /> : <Mic size={15} />}
                  onClick={() => controller.toggleListening()}
                  disabled={busy}
                >
                  {voice.status === 'listening' ? 'Stop' : 'Speak'}
                </Button>
                {(busy || voice.status === 'listening') && (
                  <Button icon={<X size={14} />} onClick={() => controller.cancel()}>
                    Cancel
                  </Button>
                )}
              </>
            )}
            <div style={{ flex: 1 }} />
            {voice.micSupported && (
              <Tooltip title={showTyping ? 'Use microphone' : 'Type instead'}>
                <Button type="text" icon={showTyping ? <Mic size={15} /> : <Keyboard size={15} />} onClick={() => setShowTyping((v) => !v)} aria-label="Toggle typing mode" />
              </Tooltip>
            )}
          </div>
        </div>
      )}

      <Tooltip title={voice.panelOpen ? 'Close assistant' : 'Voice assistant (Ctrl+Shift+V)'} placement="left">
        <button
          type="button"
          className={`voice-fab ${voice.status === 'listening' ? 'listening' : ''}`}
          onClick={() => {
            if (!voice.panelOpen) {
              dispatch(voiceActions.setPanelOpen(true));
              if (voice.micSupported && voice.status === 'idle') controller.startListening();
            } else if (voice.status === 'listening') controller.stopListening();
            else dispatch(voiceActions.setPanelOpen(false));
          }}
          aria-label="Voice assistant"
        >
          {voice.status === 'listening' ? <Square size={20} /> : voice.micSupported ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
      </Tooltip>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
