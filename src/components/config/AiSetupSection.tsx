import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Input, Select, Tooltip, message, type SelectProps } from 'antd';
import { BrainCircuit, CheckCircle2, Cloud, HelpCircle, Laptop, Loader2, Mic, RefreshCw, Server, Sparkles } from 'lucide-react';
import { useAppSelector } from '@/store';
import { SectionCard } from '@/components/common';
import { effectiveConfig } from '@/services/ai/config';
import {
  checkKaggle,
  DEFAULT_OPENROUTER_LLM,
  getCompute,
  listOpenRouterModels,
  OPENROUTER_LLMS,
  REMOTE_LLMS,
  switchCompute,
  switchRemoteModel,
  type ComputeStatus,
  type KaggleHealth,
  type OpenRouterModel,
  type RemoteSpeech,
} from '@/services/ai/compute';

/**
 * Where the AI runs — chosen as a whole setup, the way the provider thinks about it:
 *
 *   Kaggle GPU           Whisper + Qwen, both on the Kaggle T4
 *   Kaggle + OpenRouter  Whisper on the Kaggle T4, any OpenRouter model that calls tools in the cloud
 *   This computer        everything here, offline
 *
 * Laid out like a control panel: what runs now at the top, the draft being put together in the middle
 * (setup → Kaggle server → language model), and a dock at the foot that says what Apply will do and is
 * the only thing that changes anything. Nothing moves until Apply, and the bridge checks every part first.
 */

type Setup = 'kaggle' | 'hybrid' | 'local';

const SETUPS: Array<{ id: Setup; title: string; blurb: string; icon: ReactNode; speech: string; brain: string; badges: Array<{ text: string; tone?: 'ok' | 'info' | 'warn' }> }> = [
  {
    id: 'kaggle',
    title: 'Kaggle GPU',
    blurb: 'Speech and thinking both on your Kaggle T4.',
    icon: <Server size={20} />,
    speech: 'Whisper · Kaggle',
    brain: 'Qwen 3.5 4B / 9B · Kaggle',
    badges: [{ text: 'Free', tone: 'ok' }, { text: 'Private to your Kaggle' }],
  },
  {
    id: 'hybrid',
    title: 'Kaggle + OpenRouter',
    blurb: 'Whisper hears on Kaggle; a cloud model of your choice thinks.',
    icon: <Cloud size={20} />,
    speech: 'Whisper · Kaggle',
    brain: 'Any tool-calling model · OpenRouter',
    badges: [{ text: 'Most capable', tone: 'info' }, { text: 'Paid per use', tone: 'warn' }],
  },
  {
    id: 'local',
    title: 'This computer',
    blurb: 'Everything here — works without the internet.',
    icon: <Laptop size={20} />,
    speech: 'Omi Med STT · this CPU',
    brain: 'Qwen · this GPU (Ollama)',
    badges: [{ text: 'Offline' }],
  },
];

