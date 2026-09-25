import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Collapse, Input, InputNumber, Radio, Select, Slider, Space, Switch, Tag, Tooltip, message } from 'antd';
import { AudioLines, BrainCircuit, CheckCircle2, CircleAlert, FlaskConical, Loader2, RefreshCw, RotateCcw, Save, Server } from 'lucide-react';
import { useAppSelector } from '@/store';
import { PageHeader, SectionCard } from '@/components/common';
import { aiConfig, bridgeHttpUrl, clearAIOverride, effectiveConfig, getAIOverride, setAIOverride, type AIConfig, type LLMProviderKind } from '@/services/ai/config';
import { listModels, testModel, unloadOllamaModel, type ModelInfo, type ModelTestResult } from '@/services/ai/modelCatalog';
import { getSttConfig, saveSttConfig, type SttConfig, type SttSettings } from '@/services/ai/sttConfig';
import { getVoiceController } from '@/services/ai/voiceController';
import { getCompute, switchCompute, type ComputeMode, type ComputeStatus, type RemoteSpeech } from '@/services/ai/compute';

const RUNTIMES: Array<{ value: LLMProviderKind; label: string; hint: string; defaultUrl: string }> = [
  { value: 'ollama', label: 'Ollama', hint: 'Models you pull with `ollama pull …` appear here.', defaultUrl: 'http://127.0.0.1:11434' },
  { value: 'openai-compatible', label: 'OpenAI-compatible server', hint: 'llama.cpp server, LM Studio, mlx_lm.server, vLLM.', defaultUrl: 'http://127.0.0.1:8080' },
  { value: 'bridge', label: 'Python bridge', hint: "Uses the bridge's own model runtime (python/.env).", defaultUrl: 'http://127.0.0.1:8765' },
];

const gb = (bytes?: number) => (bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : undefined);
const REFRESH_MS = 15000;

/**
 * Configuration of the AI models.
 *
 * The language model: every model the chosen runtime has, read live (a model
 * pulled into Ollama shows up here on its own), with whether it can call tools
 * — the assistant needs that. The speech model: every Omi Med STT build and
 * parakeet.cpp backend the bridge can use on this machine.
 */
