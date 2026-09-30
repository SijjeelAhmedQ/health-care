/**
 * Where the AI runs — the top-level switch:
 *
 *   local       speech recognition (Omi Med STT) and the language model (Qwen, local Ollama) on this computer
 *   remote      both on a remote GPU server (python/kaggle/careflow_gpu_server.py, e.g. a Kaggle T4)
 *   openrouter  the language model is a cloud GPT model on OpenRouter; speech recognition stays on this
 *               computer (OpenRouter has no speech recognition)
 *
 * The bridge switches the speech engine and forwards the language model — `/ollama` for this computer or
 * the remote GPU, `/openrouter` for OpenRouter (the bridge adds the API key; the browser never holds it).
 */
import { getVoiceController } from './voiceController';
import { aiConfig, bridgeHttpUrl, effectiveConfig, getAIOverride, setAIOverride } from './config';
import { unloadOllamaModel } from './modelCatalog';

/** Where the language model runs: this computer, the Kaggle GPU, or OpenRouter. */
export type ComputeMode = 'local' | 'remote' | 'openrouter';
/** Where speech recognition runs: this computer, or the Kaggle GPU (Whisper / Omi there). */
export type SpeechPlace = 'local' | 'remote';
export type RemoteSpeech = 'whisper' | 'omi';

/** The language models the Kaggle notebook installs — the provider picks one while the AI runs there. */
export const REMOTE_LLMS = [
  { name: 'qwen3.5:4b', hint: 'faster replies' },
  { name: 'qwen3.5:9b', hint: 'better at long, many-part requests; slower' },
] as const;

/**
 * The GPT models offered on OpenRouter — all call tools, which the assistant needs. GPT-6 Sol is the
 * default: the strongest of the three at a price that suits one call per step of every request.
 */
export const OPENROUTER_LLMS = [
  { name: 'openai/gpt-6-sol', label: 'GPT-6 Sol', hint: 'recommended — accurate with many tools and long requests · $2 / $10 per million tokens' },
  { name: 'openai/gpt-6-luna', label: 'GPT-6 Luna', hint: 'fastest and cheapest · $0.10 / $0.50 per million tokens' },
  { name: 'openai/gpt-6-astra', label: 'GPT-6 Astra', hint: 'the most capable, and the most expensive · $10 / $50 per million tokens' },
] as const;
export const DEFAULT_OPENROUTER_LLM = OPENROUTER_LLMS[0].name;

/** One OpenRouter model that can call tools, as the Configuration list shows it. */
export interface OpenRouterModel {
  id: string;
  name: string;
  /** US dollars per million prompt / completion tokens. */
  promptPerM: number;
  completionPerM: number;
  context: number;
  /** Why CareFlow recommends it (only for the picks at the top). */
  note?: string;
}

/**
 * CareFlow's picks, best first for this app (many tools, multi-step and multi-patient requests, clinical
 * wording): GPT first — the requirement — then the other strongest tool-callers. Every other model that
 * calls tools follows, newest first.
 */
const RECOMMENDED: Array<{ id: string; note: string }> = [
  { id: 'openai/gpt-6-sol', note: 'recommended — accurate with many tools and long requests' },
  { id: 'openai/gpt-6-astra', note: 'the most capable GPT — the most expensive' },
  { id: 'openai/gpt-6-luna', note: 'fastest and cheapest GPT' },
  { id: 'openai/gpt-6-sol-pro', note: 'GPT-6 Sol, thinks longer — slower' },
  { id: 'anthropic/claude-sonnet-5.5', note: 'very strong at tool use' },
  { id: 'anthropic/claude-opus-5.5', note: 'strongest Claude — expensive' },
  { id: 'google/gemini-3.8-flash', note: 'fast, long context' },
  { id: 'x-ai/grok-4.7', note: 'strong reasoning' },
  { id: 'qwen/qwen3.8-max-0902', note: 'largest Qwen' },
  { id: 'deepseek/deepseek-v4.1-flash', note: 'low cost' },
];

/**
 * Every OpenRouter model that can call tools (the assistant needs that), recommended ones first. Read live
 * through the bridge, so a model OpenRouter adds shows up by itself. Batch variants are left out: the
 * assistant needs an answer now.
 */
