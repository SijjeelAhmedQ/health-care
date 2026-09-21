import { useState } from 'react';
import { Alert, Button, Card, Col, Divider, Form, Input, Row, Select, Space, Switch, Tag, Timeline, message } from 'antd';
import { Bug, Play, RotateCcw, Save, Sparkles, Mic } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/common';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { getVoiceController } from '@/services/ai/voiceController';
import { effectiveConfig, getAIOverride, setAIOverride, type AIOverride } from '@/services/ai/config';
import { interpret, normalizeTranscript, splitClauses } from '@/services/ai/ruleBasedInterpreter';
import { translateUrdu } from '@/services/ai/urdu/translator';
import { validateCommands } from '@/services/ai/commandParser';
import { buildSystemPrompt } from '@/services/ai/prompt';
import { PageRegistry } from '@/registry/pageRegistry';
import { FieldRegistry } from '@/registry/fieldRegistry';

const scenarios: Array<{ title: string; steps: string[] }> = [
  { title: 'Navigate to distant page', steps: ['Go to patient search', 'Go to page 30', 'Open user management', 'Go back'] },
  { title: 'Open patient and section', steps: ['Open John Smith', 'Go to medications', 'Open allergies', 'Open insurance'] },
  { title: 'Multi-step: page + form + fill + confirm', steps: ['Go to page 30 and add medication', 'Amoxicillin 500 mg orally twice daily for seven days', 'Save it'] },
  { title: 'Slot filling (missing info)', steps: ['Open Ahmed Khan', 'Add medication', 'Lisinopril', '10 mg', 'once daily', 'cancel'] },
  { title: 'Appointment by voice', steps: ['Create an appointment for Ahmed Khan with Dr Sarah Ahmed tomorrow at 3 PM for blood pressure review', 'Yes, save it'] },
  { title: 'Register patient', steps: ['Add patient Bilal Hussain, male, 32 years old, phone 512 555 0199', 'Set email to bilal@example.com', 'Cancel'] },
  { title: 'Error handling', steps: ['Go to page 999', 'Open the flux capacitor', 'Save it'] },
  { title: 'Roman Urdu: page + dawai + confirm', steps: ['page number tees par jao or ek dawai add karo amoxicillin 500 mg twice daily paanch dino ke liay', 'haan save karo'] },
  { title: 'Roman Urdu: mareez, appointment, cancel', steps: ['mareez ahmed khan kholo', 'ahmed khan ke liye dr sarah ke saath kal shaam 3 baje appointment banao blood pressure ke liye', 'rehne do'] },
  { title: 'اردو: صفحہ، دوائی، محفوظ', steps: ['پیج نمبر تیس پر جاؤ اور ایک دوائی ایڈ کرو اموکسیسلن 500 ملی گرام دن میں دو بار پانچ دن کے لیے', 'جی ہاں محفوظ کرو'] },
  { title: 'اردو: مریض اور الرجی', steps: ['مریض جان سمتھ کھولو', 'الرجیز دکھاؤ', 'پینسلن کی الرجی ایڈ کرو شدید', 'واپس جاؤ'] },
];