export default function ConfigurationPage() {
  return (
    <div className="page">
      <PageHeader title="Configuration" subtitle="Choose the models the assistant runs on. Changes apply at once; nothing needs a restart." />
      <ComputeSection />
      <div className="config-grid">
        <LanguageModelSection />
        <SpeechModelSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- where the AI runs

/**
 * The top-level switch: both models — speech recognition and the language model — on this computer,
 * or both on a remote GPU (a Kaggle T4 running python/kaggle/careflow_gpu_server.py behind a tunnel).
 */
function ComputeSection() {
  const [status, setStatus] = useState<ComputeStatus | null>(null);
  const [mode, setMode] = useState<ComputeMode>('local');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [speech, setSpeech] = useState<RemoteSpeech>('whisper');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const revision = useAppSelector((s) => s.ui.aiConfigRevision);

  const load = useCallback(async () => {
    try {
      const s = await getCompute();
      setStatus(s);
      setMode(s.mode);
      setUrl((u) => u || s.remote_url);
      if (s.remote_engine) setSpeech(s.remote_engine);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const { status: next, problem } = await switchCompute(mode, mode === 'remote' ? { url, key, speech } : undefined);
      setStatus(next);
      setKey('');
      if (problem) setError(`Switched, but the language model is not ready: ${problem}`);
      else message.success(mode === 'remote' ? 'Speech recognition and the language model now run on the remote GPU' : 'Both models run on this computer again');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remote = status?.remote;
  return (
    <SectionCard
      title="Where the AI runs"
      icon={<Server size={16} />}
      description="Both models move together: speech recognition (Omi Med STT) and the language model (Qwen). The microphone, voice detection and the app itself stay on this computer."
    >
      <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ marginBottom: 12 }}>
        <Space direction="vertical">
          <Radio value="local">
            <strong>This computer</strong> <span className="muted">Omi Med STT on the CPU, Qwen on this GPU (Ollama)</span>
          </Radio>
          <Radio value="remote">
            <strong>Kaggle GPU (remote)</strong> <span className="muted">both on a T4 — python/kaggle/careflow_gpu_server.py behind a tunnel</span>
          </Radio>
        </Space>
      </Radio.Group>

      {mode === 'remote' && (
        <div className="config-field">
          <label htmlFor="compute-url">Server address</label>
          <Input id="compute-url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://your-name.loca.lt" />
          <label htmlFor="compute-key" style={{ marginTop: 8 }}>
            Key (CAREFLOW_KEY on the server)
          </label>
          <Input.Password id="compute-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder={status?.has_key ? 'saved — leave empty to keep it' : ''} />
          <label style={{ marginTop: 8 }}>Speech model on the server</label>
          <Radio.Group value={speech} onChange={(e) => setSpeech(e.target.value)}>
            <Space direction="vertical">
              <Radio value="whisper">
                <strong>Whisper large-v3-turbo</strong> <span className="muted">best with non-US accents; knows the app's patients, drugs and diagnoses</span>
              </Radio>
              <Radio value="omi">
                <strong>Omi Med STT v1</strong> <span className="muted">medical, trained mostly on US English</span>
              </Radio>
            </Space>
          </Radio.Group>
          <div className="config-hint">
            Import python/kaggle/careflow_kaggle.ipynb into Kaggle (GPU T4, Internet on), set its KEY and Run All; it prints the address. Speech travels over a public tunnel: keep the key secret.
          </div>
        </div>
      )}

      {status && (
        <div className="config-status">
          {status.mode === 'remote' && remote?.ok !== false ? <CheckCircle2 size={15} color="#0f9d58" /> : status.mode === 'remote' ? <CircleAlert size={15} color="#d64545" /> : <CheckCircle2 size={15} color="#0f9d58" />}
          <span>Now:</span>
          <Tag color={status.mode === 'remote' ? 'blue' : 'green'}>{status.mode === 'remote' ? 'Kaggle GPU' : 'This computer'}</Tag>
          {status.mode === 'remote' && remote && (
            <span className="muted">
              {remote.ok === false ? remote.error : `${remote.model} on ${remote.gpu ?? remote.device}; language models there: ${(remote.ollama?.models ?? []).join(', ') || 'none'}`}
            </span>
          )}
        </div>
      )}

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />}
      {busy && <Alert type="info" showIcon icon={<Loader2 size={16} className="spin" />} message="Switching both models — checking the server, loading speech recognition and the language model…" style={{ marginTop: 12 }} />}

      <Space wrap className="config-actions">
        <Button type="primary" icon={<Save size={15} />} onClick={() => void apply()} loading={busy} disabled={mode === status?.mode && (mode === 'local' || (url === status.remote_url && !key && speech === (status.remote_engine ?? 'whisper')))}>
          {mode === 'remote' ? 'Switch to the Kaggle GPU' : 'Switch to this computer'}
        </Button>
      </Space>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- language model

function LanguageModelSection() {
  const active = useAppSelector((s) => s.voice.llmProvider);
  const revision = useAppSelector((s) => s.ui.aiConfigRevision);
  const [draft, setDraft] = useState<AIConfig['llm']>(() => effectiveConfig().llm);
  // Changed elsewhere (e.g. by voice): show what is now saved.
  useEffect(() => {
    if (revision) setDraft(effectiveConfig().llm);
  }, [revision]);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [test, setTest] = useState<ModelTestResult | 'running' | null>(null);
  const [applying, setApplying] = useState<null | 'loading'>(null);
  const [applied, setApplied] = useState<{ ok: boolean; text: string } | null>(null);
  const runtime = RUNTIMES.find((r) => r.value === draft.provider)!;
  const saved = effectiveConfig().llm;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setModels(await listModels(draft.provider, draft.apiUrl));
      setListError(null);
    } catch (e) {
      setModels(null);
      setListError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [draft.provider, draft.apiUrl]);

  // Live list: on open, when the runtime or its address changes, when the window regains focus
  // (e.g. after `ollama pull` in a terminal), and every few seconds while the page is open.
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 300);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH_MS);
    return () => {
      clearTimeout(t);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const selected = models?.find((m) => m.name === draft.model);
  const set = <K extends keyof AIConfig['llm']>(key: K, value: AIConfig['llm'][K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setTest(null);
  };

  const apply = async () => {
    const previous = effectiveConfig().llm;
    setApplying('loading');
    setApplied(null);
    try {
      setAIOverride({ ...getAIOverride(), llm: draft });
      // A small GPU cannot hold two models: free the old one before the new one loads.
      if (previous.provider === 'ollama' && (previous.model !== draft.model || previous.apiUrl !== draft.apiUrl)) await unloadOllamaModel(previous.apiUrl, previous.model);
      const controller = getVoiceController();
      controller.reconfigure();
      const started = Date.now();
      const problem = await controller.warmUp();
      if (problem) {
        setApplied({ ok: false, text: `Saved, but ${draft.model} could not be loaded: ${problem}` });
      } else {
        setApplied({ ok: true, text: `${draft.model} is loaded and ready (${Math.round((Date.now() - started) / 1000)} s).` });
        message.success(`The assistant now runs on ${draft.model}`);
      }
    } finally {
      setApplying(null);
    }
  };

  const runTest = async () => {
    setTest('running');
    setTest(await testModel(draft));
  };

  const reset = () => {
    const { stt } = getAIOverride();
    clearAIOverride();
    if (stt) setAIOverride({ stt });
    setDraft(effectiveConfig().llm);
    getVoiceController().reconfigure();
    message.info('Language model settings are back to the defaults');
  };

  const options = (models ?? []).map((m) => ({
    value: m.name,
    disabled: m.tools === false,
    label: (
      <span className="config-model-option">
        <strong>{m.name}</strong>
        <span className="config-model-tags">
          {m.parameterSize && <Tag>{m.parameterSize}</Tag>}
          {m.quantization && <Tag>{m.quantization}</Tag>}
          {gb(m.sizeBytes) && <Tag>{gb(m.sizeBytes)}</Tag>}
          {m.tools === true && <Tag color="green">tool calling</Tag>}
          {m.tools === false && <Tag color="red">no tool calling</Tag>}
        </span>
      </span>
    ),
  }));

  return (
    <SectionCard title="Language model" icon={<BrainCircuit size={16} />} description="The model that understands requests and decides which tools to call.">
      <div className="config-status">
        <span className="muted">In use:</span> <Tag color="blue">{active || '—'}</Tag>
      </div>

      <div className="config-field">
        <label>Runtime</label>
        <Radio.Group
          value={draft.provider}
          onChange={(e) => {
            const next = RUNTIMES.find((r) => r.value === e.target.value)!;
            setDraft((d) => ({ ...d, provider: next.value, apiUrl: d.provider === next.value ? d.apiUrl : next.defaultUrl }));
          }}
          optionType="button"
          options={RUNTIMES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <div className="config-hint">{runtime.hint}</div>
      </div>

      <div className="config-field">
        <label htmlFor="llm-url">Server address</label>
        <Input id="llm-url" value={draft.apiUrl} onChange={(e) => set('apiUrl', e.target.value.trim())} placeholder={runtime.defaultUrl} />
      </div>

      <div className="config-field">
        <label>
          Model
          <Tooltip title="Refresh the list">
            <Button type="text" size="small" icon={<RefreshCw size={14} className={refreshing ? 'spin' : undefined} />} onClick={() => void refresh()} aria-label="Refresh the model list" />
          </Tooltip>
        </label>
        <Select
          showSearch
          value={draft.model}
          onChange={(v: string) => set('model', v)}
          options={options}
          optionLabelProp="value"
          loading={refreshing && !models}
          notFoundContent={listError ? 'The runtime is not reachable' : 'No models installed'}
          style={{ width: '100%' }}
        />
        {listError && <Alert type="error" showIcon message="Cannot list the models" description={listError} style={{ marginTop: 8 }} />}
        {models && !selected && (
          <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`${draft.model} is not installed in this runtime`} description={draft.provider === 'ollama' ? `Run: ollama pull ${draft.model}` : undefined} />
        )}
        {selected?.tools === null && <div className="config-hint">This runtime does not say whether the model can call tools — use Test to find out.</div>}
        {models && <div className="config-hint">{models.length} model{models.length === 1 ? '' : 's'} installed · the list refreshes by itself, so a newly pulled model appears here.</div>}
      </div>

      <Collapse
        size="small"
        className="config-advanced"
        items={[
          {
            key: 'advanced',
            label: 'Performance',
            children: (
              <div className="config-advanced-grid">
                <NumberSetting label="Context window (tokens)" hint="Tool schemas take ~8k; 12288 leaves room for the conversation." value={draft.numCtx} min={4096} max={131072} step={1024} onChange={(v) => set('numCtx', v)} />
                <NumberSetting label="GPU layers" hint="99 = the whole model on the GPU; 0 = CPU only." value={draft.numGpu} min={0} max={999} onChange={(v) => set('numGpu', v)} />
                <NumberSetting label="Timeout per request (s)" hint="The first request after a change loads the model." value={Math.round(draft.timeoutMs / 1000)} min={10} max={900} onChange={(v) => set('timeoutMs', v * 1000)} />
                <NumberSetting label="Steps per request" hint="Most model calls one request may take (tool → result → next tool …)." value={draft.maxSteps} min={1} max={12} onChange={(v) => set('maxSteps', v)} />
              </div>
            ),
          },
        ]}
      />

      {test === 'running' && <Alert type="info" showIcon icon={<Loader2 size={16} className="spin" />} message="Testing — loading the model can take a minute the first time…" style={{ marginTop: 12 }} />}
      {test && test !== 'running' && (
        <Alert
          style={{ marginTop: 12 }}
          type={test.ok && test.toolCalling ? 'success' : test.ok ? 'warning' : 'error'}
          showIcon
          message={test.ok && test.toolCalling ? `Works with the assistant (${(test.ms / 1000).toFixed(1)} s)` : test.ok ? 'The model answered, but did not call a tool' : 'The test failed'}
          description={test.detail}
        />
      )}
      {applying && <Alert type="info" showIcon icon={<Loader2 size={16} className="spin" />} message={`Loading ${draft.model} and preparing its cache — this can take a minute…`} style={{ marginTop: 12 }} />}
      {applied && !applying && <Alert type={applied.ok ? 'success' : 'error'} showIcon message={applied.text} style={{ marginTop: 12 }} />}

      <Space wrap className="config-actions">
        <Button icon={<FlaskConical size={15} />} onClick={() => void runTest()} disabled={test === 'running' || !!applying}>
          Test
        </Button>
        <Button type="primary" icon={<Save size={15} />} onClick={() => void apply()} loading={!!applying} disabled={!dirty || selected?.tools === false}>
          Save and apply
        </Button>
        <Button icon={<RotateCcw size={15} />} onClick={reset} disabled={!!applying}>
          Defaults ({aiConfig.llm.model})
        </Button>
      </Space>
    </SectionCard>
  );
}

function NumberSetting({ label, hint, value, min, max, step, onChange }: { label: string; hint: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="config-field">
      <label>{label}</label>
      <InputNumber value={value} min={min} max={max} step={step} onChange={(v) => typeof v === 'number' && onChange(v)} style={{ width: '100%' }} />
      <div className="config-hint">{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------- speech model

function SpeechModelSection() {
  const [wsUrl, setWsUrl] = useState(() => effectiveConfig().stt.wsUrl);
  const bridgeUrl = useMemo(() => bridgeHttpUrl(wsUrl), [wsUrl]);
  const [config, setConfig] = useState<SttConfig | null>(null);
  const [draft, setDraft] = useState<SttSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);
  const revision = useAppSelector((s) => s.ui.aiConfigRevision);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getSttConfig(bridgeUrl);
      setConfig(c);
      setDraft(c.settings);
      setError(null);
    } catch (e) {
      setConfig(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [bridgeUrl]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, [load]);
  // Changed elsewhere (e.g. by voice): reload what the bridge now runs.
  useEffect(() => {
    if (revision) void load();
  }, [revision, load]);

  const models = config?.models ?? [];
  const selectedModel = draft ? models.find((m) => m.repo === draft.repo && (draft.engine !== 'gguf' || m.gguf_file === draft.gguf_file)) : undefined;
  const dirty = !!config && !!draft && JSON.stringify(draft) !== JSON.stringify(config.settings);
  const urlChanged = wsUrl !== effectiveConfig().stt.wsUrl;

  const set = <K extends keyof SttSettings>(key: K, value: SttSettings[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const apply = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const next = await saveSttConfig(bridgeUrl, draft);
      setConfig(next);
      setDraft(next.settings);
      setError(null);
      message.success(`Speech recognition now uses ${next.engine.engine}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setAIOverride({ ...getAIOverride(), stt: { wsUrl } });
    getVoiceController().reconfigure();
    loaded.current = true;
    await load();
  };

  return (
    <SectionCard title="Speech recognition" icon={<AudioLines size={16} />} description="The speech model that transcribes live while you speak — Omi Med STT or NVIDIA Parakeet. It runs in the Python bridge.">
      <div className="config-field">
        <label htmlFor="stt-url">Bridge address</label>
        <Space.Compact style={{ width: '100%' }}>
          <Input id="stt-url" value={wsUrl} onChange={(e) => setWsUrl(e.target.value.trim())} placeholder={aiConfig.stt.wsUrl} />
          <Button onClick={() => void connect()} loading={loading} icon={<RefreshCw size={14} />}>
            {urlChanged ? 'Connect' : 'Reload'}
          </Button>
        </Space.Compact>
      </div>

      {error && <Alert type="error" showIcon message={config ? 'The change was not applied' : 'The bridge is not reachable'} description={error} style={{ marginBottom: 12 }} />}

      {config && draft && (
        <>
          <div className="config-status">
            {config.engine.ready ? <CheckCircle2 size={15} color="#0f9d58" /> : <CircleAlert size={15} color="#d64545" />}
            <span>{config.engine.ready ? 'Running:' : 'Not running:'}</span> <Tag color={config.engine.ready ? 'green' : 'red'}>{config.engine.engine}</Tag>
            {config.engine.error && <span className="muted">{config.engine.error}</span>}
          </div>

          {draft.engine === 'remote' && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="Speech recognition runs on the remote GPU"
              description={`${config.engine.engine}${config.engine.latency_ms !== undefined ? ` — ${config.engine.latency_ms} ms away` : ''}. Change it under "Where the AI runs" at the top of this page.`}
            />
          )}

          {draft.engine !== 'remote' && (
          <div className="config-field">
            <label>Model</label>
            <Select
              value={selectedModel?.id}
              onChange={(id: string) => {
                const m = models.find((x) => x.id === id)!;
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        repo: m.repo,
                        engine: m.engine,
                        gguf_file: m.gguf_file,
                        // Parakeet (ONNX) runs on the CPU or the GPU only, int8 unless chosen otherwise.
                        ...(m.engine === 'onnx' ? { backend: d.backend === 'vulkan' ? 'cpu' : d.backend, precision: d.precision ?? 'int8' } : {}),
                      }
                    : d,
                );
              }}
              options={models.filter((m) => m.engine !== 'remote').map((m) => ({
                value: m.id,
                disabled: !m.available,
                label: (
                  <span className="config-model-option">
                    <strong>{m.label}</strong>
                    <span className="config-model-tags">
                      {m.downloaded ? <Tag color="green">downloaded</Tag> : <Tag>{m.download_mb ? `download ~${m.download_mb} MB` : 'not downloaded'}</Tag>}
                      {!m.available && <Tag color="red">{m.reason}</Tag>}
                    </span>
                  </span>
                ),
              }))}
              style={{ width: '100%' }}
            />
            <div className="config-hint">Any other Omi Med STT build in the Hugging Face cache is listed here as well.</div>
            {selectedModel && (() => {
              const precision = draft.precision ?? 'int8';
              const onDisk = selectedModel.engine === 'onnx' ? (selectedModel.downloaded_precisions ?? []).includes(precision) : selectedModel.downloaded;
              const size = selectedModel.engine === 'onnx' ? selectedModel.download_mb_by_precision?.[precision] : selectedModel.download_mb;
              return onDisk ? null : <Alert type="info" showIcon style={{ marginTop: 8 }} message={`Applying downloads this model${size ? ` (~${size} MB)` : ''} first.`} />;
            })()}
          </div>
          )}

          {draft.engine === 'onnx' && (
            <div className="config-field">
              <label>Device and precision</label>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Radio.Group value={draft.backend} onChange={(e) => set('backend', e.target.value)}>
                  {(config.onnx_backends ?? []).map((b) => (
                    <Radio key={b.id} value={b.id} disabled={!b.available}>
                      <strong>{b.id === 'cuda' ? 'GPU (CUDA)' : 'CPU'}</strong> {!b.available && <span className="muted">{b.reason}</span>}
                    </Radio>
                  ))}
                </Radio.Group>
                <Radio.Group value={draft.precision ?? 'int8'} onChange={(e) => set('precision', e.target.value)}>
                  <Radio value="int8">
                    <strong>int8</strong> <span className="muted">~630 MB · fastest on the CPU</span>
                  </Radio>
                  <Radio value="fp32">
                    <strong>fp32</strong> <span className="muted">~2.4 GB · the one that really runs on a GPU</span>
                  </Radio>
                </Radio.Group>
              </Space>
              <div className="config-hint">
                {draft.backend === 'cuda' && (draft.precision ?? 'int8') === 'int8'
                  ? 'int8 on the GPU was measured slower than on the CPU (0.85 s vs 1.36 s a sentence): its quantized layers run on the CPU and data is copied back and forth.'
                  : draft.backend === 'cuda'
                    ? 'fp32 on the GPU needs ~2.8 GB of free graphics memory. On a 4 GB card the language model already uses most of it — applying checks and refuses rather than slowing both down.'
                    : 'Measured on your recordings: as accurate as Omi Med STT, about 40% faster on the CPU.'}
              </div>
            </div>
          )}

          {draft.engine === 'gguf' && (
            <div className="config-field">
              <label>Backend</label>
              <Radio.Group value={draft.backend} onChange={(e) => set('backend', e.target.value)}>
                <Space direction="vertical">
                  {config.backends.map((b) => (
                    <Radio key={b.id} value={b.id} disabled={!b.available}>
                      <strong>{b.id.toUpperCase()}</strong>{' '}
                      {b.installed ? <Tag color="green">installed</Tag> : b.available ? <Tag color="gold">not installed</Tag> : <Tag>unavailable</Tag>}
                      {b.reason && <span className="muted"> {b.reason}</span>}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
              <div className="config-hint">On a 4 GB graphics card shared with the language model, CPU is usually the better choice.</div>
            </div>
          )}

          {config.refiners && (
            <div className="config-field">
              <label>Second recogniser for names and drugs</label>
              <Radio.Group value={draft.refine ?? ''} onChange={(e) => set('refine', e.target.value)}>
                <Space direction="vertical">
                  {config.refiners.map((r) => (
                    <Radio key={r.id || 'off'} value={r.id}>
                      <strong>{r.label}</strong> <span className="muted">{r.note}</span>
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
              <div className="config-hint">
                Omi Med STT shows the words live. When a sentence ends, Whisper hears it again knowing this app's patients, drugs, diagnoses and providers; the assistant gets both versions and combines them.
                {config.refiner && !config.refiner.ready && <span style={{ color: 'var(--ant-color-error, #cf1322)' }}> Not running: {config.refiner.error}</span>}
              </div>
            </div>
          )}

          <div className="config-advanced-grid">
            {draft.engine === 'gguf' && (
              <NumberSetting label="CPU threads" hint="0 = automatic." value={draft.threads} min={0} max={64} onChange={(v) => set('threads', v)} />
            )}
            <div className="config-field">
              <label>Pause that ends a sentence: {draft.endpoint_ms} ms</label>
              <Slider min={300} max={3000} step={100} value={draft.endpoint_ms} onChange={(v: number) => set('endpoint_ms', v)} />
              <div className="config-hint">Shorter answers faster; longer cuts fewer sentences in half.</div>
            </div>
            <div className="config-field">
              <label>Live text refresh: every {draft.partial_ms} ms</label>
              <Slider min={250} max={2000} step={50} value={draft.partial_ms} onChange={(v: number) => set('partial_ms', v)} />
              <div className="config-hint">How often the words on screen update while you speak.</div>
            </div>
            <div className="config-field">
              <label>
                <Switch size="small" checked={draft.record} onChange={(v) => set('record', v)} style={{ marginRight: 8 }} />
                Record voice commands for troubleshooting
              </label>
              <div className="config-hint">
                Keeps each spoken command's audio, what was heard and what the assistant did, in python/recordings on this computer. Takes effect the next time the microphone is turned on. Leave it off normally.
              </div>
            </div>
          </div>

          {saving && <Alert type="info" showIcon icon={<Loader2 size={16} className="spin" />} message="Loading the speech model — the current one keeps working until the new one is ready…" style={{ marginTop: 12 }} />}

          <Space wrap className="config-actions">
            <Button type="primary" icon={<Save size={15} />} onClick={() => void apply()} loading={saving} disabled={!dirty}>
              Save and apply
            </Button>
            <Button icon={<RotateCcw size={15} />} onClick={() => setDraft(config.settings)} disabled={!dirty || saving}>
              Undo changes
            </Button>
          </Space>
        </>
      )}
    </SectionCard>
  );
}
