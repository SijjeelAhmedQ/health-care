import { Button, Collapse, Empty, Segmented, Space, Tag, Timeline } from 'antd';
import { useState } from 'react';
import { Bug, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { uiActions } from '@/store/slices/uiSlice';
import { voiceActions } from '@/store/slices/voiceSlice';
import { FormRegistry } from '@/registry/formRegistry';
import { PageRegistry } from '@/registry/pageRegistry';
import type { DebugTrace, ExecutionStep } from '@/types/ai';
import { StatusTag } from '@/components/common';
import { AppModal } from '@/components/common/AppModal';

const stepColor: Record<ExecutionStep['status'], string> = { pending: 'gray', running: 'blue', done: 'green', skipped: 'gray', failed: 'red', awaiting_confirmation: 'orange' };

function TraceView({ trace }: { trace: DebugTrace }) {
  const pending = useAppSelector((s) => s.voice.pendingConfirmation);
  const active = FormRegistry.active();
  const page = trace.context?.currentPageId ? PageRegistry.get(trace.context.currentPageId) : undefined;
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <dl className="debug-kv">
        <dt>Raw transcript</dt><dd>“{trace.rawTranscript}”</dd>
        <dt>Normalized</dt><dd>“{trace.normalizedTranscript}”</dd>
        <dt>Provider</dt><dd>{trace.provider}</dd>
        <dt>Current page</dt><dd>{page ? `${page.title} (#${page.number}, ${page.id})` : '—'}</dd>
        <dt>Patient context</dt><dd>{trace.context?.currentPatientName ?? '—'}</dd>
        <dt>Current form</dt><dd>{active?.formId ?? trace.context?.openFormId ?? '—'}</dd>
        <dt>Confirmation required</dt><dd>{pending ? <Tag color="orange">yes — {pending.formTitle}</Tag> : 'no'}</dd>
        <dt>Duration</dt><dd>{trace.finishedAt ? `${trace.finishedAt - trace.startedAt} ms` : 'running…'}</dd>
        {trace.error && (<><dt>Error</dt><dd style={{ color: '#d64545' }}>{trace.error}</dd></>)}
      </dl>
      <Collapse
        size="small"
        defaultActiveKey={['commands', 'steps']}
        items={[
          { key: 'raw', label: 'Raw model output', children: <pre className="debug-block">{trace.rawModelOutput || '(none)'}</pre> },
          { key: 'commands', label: `AI commands (${trace.commands.length})`, children: <pre className="debug-block">{JSON.stringify(trace.commands, null, 2)}</pre> },
          {
            key: 'steps',
            label: `Execution steps (${trace.steps.length})`,
            children: (
              <Timeline
                items={trace.steps.map((s) => ({
                  color: stepColor[s.status],
                  children: (
                    <div style={{ fontSize: 13 }}>
                      <div className="flex items-center gap-2">
                        <code className="mono">{s.tool}</code>
                        <StatusTag status={s.status.replace('_', ' ')} />
                        {s.finishedAt && <span className="muted" style={{ fontSize: 11 }}>{s.finishedAt - s.startedAt} ms</span>}
                      </div>
                      <div className="muted" style={{ marginTop: 2 }}>{s.message}</div>
                      <pre className="debug-block" style={{ marginTop: 6, maxHeight: 120 }}>{JSON.stringify(s.command)}</pre>
                    </div>
                  ),
                }))}
              />
            ),
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
          { key: 'context', label: 'Context sent to model', children: <pre className="debug-block">{JSON.stringify(trace.context, null, 2)}</pre> },
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
      title="Voice Debug Panel"
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
      {view === 'current' && (voice.trace ? <TraceView trace={voice.trace} /> : <Empty description="No voice command processed yet. Speak or use the Voice Test Console." />)}
      {view === 'history' && (
        <Collapse
          size="small"
          items={voice.traceHistory.map((t, i) => ({
            key: `${t.startedAt}-${i}`,
            label: (
              <span>
                <span className="muted">{new Date(t.startedAt).toLocaleTimeString()}</span> — “{t.rawTranscript}” {t.error && <Tag color="red">error</Tag>}
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
          </dl>
          <Collapse size="small" items={[{ key: 'pages', label: 'Page registry', children: <pre className="debug-block" style={{ maxHeight: 400 }}>{PageRegistry.all().map((p) => `${String(p.number).padStart(2, ' ')}  ${p.id.padEnd(28)} ${p.path}`).join('\n')}</pre> }]} />
        </Space>
      )}
    </AppModal>
  );
}