export async function listOpenRouterModels(): Promise<OpenRouterModel[]> {
  // Through the bridge; the list is public, so straight from OpenRouter when the bridge cannot give it.
  let res = await fetch(`${bridge()}/openrouter/api/v1/models`).catch(() => null);
  if (!res?.ok) res = await fetch('https://openrouter.ai/api/v1/models').catch(() => null);
  if (!res?.ok) throw new Error(`OpenRouter's model list is not available${res ? ` (${res.status})` : ' — check the internet connection'}`);
  const data = ((await res.json()) as { data?: Array<{ id: string; name?: string; created?: number; context_length?: number; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }> }).data ?? [];
  const usable = data.filter((m) => (m.supported_parameters ?? []).includes('tools') && !m.id.endsWith(':batch'));
  const toModel = (m: (typeof usable)[number], note?: string): OpenRouterModel => ({
    id: m.id,
    name: m.name?.replace(/^[^:]+:\s*/, '') || m.id,
    promptPerM: Number(m.pricing?.prompt ?? 0) * 1e6,
    completionPerM: Number(m.pricing?.completion ?? 0) * 1e6,
    context: m.context_length ?? 0,
    note,
  });
  const picks = RECOMMENDED.flatMap((r) => usable.filter((m) => m.id === r.id).map((m) => toModel(m, r.note)));
  const rest = usable
    .filter((m) => !RECOMMENDED.some((r) => r.id === m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m) => toModel(m));
  return [...picks, ...rest];
}

export interface ComputeStatus {
  mode: ComputeMode;
  /** Where speech recognition runs (a bridge from before this setting leaves it out). */
  speech?: SpeechPlace;
  remote_url: string;
  /** The speech model on the remote server: whisper (best with non-US accents) or omi. */
  remote_engine?: RemoteSpeech;
  has_key: boolean;
  remote: { ok?: boolean; error?: string; model?: string; device?: string; gpu?: string | null; engines?: Record<string, { model: string; device: string }>; ollama?: { ok: boolean; models?: string[]; error?: string } } | null;
  /** An OpenRouter key is saved in the bridge (the key itself never comes back). */
  has_openrouter_key?: boolean;
  openrouter_model?: string;
  openrouter?: { ok?: boolean; error?: string; label?: string | null; usage?: number | null; limit?: number | null; limit_remaining?: number | null } | null;
  stt: { engine: string; ready: boolean; error?: string | null };
}

const LOCAL_LLM_URL_KEY = 'careflow.compute.localLlmUrl';
/** The model this computer ran before switching away — it comes back with "This computer". */
const LOCAL_LLM_MODEL_KEY = 'careflow.compute.localLlmModel';

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the defaults are used on the way back */
  }
};
const recall = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const trimSlash = (u: string) => u.replace(/\/$/, '');

async function call(url: string, init?: RequestInit): Promise<ComputeStatus> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(`Cannot reach the bridge at ${url}. Start it with "npm run bridge".`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `The bridge responded ${res.status}`);
  }
  return (await res.json()) as ComputeStatus;
}

const bridge = () => trimSlash(bridgeHttpUrl(effectiveConfig().stt.wsUrl));

export const getCompute = () => call(`${bridge()}/api/config/compute`);

export type KaggleHealth = NonNullable<ComputeStatus['remote']>;