export default function VoiceConsolePage() {
  const dispatch = useAppDispatch();
  const voice = useAppSelector((s) => s.voice);
  const controller = getVoiceController();
  const [input, setInput] = useState('Go to page 30 and add medication');
  const [preview, setPreview] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [override, setOverride] = useState<AIOverride>(getAIOverride());
  const cfg = effectiveConfig();

  const run = async (text: string) => {
    setRunning(true);
    await controller.handleTranscript(text);
    setRunning(false);
  };

  const runScenario = async (steps: string[]) => {
    setRunning(true);
    for (const step of steps) {
      await controller.handleTranscript(step);
      await new Promise((r) => setTimeout(r, 900));
    }
    setRunning(false);
  };

  const previewInterpretation = () => {
    const ctx = controller.buildContext();
    const normalized = normalizeTranscript(input);
    const urdu = translateUrdu(input);
    const cmds = interpret(input, ctx);
    try {
      validateCommands(cmds);
      setPreview(JSON.stringify({ language: urdu.language, ...(urdu.detected ? { translated: urdu.text } : {}), normalized, clauses: splitClauses(normalized), commands: cmds, schemaValid: true }, null, 2));
    } catch (e) {
      setPreview(JSON.stringify({ normalized, commands: cmds, schemaValid: false, error: (e as Error).message }, null, 2));
    }
  };

  const saveOverride = () => {
    setAIOverride(override);
    controller.reconfigure();
    message.success('AI runtime updated');
  };

  return (
    <>
      <PageHeader title="Voice Test Console" subtitle="Simulate STT output and exercise the full interpreter → executor → confirmation pipeline without a microphone or model" actions={<><Button icon={<Bug size={15} />} onClick={() => dispatch(uiActions.setDebugPanelOpen(true))}>Debug Panel</Button><Button icon={<Mic size={15} />} onClick={() => controller.startListening()} disabled={!voice.micSupported}>Use Microphone</Button></>} />
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message={<span>Mode: <Tag color={cfg.mode === 'mock' ? 'default' : 'blue'}>{cfg.mode}</Tag> LLM: <b>{voice.llmProvider}</b> · STT: <b>{voice.sttProvider}</b></span>} description="In mock mode a deterministic rule-based interpreter stands in for Qwen 3.5. Everything downstream (page registry, form registry, confirmation boundary) is the real production path." />
      <Row gutter={20}>
        <Col xs={24} lg={14}>
          <SectionCard title="Simulated transcript">
            <Input.TextArea rows={3} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type what the user would say… (English, Roman Urdu ya اردو)" onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); void run(input); } }} />
            <Space style={{ marginTop: 12 }} wrap>
              <Button type="primary" icon={<Play size={15} />} loading={running} onClick={() => void run(input)}>Run through pipeline</Button>
              <Button icon={<Sparkles size={15} />} onClick={previewInterpretation}>Preview interpretation only</Button>
              <Button icon={<RotateCcw size={15} />} onClick={() => { setPreview(''); }}>Clear</Button>
            </Space>
            {preview && <pre className="debug-block" style={{ marginTop: 12, maxHeight: 320 }}>{preview}</pre>}
          </SectionCard>
          <SectionCard title="Last result">
            <dl className="debug-kv">
              <dt>Status</dt><dd><Tag>{voice.status}</Tag></dd>
              <dt>Transcript</dt><dd>“{voice.transcript}”</dd>
              <dt>Response</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{voice.error ?? voice.response ?? '—'}</dd>
              <dt>Commands</dt><dd><pre className="debug-block" style={{ maxHeight: 160 }}>{JSON.stringify(voice.commands, null, 2)}</pre></dd>
              <dt>Pending confirmation</dt><dd>{voice.pendingConfirmation ? <Tag color="orange">{voice.pendingConfirmation.formTitle} — say “save it” or “cancel”</Tag> : 'none'}</dd>
              <dt>Pending question</dt><dd>{voice.pendingSlot ? `${voice.pendingSlot.question} (${voice.pendingSlot.formId}.${voice.pendingSlot.field})` : 'none'}</dd>
            </dl>
          </SectionCard>
          <SectionCard title="Conversation history">
            {voice.history.length ? <Timeline items={voice.history.slice(0, 12).map((h) => ({ color: h.status === 'error' ? 'red' : h.status === 'confirmation' ? 'orange' : h.status === 'cancelled' ? 'gray' : 'green', children: <div style={{ fontSize: 13 }}>{h.transcript && <div><b>You:</b> “{h.transcript}”</div>}<div className="text-secondary"><b>Assistant:</b> {h.response}</div></div> }))} /> : <span className="muted">No commands yet</span>}
          </SectionCard>
        </Col>
        <Col xs={24} lg={10}>
          <SectionCard title="Scenarios">
            {scenarios.map((s) => (
              <div key={s.title} style={{ marginBottom: 12, padding: 12, border: '1px solid var(--color-border)', borderRadius: 10 }}>
                <div className="flex justify-between items-center" style={{ marginBottom: 6 }}><strong style={{ fontSize: 13 }}>{s.title}</strong><Button size="small" icon={<Play size={13} />} disabled={running} onClick={() => void runScenario(s.steps)}>Run</Button></div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#5b6b7a' }}>{s.steps.map((st) => <li key={st} style={{ cursor: 'pointer' }} onClick={() => setInput(st)}>{st}</li>)}</ol>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="AI runtime override (persisted locally)">
            <Form layout="vertical" size="small">
              <Form.Item label="Mode"><Select value={override.mode ?? cfg.mode} onChange={(v) => setOverride({ ...override, mode: v })} options={[{ value: 'mock', label: 'mock — rule-based interpreter' }, { value: 'local', label: 'local — Qwen 3.5 via runtime' }]} /></Form.Item>
              <Form.Item label="LLM provider"><Select value={override.llmProvider ?? cfg.llm.provider} onChange={(v) => setOverride({ ...override, llmProvider: v })} options={['ollama', 'openai-compatible', 'http', 'mock'].map((v) => ({ value: v, label: v }))} /></Form.Item>
              <Form.Item label="LLM endpoint"><Input value={override.llmApiUrl ?? cfg.llm.apiUrl} onChange={(e) => setOverride({ ...override, llmApiUrl: e.target.value })} /></Form.Item>
              <Form.Item label="Model"><Input value={override.llmModel ?? cfg.llm.model} onChange={(e) => setOverride({ ...override, llmModel: e.target.value })} /></Form.Item>
              <Form.Item label="STT provider"><Select value={override.sttProvider ?? cfg.stt.provider} onChange={(v) => setOverride({ ...override, sttProvider: v })} options={[{ value: 'browser', label: 'browser — Web Speech API' }, { value: 'http', label: 'http — omi-med-stt via python bridge' }, { value: 'mock', label: 'mock' }]} /></Form.Item>
              <Form.Item label="STT language (browser)"><Select value={override.sttLanguage ?? cfg.stt.language} onChange={(v) => setOverride({ ...override, sttLanguage: v })} options={[{ value: 'en-US', label: 'English (US)' }, { value: 'en-GB', label: 'English (UK)' }, { value: 'en-IN', label: 'English (India / Pakistan accent)' }, { value: 'ur-PK', label: 'اردو — Urdu (Pakistan)' }, { value: 'hi-IN', label: 'हिन्दी — Hindi (India)' }]} /></Form.Item>
              <Form.Item label="STT endpoint"><Input value={override.sttApiUrl ?? cfg.stt.apiUrl} onChange={(e) => setOverride({ ...override, sttApiUrl: e.target.value })} /></Form.Item>
              <Space><Button type="primary" icon={<Save size={14} />} onClick={saveOverride}>Apply</Button><Button onClick={() => { setAIOverride({}); setOverride({}); controller.reconfigure(); message.success('Reset to .env configuration'); }}>Reset to .env</Button><Switch checkedChildren="fallback on" unCheckedChildren="fallback off" checked={cfg.fallbackToRules} disabled /></Space>
            </Form>
          </SectionCard>
          <SectionCard title="Registry summary">
            <dl className="debug-kv"><dt>Pages</dt><dd>{PageRegistry.all().length}</dd><dt>Voice forms</dt><dd>{FieldRegistry.forms().map((f) => f.id).join(', ')}</dd><dt>Fields</dt><dd>{FieldRegistry.forms().reduce((n, f) => n + f.fields.length, 0)}</dd></dl>
            <Divider style={{ margin: '12px 0' }} />
            <Card size="small" title="System prompt sent to Qwen (preview)"><pre className="debug-block" style={{ maxHeight: 220 }}>{buildSystemPrompt(controller.buildContext()).slice(0, 2400)}…</pre></Card>
          </SectionCard>
        </Col>
      </Row>
    </>
  );
}