const setupOf = (s: ComputeStatus): Setup => (s.mode === 'remote' ? 'kaggle' : s.mode === 'openrouter' ? 'hybrid' : 'local');
const SPEECH_NAMES: Record<RemoteSpeech, string> = { whisper: 'Whisper large-v3-turbo', omi: 'Omi Med STT v1' };
const money = (n: number) => (n === 0 ? 'free' : `$${n < 1 ? n.toFixed(2).replace(/0$/, '') : n.toFixed(n % 1 ? 2 : 0)}`);
const ctx = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M ctx` : n ? `${Math.round(n / 1000)}K ctx` : '');

/** A dot and a few words: good, bad or in progress. */
function Pill({ tone, children }: { tone: 'ok' | 'bad' | 'busy' | 'idle'; children: ReactNode }) {
  return (
    <span className={`aisetup-pill is-${tone}`}>
      {tone === 'busy' ? <Loader2 size={12} className="spin" /> : <span className="aisetup-dot" aria-hidden />}
      {children}
    </span>
  );
}

export function AiSetupSection() {
  const revision = useAppSelector((s) => s.ui.aiConfigRevision);
  const [status, setStatus] = useState<ComputeStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- the draft
  const [setup, setSetup] = useState<Setup>('kaggle');
  const [url, setUrl] = useState('');
  const [kaggleKey, setKaggleKey] = useState('');
  const [changingKaggleKey, setChangingKaggleKey] = useState(false);
  const [engine, setEngine] = useState<RemoteSpeech>('whisper');
  const [qwen, setQwen] = useState<string>(REMOTE_LLMS[1].name);
  const [orModel, setOrModel] = useState<string>(DEFAULT_OPENROUTER_LLM);
  const [orKey, setOrKey] = useState('');
  const [changingOrKey, setChangingOrKey] = useState(false);

  const [health, setHealth] = useState<KaggleHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [orModels, setOrModels] = useState<OpenRouterModel[] | null>(null);
  const [orListError, setOrListError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** The draft, reset to what runs now. */
  const resetTo = useCallback((s: ComputeStatus) => {
    setSetup(setupOf(s));
    setUrl(s.remote_url ?? '');
    setKaggleKey('');
    setChangingKaggleKey(false);
    if (s.remote_engine) setEngine(s.remote_engine);
    const llm = effectiveConfig().llm;
    if (s.mode === 'remote') setQwen(llm.model);
    setOrModel(s.openrouter_model || DEFAULT_OPENROUTER_LLM);
    setOrKey('');
    setChangingOrKey(false);
    if (s.remote) setHealth(s.remote);
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await getCompute();
      setStatus(s);
      setLoadError(null);
      return s;
    } catch (e) {
      setLoadError((e as Error).message);
      return null;
    }
  }, []);

  useEffect(() => {
    void load().then((s) => s && resetTo(s));
  }, [load, resetTo, revision]);

  // ---- the Kaggle server: checked on its own, before anything is switched
  const check = useCallback(async (address: string, key: string) => {
    if (!address.trim()) {
      setHealth(null);
      return;
    }
    setChecking(true);
    setHealth(await checkKaggle(address.trim(), key));
    setChecking(false);
  }, []);
  const lastChecked = useRef('');
  useEffect(() => {
    if (setup === 'local' || !status || !url.trim()) return;
    const token = `${url}|${kaggleKey}`;
    if (token === lastChecked.current) return;
    const t = setTimeout(() => {
      lastChecked.current = token;
      void check(url, kaggleKey);
    }, 700);
    return () => clearTimeout(t);
  }, [setup, url, kaggleKey, status, check]);

  // ---- OpenRouter's models, read once they are wanted
  useEffect(() => {
    if (setup !== 'hybrid' || orModels) return;
    listOpenRouterModels()
      .then((list) => {
        setOrModels(list);
        setOrListError(null);
      })
      .catch((e: Error) => setOrListError(e.message));
  }, [setup, orModels]);

  const orName = (id: string) => orModels?.find((m) => m.id === id)?.name ?? OPENROUTER_LLMS.find((m) => m.name === id)?.label ?? id;
  const chosenModel = orModels?.find((m) => m.id === orModel);
  const orOptions: SelectProps['options'] = useMemo(() => {
    if (!orModels) return OPENROUTER_LLMS.map((m) => ({ value: m.name, label: m.label }));
    const option = (m: OpenRouterModel) => ({ value: m.id, label: `${m.name} ${m.id}`, model: m });
    return [
      { label: 'Recommended for CareFlow', options: orModels.filter((m) => m.note).map(option) },
      { label: `All models that call tools · ${orModels.filter((m) => !m.note).length}`, options: orModels.filter((m) => !m.note).map(option) },
    ];
  }, [orModels]);

  // ---- what runs now, and what Apply would change
  const nowSetup = status ? setupOf(status) : null;
  const nowSpeechRemote = status?.speech ? status.speech === 'remote' : status?.mode === 'remote';
  const qwenInUse = status?.mode === 'remote' ? effectiveConfig().llm.model : null;
  const kaggleChanged = url.trim() !== (status?.remote_url ?? '') || !!kaggleKey || engine !== (status?.remote_engine ?? 'whisper');
  const dirty =
    !!status &&
    (setup !== nowSetup ||
      (setup !== 'local' && (kaggleChanged || !nowSpeechRemote)) ||
      (setup === 'kaggle' && qwen !== qwenInUse) ||
      (setup === 'hybrid' && (orModel !== status.openrouter_model || !!orKey)));
  const kaggleReady = setup === 'local' || (!!url.trim() && (status?.has_key || !!kaggleKey));
  const orReady = setup !== 'hybrid' || status?.has_openrouter_key || !!orKey;
  const qwenMissing = setup === 'kaggle' && !!health?.ollama?.models?.length && !health.ollama.models.includes(qwen);
  const bridgeOutdated = !!status && !('speech' in status);

  const willRun = {
    speech: setup === 'local' ? 'Omi Med STT · this computer' : `${SPEECH_NAMES[engine]} · Kaggle GPU`,
    brain: setup === 'local' ? 'Qwen · this computer (Ollama)' : setup === 'kaggle' ? `${qwen} · Kaggle GPU` : `${orName(orModel)} · OpenRouter`,
  };

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      let problem: string | null = null;
      if (setup === 'kaggle') {
        const sameServer = status?.mode === 'remote' && nowSpeechRemote && !kaggleChanged;
        if (sameServer) problem = await switchRemoteModel(qwen);
        else ({ problem } = await switchCompute('remote', { url: url.trim(), key: kaggleKey, speech: engine, model: qwen }, undefined, 'remote'));
      } else if (setup === 'hybrid') {
        ({ problem } = await switchCompute('openrouter', { url: url.trim(), key: kaggleKey, speech: engine }, { key: orKey, model: orModel }, 'remote'));
      } else {
        ({ problem } = await switchCompute('local', undefined, undefined, 'local'));
      }
      const s = await load();
      if (s) resetTo(s);
      if (problem) setError(`Switched, but the language model is not ready: ${problem}`);
      else message.success(`Now running: ${willRun.speech} · ${willRun.brain}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const kaggleHealthPill =
    checking ? (
      <Pill tone="busy">Checking…</Pill>
    ) : health?.ok === false ? (
      <Pill tone="bad">Not reachable</Pill>
    ) : health ? (
      <Pill tone="ok">Connected{health.gpu ? ` · ${String(health.gpu).split('\n')[0].split(',')[0]}` : ''}</Pill>
    ) : (
      <Pill tone="idle">Not checked</Pill>
    );

  return (
    <SectionCard
      title="Where the AI runs"
      icon={<Server size={16} />}
      description="Speech recognition and the language model. The microphone, voice detection and the app itself always stay on this computer."
      className="aisetup"
    >
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />}
      {bridgeOutdated && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Restart the bridge" description='The bridge running now is older than this page. Stop it and run "npm run bridge" again.' />
      )}

      {/* ---- what runs now */}
      {status && (
        <div className="aisetup-now" aria-label="Running now">
          <span className="aisetup-now-label">Running now</span>
          <span className="aisetup-chip">
            <Mic size={14} aria-hidden /> {nowSpeechRemote ? `${SPEECH_NAMES[status.remote_engine ?? 'whisper']} · Kaggle` : 'Omi Med STT · this computer'}
            {nowSpeechRemote && (status.remote?.ok === false ? <span className="aisetup-dot is-bad" title={status.remote.error} /> : <span className="aisetup-dot is-ok" />)}
          </span>
          <span className="aisetup-chip">
            <BrainCircuit size={14} aria-hidden />
            {status.mode === 'openrouter'
              ? `${orName(status.openrouter_model ?? DEFAULT_OPENROUTER_LLM)} · OpenRouter`
              : status.mode === 'remote'
                ? `${effectiveConfig().llm.model} · Kaggle`
                : `${effectiveConfig().llm.model} · this computer`}
            {status.mode === 'openrouter' &&
              (status.openrouter?.ok === false ? (
                <span className="aisetup-dot is-bad" title={status.openrouter.error} />
              ) : (
                <>
                  <span className="aisetup-dot is-ok" />
                  {status.openrouter?.limit_remaining != null && <span className="aisetup-chip-note">${status.openrouter.limit_remaining.toFixed(2)} left</span>}
                </>
              ))}
          </span>
        </div>
      )}
      {status?.remote?.ok === false && nowSpeechRemote && <div className="aisetup-now-error">Kaggle: {status.remote.error}</div>}

      {/* ---- 1 · setup */}
      <div className="aisetup-step">
        <span className="aisetup-step-no">1</span> Choose a setup
      </div>
      <div className="aisetup-cards" role="radiogroup" aria-label="Setup">
        {SETUPS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={setup === s.id} className={`aisetup-card ${setup === s.id ? 'is-on' : ''}`} data-setup={s.id} onClick={() => setSetup(s.id)}>
            <span className="aisetup-card-head">
              <span className="aisetup-card-icon" aria-hidden>
                {s.icon}
              </span>
              <span className="aisetup-card-title">{s.title}</span>
              {nowSetup === s.id && <span className="aisetup-badge is-now">In use</span>}
              <span className="aisetup-radio" aria-hidden>
                <CheckCircle2 size={18} />
              </span>
            </span>
            <span className="aisetup-card-blurb">{s.blurb}</span>
            <span className="aisetup-card-rows">
              <span>
                <Mic size={13} aria-hidden /> {s.speech}
              </span>
              <span>
                <BrainCircuit size={13} aria-hidden /> {s.brain}
              </span>
            </span>
            <span className="aisetup-card-badges">
              {s.badges.map((b) => (
                <span key={b.text} className={`aisetup-badge ${b.tone ? `is-${b.tone}` : ''}`}>
                  {b.text}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>

      {/* ---- 2 · the Kaggle server (both Kaggle setups) */}
      {setup !== 'local' && (
        <div className="aisetup-panel">
          <div className="aisetup-step">
            <span className="aisetup-step-no">2</span> Kaggle server <span className="muted">— speech recognition{setup === 'kaggle' ? ' and the language model' : ''}</span>
            <span className="aisetup-step-end">{kaggleHealthPill}</span>
          </div>
          <div className="aisetup-row">
            <div className="aisetup-field">
              <label htmlFor="compute-url">Address</label>
              <Input id="compute-url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://….trycloudflare.com" allowClear />
            </div>
            <Button icon={<RefreshCw size={14} className={checking ? 'spin' : undefined} />} onClick={() => void check(url, kaggleKey)} disabled={!url.trim() || checking} className="aisetup-check">
              Check connection
            </Button>
          </div>
          {health?.ok === false && <div className="aisetup-field-error">{health.error}</div>}
          {health?.ok !== false && health?.engines && (
            <div className="aisetup-field-note">
              On the server: {Object.keys(health.engines).map((e) => SPEECH_NAMES[e as RemoteSpeech] ?? e).join(', ')}
              {health.ollama?.models?.length ? ` · ${health.ollama.models.join(', ')}` : ''}
            </div>
          )}
          <div className="aisetup-field">
            {status?.has_key && !changingKaggleKey ? (
              <span className="aisetup-keyline">
                <CheckCircle2 size={14} color="#0f9d63" aria-hidden /> Server key saved on the bridge.
                <Button type="link" size="small" onClick={() => setChangingKaggleKey(true)}>
                  Change key
                </Button>
              </span>
            ) : (
              <>
                <label htmlFor="compute-key">Server key (KEY in careflow_kaggle.ipynb)</label>
                <Input.Password id="compute-key" value={kaggleKey} onChange={(e) => setKaggleKey(e.target.value.trim())} autoComplete="off" />
              </>
            )}
          </div>
          <div className="aisetup-field">
            <label>Speech model</label>
            <div className="aisetup-options" role="radiogroup" aria-label="Speech model">
              {(['whisper', 'omi'] as RemoteSpeech[]).map((e) => {
                const missing = !!health?.engines && !(e in health.engines);
                return (
                  <button key={e} type="button" role="radio" aria-checked={engine === e} disabled={missing} className={`aisetup-option ${engine === e ? 'is-on' : ''}`} data-value={e} onClick={() => setEngine(e)}>
                    <strong>{SPEECH_NAMES[e]}</strong>
                    <span>{missing ? 'not loaded on this server' : e === 'whisper' ? 'Recommended — best with every accent; knows your patients, drugs and diagnoses' : 'Medical vocabulary; trained mostly on US English'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <details className="aisetup-help">
            <summary>
              <HelpCircle size={13} aria-hidden /> How do I start the Kaggle server?
            </summary>
            Import <code>python/kaggle/careflow_kaggle.ipynb</code> into Kaggle (Accelerator: GPU T4, Internet: on), set its KEY and press Run All. It prints the address to paste above. Speech travels over a public tunnel — keep the key secret.
          </details>
        </div>
      )}

      {/* ---- 3 · the language model */}
      <div className="aisetup-panel">
        <div className="aisetup-step">
          <span className="aisetup-step-no">{setup === 'local' ? 2 : 3}</span> Language model
          <span className="muted">{setup === 'kaggle' ? ' — on the Kaggle GPU' : setup === 'hybrid' ? ' — on OpenRouter' : ' — on this computer'}</span>
        </div>

        {setup === 'kaggle' && (
          <div className="aisetup-options" role="radiogroup" aria-label="Qwen model">
            {REMOTE_LLMS.map((m) => {
              const installed = health?.ollama?.models;
              const missing = !!installed?.length && !installed.includes(m.name);
              return (
                <button key={m.name} type="button" role="radio" aria-checked={qwen === m.name} disabled={missing} className={`aisetup-option ${qwen === m.name ? 'is-on' : ''}`} data-value={m.name} onClick={() => setQwen(m.name)}>
                  <strong>
                    {m.name === 'qwen3.5:9b' ? 'Qwen 3.5 9B' : 'Qwen 3.5 4B'}
                    {qwenInUse === m.name && <span className="aisetup-badge is-now">In use</span>}
                    {m.name === 'qwen3.5:9b' && <span className="aisetup-badge is-info">Recommended</span>}
                  </strong>
                  <span>{missing ? 'not on the server — run the updated careflow_kaggle.ipynb' : m.name === 'qwen3.5:9b' ? 'More accurate with long, many-part requests' : 'Faster replies; misses more in long requests'}</span>
                </button>
              );
            })}
          </div>
        )}

        {setup === 'hybrid' && (
          <>
            <div className="aisetup-field">
              {status?.has_openrouter_key && !changingOrKey ? (
                <span className="aisetup-keyline">
                  <CheckCircle2 size={14} color="#0f9d63" aria-hidden /> OpenRouter API key set up on the bridge.
                  {status.mode === 'openrouter' && status.openrouter?.limit_remaining != null && <span className="muted"> Credit left: ${status.openrouter.limit_remaining.toFixed(2)}.</span>}
                  <Button type="link" size="small" onClick={() => setChangingOrKey(true)}>
                    Change key
                  </Button>
                </span>
              ) : (
                <>
                  <label htmlFor="openrouter-key">OpenRouter API key</label>
                  <Input.Password id="openrouter-key" value={orKey} onChange={(e) => setOrKey(e.target.value.trim())} placeholder="sk-or-…" autoComplete="off" />
                </>
              )}
            </div>
            <div className="aisetup-field">
              <label htmlFor="openrouter-model">Model</label>
              <Select
                id="openrouter-model"
                className="openrouter-model-select"
                showSearch
                value={orModel}
                onChange={(v: string) => setOrModel(v)}
                options={orOptions}
                optionFilterProp="label"
                loading={!orModels && !orListError}
                listHeight={380}
                style={{ width: '100%' }}
                placeholder="Search models"
                labelRender={() => (
                  <span className="aisetup-model-value">
                    {chosenModel?.note && <Sparkles size={13} aria-hidden />} {orName(orModel)} <span className="muted">{orModel}</span>
                  </span>
                )}
                optionRender={(option) => {
                  const m = (option.data as { model?: OpenRouterModel }).model;
                  if (!m) return option.label;
                  return (
                    <div className="aisetup-model">
                      <span className="aisetup-model-name">
                        {m.name}
                        {m.id === orModel && status?.openrouter_model === m.id && status.mode === 'openrouter' && <span className="aisetup-badge is-now">In use</span>}
                      </span>
                      <span className="aisetup-model-id">{m.id}</span>
                      <span className="aisetup-model-notes">
                        <span className="aisetup-note">
                          {money(m.promptPerM)} in · {money(m.completionPerM)} out /M
                        </span>
                        {ctx(m.context) && <span className="aisetup-note">{ctx(m.context)}</span>}
                        {m.note && <span className="aisetup-note is-pick">{m.note}</span>}
                      </span>
                    </div>
                  );
                }}
              />
              {orListError && <div className="aisetup-field-error">OpenRouter's model list could not be read: {orListError}</div>}
              {chosenModel && (
                <div className="aisetup-model-meta">
                  <span className="aisetup-badge">
                    {money(chosenModel.promptPerM)} in · {money(chosenModel.completionPerM)} out per million tokens
                  </span>
                  {ctx(chosenModel.context) && <span className="aisetup-badge">{ctx(chosenModel.context)}</span>}
                  {chosenModel.note && <span className="aisetup-badge is-info">{chosenModel.note}</span>}
                </div>
              )}
              <div className="aisetup-field-note">
                {orModels ? `${orModels.length} models call tools (the assistant needs that) — CareFlow's picks first. ` : ''}Every request is billed to your OpenRouter account and patient data leaves this computer for it.
              </div>
            </div>
          </>
        )}

        {setup === 'local' && (
          <div className="aisetup-field-note">Omi Med STT on this computer's CPU and a Qwen model in this computer's Ollama — pick the model and its settings under <strong>Language model</strong> below.</div>
        )}
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} closable onClose={() => setError(null)} />}

      {/* ---- the dock: what Apply will do, always in view */}
      <div className="aisetup-dock" data-dirty={dirty ? 'true' : 'false'}>
        <div className="aisetup-dock-info">
          <span className="aisetup-dock-label">{applying ? 'Switching…' : dirty ? 'After Apply' : 'No changes'}</span>
          <span className="aisetup-dock-value">
            <span>
              <Mic size={13} aria-hidden /> {willRun.speech}
            </span>
            <span>
              <BrainCircuit size={13} aria-hidden /> {willRun.brain}
            </span>
          </span>
        </div>
        <div className="aisetup-dock-actions">
          {dirty && !applying && (
            <Button onClick={() => status && resetTo(status)} disabled={!status}>
              Discard
            </Button>
          )}
          <Tooltip
            title={
              !kaggleReady ? 'Give the Kaggle server address (and its key)' : !orReady ? 'Add the OpenRouter API key' : qwenMissing ? `${qwen} is not on the Kaggle server` : bridgeOutdated ? 'Restart the bridge first' : ''
            }
          >
            <Button type="primary" onClick={() => void apply()} loading={applying} disabled={!dirty || !kaggleReady || !orReady || qwenMissing || bridgeOutdated} className="aisetup-apply">
              Apply
            </Button>
          </Tooltip>
        </div>
      </div>
    </SectionCard>
  );
}

