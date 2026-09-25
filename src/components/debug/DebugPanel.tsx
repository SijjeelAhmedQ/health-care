import { Button, Collapse, Empty, Segmented, Space, Tag, Timeline } from 'antd';
import { useState } from 'react';
import { Bug, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { FormRegistry } from '@/registry/formRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import type { AgentStep, DebugTrace } from '@/types/ai';
import { getVoiceController } from '@/services/ai/voiceController';
import { StatusTag } from '@/components/common';
import { AppModal } from '@/components/common/AppModal';

function stepColor(step: AgentStep) {
  if (!step.finishedAt) return 'blue';
  if (step.type === 'model') return step.error ? 'red' : 'purple';
  if (!step.result) return 'gray';
  if (step.result.awaitUser) return 'orange';
  return step.result.ok ? 'green' : 'red';
}

function StepView({ step }: { step: AgentStep }) {
  const ms = step.finishedAt ? <span className="muted" style={{ fontSize: 11 }}>{step.finishedAt - step.startedAt} ms</span> : <span className="muted">running…</span>;
  if (step.type === 'model') {
    return (
      <div style={{ fontSize: 13 }}>
        <div className="flex items-center gap-2">
          <strong>Model</strong>
          {step.toolCalls?.length ? <Tag color="purple">{step.toolCalls.length} tool call{step.toolCalls.length === 1 ? '' : 's'}</Tag> : step.finishedAt && !step.error ? <Tag>reply</Tag> : null}
          {ms}
        </div>
        {step.error && <div style={{ color: '#d64545' }}>{step.error}</div>}
        {step.content && <div className="muted" style={{ marginTop: 2 }}>{step.content}</div>}
        {step.toolCalls?.map((c, i) => (
          <pre key={i} className="debug-block" style={{ marginTop: 6, maxHeight: 160 }}>{`${c.name}(${JSON.stringify(c.arguments, null, 2)})`}</pre>
        ))}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 13 }}>
      <div className="flex items-center gap-2">
        <code className="mono">{step.call.name}</code>
        {step.result && <StatusTag status={step.result.awaitUser ? 'waiting for user' : step.result.ok ? 'done' : 'failed'} />}
        {ms}
      </div>
      {step.result && <div className="muted" style={{ marginTop: 2 }}>{step.result.message}</div>}
      {step.result?.data !== undefined && <pre className="debug-block" style={{ marginTop: 6, maxHeight: 160 }}>{JSON.stringify(step.result.data, null, 2)}</pre>}
    </div>
  );
}

function TraceView({ trace }: { trace: DebugTrace }) {
  const pending = useAppSelector((s) => s.voice.pendingConfirmation);
  const toolCalls = trace.steps.filter((s) => s.type === 'tool').length;
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <dl className="debug-kv">
        <dt>Said</dt><dd>“{trace.transcript}”</dd>
        <dt>Model</dt><dd>{trace.provider}</dd>
        <dt>Reply</dt><dd>{trace.reply ?? '—'}</dd>
        <dt>Confirmation pending</dt><dd>{pending ? <Tag color="orange">yes — {pending.formTitle}</Tag> : 'no'}</dd>
        <dt>Duration</dt><dd>{trace.finishedAt ? `${trace.finishedAt - trace.startedAt} ms` : 'running…'}</dd>
        {trace.error && (<><dt>Error</dt><dd style={{ color: '#d64545' }}>{trace.error}</dd></>)}
      </dl>
      <Collapse
        size="small"
        defaultActiveKey={['steps']}
        items={[
          {
            key: 'steps',
            label: `Agent steps (${trace.steps.length - toolCalls} model, ${toolCalls} tool)`,
            children: <Timeline items={trace.steps.map((s) => ({ color: stepColor(s), children: <StepView step={s} /> }))} />,
          },
          {
            key: 'fields',
            label: `Fields modified (${trace.fieldsModified.length})`,
            children: trace.fieldsModified.length ? (
              <dl className="debug-kv">
                {trace.fieldsModified.map((f, i) => (
                  <div key={i} style={{ display: 'contents' }}>
                    <dt>{f.formId}.{f.field}</dt><dd>{f.value || <span className="muted">(cleared)</span>}</dd>
                  </div>
                ))}
              </dl>
            ) : <span className="muted">No fields modified</span>,
          },
          { key: 'context', label: 'Message sent to the model', children: <pre className="debug-block">{trace.context}</pre> },
        ]}
      />
    </Space>
  );
}