/** Is the Kaggle server there, and what does it run? Nothing is switched. An empty key means the saved one. */
export async function checkKaggle(url: string, key: string): Promise<KaggleHealth> {
  const res = await fetch(`${bridge()}/api/config/compute/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remote_url: url, remote_key: key }) }).catch(() => null);
  if (!res) return { ok: false, error: 'Cannot reach the bridge. Start it with "npm run bridge".' };
  if (res.status === 404) return { ok: false, error: 'The bridge is out of date — restart it ("npm run bridge").' };
  return (await res.json()) as KaggleHealth;
}

/** The app's language model address for a mode: the bridge's proxies away from home, the local Ollama otherwise. */
export function llmUrlFor(mode: ComputeMode): string {
  if (mode === 'remote') return `${bridge()}/ollama`;
  if (mode === 'openrouter') return `${bridge()}/openrouter/api`;
  return recall(LOCAL_LLM_URL_KEY) || aiConfig.llm.apiUrl;
}

/** The language model is not this computer's own: it goes through one of the bridge's proxies. */
const isAway = (apiUrl: string) => apiUrl.endsWith('/ollama') || apiUrl.endsWith('/openrouter/api');

/**
 * Move the models. The bridge checks the new place first (the remote server's key, speech model and
 * Ollama; or OpenRouter's key) before anything switches; then the language model is pointed there and,
 * where it runs on a GPU of ours, loaded and its cache primed. Resolves with the new status and, when the
 * language model could not be loaded, why.
 */
export async function switchCompute(
  mode: ComputeMode,
  remote?: { url: string; key: string; speech?: RemoteSpeech; model?: string },
  openrouter?: { key: string; model: string },
  /** Where speech recognition runs; left out, it goes with the language model (Kaggle ↔ Kaggle, else here). */
  speechPlace?: SpeechPlace,
): Promise<{ status: ComputeStatus; problem: string | null }> {
  const status = await call(`${bridge()}/api/config/compute`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode,
      speech: speechPlace ?? (mode === 'remote' ? 'remote' : 'local'),
      remote_url: remote?.url ?? '',
      remote_key: remote?.key ?? '',
      remote_engine: remote?.speech ?? 'whisper',
      openrouter_key: openrouter?.key ?? '',
      openrouter_model: openrouter?.model ?? '',
    }),
  });
  const llm = effectiveConfig().llm;
  const wasAway = isAway(llm.apiUrl);
  if (mode !== 'local' && !wasAway) {
    remember(LOCAL_LLM_URL_KEY, llm.apiUrl);
    remember(LOCAL_LLM_MODEL_KEY, llm.model);
    // The local GPU is not needed any more: free it.
    if (llm.provider === 'ollama') await unloadOllamaModel(llm.apiUrl, llm.model).catch(() => undefined);
  }
  if (mode === 'openrouter') {
    const model = openrouter?.model || status.openrouter_model || DEFAULT_OPENROUTER_LLM;
    setAIOverride({ ...getAIOverride(), llm: { ...llm, provider: 'openai-compatible', apiUrl: llmUrlFor('openrouter'), model } });
    const controller = getVoiceController();
    controller.reconfigure();
    return { status, problem: await controller.warmUp() };
  }
  // Remote: the model the provider picked there. Back home: the model this computer ran before.
  const fromCloud = llm.provider === 'openai-compatible' && llm.apiUrl.endsWith('/openrouter/api');
  const model =
    mode === 'remote'
      ? (remote?.model ?? (fromCloud ? REMOTE_LLMS[0].name : llm.model))
      : wasAway
        ? (recall(LOCAL_LLM_MODEL_KEY) ?? aiConfig.llm.model)
        : llm.model;
  const models = status.remote?.ollama?.models ?? [];
  if (mode === 'remote' && models.length && !models.includes(model)) {
    return { status, problem: `The remote server does not have ${model} (it has ${models.join(', ')}). Run the updated careflow_kaggle.ipynb, or "ollama pull ${model}" there.` };
  }
  setAIOverride({ ...getAIOverride(), llm: { ...llm, provider: 'ollama', apiUrl: llmUrlFor(mode), model } });
  const controller = getVoiceController();
  controller.reconfigure();
  const problem = await controller.warmUp();
  return { status, problem };
}

/**
 * While the AI runs remotely: change only the language model there (qwen3.5:4b ↔ qwen3.5:9b). Speech
 * recognition is untouched; the old model is unloaded so the GPU holds one language model at a time.
 */
export async function switchRemoteModel(model: string): Promise<string | null> {
  const llm = effectiveConfig().llm;
  if (llm.model === model) return null;
  await unloadOllamaModel(llm.apiUrl, llm.model).catch(() => undefined);
  setAIOverride({ ...getAIOverride(), llm: { ...llm, model } });
  const controller = getVoiceController();
  controller.reconfigure();
  return controller.warmUp();
}