export function DebugPanel() {
  const open = useAppSelector((s) => s.ui.debugPanelOpen);
  const voice = useAppSelector((s) => s.voice);
  const nav = useAppSelector((s) => s.navigation);
  const dispatch = useAppDispatch();
  const [view, setView] = useState<'current' | 'history' | 'registry'>('current');

  return (
    <AppModal
      title="Assistant Debug Panel"
      description={
        <span className="flex items-center gap-2 wrap">
          <Tag color="blue" className="tag-plain">STT: {voice.sttProvider}</Tag>
          <Tag color="purple" className="tag-plain">LLM: {voice.llmProvider}</Tag>
          <Tag className="tag-plain">{voice.status}</Tag>
        </span>
      }
      icon={<Bug size={18} />}
      open={open}
      onClose={() => dispatch(uiActions.setDebugPanelOpen(false))}
      size="xl"
      footer={
        <>
          <Button icon={<Trash2 size={14} />} onClick={() => dispatch(voiceActions.clearHistory())}>Clear history</Button>
          <Button type="primary" onClick={() => dispatch(uiActions.setDebugPanelOpen(false))}>Close</Button>
        </>
      }
    >
      <Segmented block value={view} onChange={(v) => setView(v as typeof view)} options={[{ label: 'Current', value: 'current' }, { label: `History (${voice.traceHistory.length})`, value: 'history' }, { label: 'Registries', value: 'registry' }]} style={{ marginBottom: 16 }} />
      {view === 'current' && (voice.trace ? <TraceView trace={voice.trace} /> : <Empty description="Nothing asked yet. Speak or type to the assistant." />)}
      {view === 'history' && (
        <Collapse
          size="small"
          items={voice.traceHistory.map((t, i) => ({
            key: `${t.startedAt}-${i}`,
            label: (
              <span>
                <span className="muted">{new Date(t.startedAt).toLocaleTimeString()}</span> — “{t.transcript}” {t.error && <Tag color="red">error</Tag>}
              </span>
            ),
            children: <TraceView trace={t} />,
          }))}
        />
      )}
      {view === 'registry' && (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <dl className="debug-kv">
            <dt>Current page</dt><dd>{nav.currentPageId ?? '—'} <span className="muted">{nav.currentPath}</span></dd>
            <dt>Open form</dt><dd>{FormRegistry.active()?.formId ?? nav.openFormId ?? '—'}</dd>
            <dt>Mounted forms</dt><dd>{FormRegistry.mounted().map((c) => c.formId).join(', ') || '—'}</dd>
            <dt>Pending slot</dt><dd>{voice.pendingSlot ? `${voice.pendingSlot.formId}.${voice.pendingSlot.field}` : '—'}</dd>
            <dt>Registered pages</dt><dd>{PageRegistry.all().length}</dd>
            <dt>Tools</dt><dd>{getVoiceController().tools.map((t) => t.name).join(', ')}</dd>
          </dl>
          <Collapse size="small" items={[{ key: 'pages', label: 'Page registry', children: <pre className="debug-block" style={{ maxHeight: 400 }}>{PageRegistry.all().map((p) => `${String(p.number).padStart(2, ' ')}  ${p.id.padEnd(28)} ${p.path}`).join('\n')}</pre> }]} />
        </Space>
      )}
    </AppModal>
  );
}
