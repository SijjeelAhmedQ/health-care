/**
 * Where the AI runs — the top-level switch that moves BOTH models together:
 *
 *   local   speech recognition (Omi Med STT) and the language model (Qwen, local Ollama) on this computer
 *   remote  both on a remote GPU server (python/kaggle/careflow_gpu_server.py, e.g. a Kaggle T4)
 *
 * The bridge switches the speech engine and forwards the language model (`/ollama` proxy); the app
 * points its Ollama address at that proxy while remote and back at the local Ollama afterwards.
 */
import { getVoiceController } from './voiceController';
import { aiConfig, bridgeHttpUrl, effectiveConfig, getAIOverride, setAIOverride } from './config';
import { unloadOllamaModel } from './modelCatalog';

export type ComputeMode = 'local' | 'remote';
export type RemoteSpeech = 'whisper' | 'omi';

/** The language models the Kaggle notebook installs — the provider picks one while the AI runs there. */
export const REMOTE_LLMS = [
  { name: 'qwen3.5:4b', hint: 'faster replies' },
  { name: 'qwen3.5:9b', hint: 'better at long, many-part requests; slower' },
] as const;

export interface ComputeStatus {
  mode: ComputeMode;
  remote_url: string;
  /** The speech model on the remote server: whisper (best with non-US accents) or omi. */
  remote_engine?: RemoteSpeech;
  has_key: boolean;
  remote: { ok?: boolean; error?: string; model?: string; device?: string; gpu?: string | null; engines?: Record<string, { model: string; device: string }>; ollama?: { ok: boolean; models?: string[]; error?: string } } | null;
  stt: { engine: string; ready: boolean; error?: string | null };
}

const LOCAL_LLM_URL_KEY = 'careflow.compute.localLlmUrl';
/** The model this computer ran before switching to remote — it comes back with "This computer". */
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

/** The app's language model address for a mode: the bridge's proxy while remote, the local Ollama otherwise. */
export function llmUrlFor(mode: ComputeMode): string {
  if (mode === 'remote') return `${bridge()}/ollama`;
  return recall(LOCAL_LLM_URL_KEY) || aiConfig.llm.apiUrl;
}

/**
 * Move both models. The bridge checks the remote server (key, speech model, Ollama) before anything
 * switches; then the language model is pointed at the new place, loaded and its cache primed.
 * Resolves with the new status and, when the language model could not be loaded, why.
 */
export async function switchCompute(
  mode: ComputeMode,
  remote?: { url: string; key: string; speech?: RemoteSpeech; model?: string },
): Promise<{ status: ComputeStatus; problem: string | null }> {
  const status = await call(`${bridge()}/api/config/compute`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, remote_url: remote?.url ?? '', remote_key: remote?.key ?? '', remote_engine: remote?.speech ?? 'whisper' }),
  });
  const llm = effectiveConfig().llm;
  const wasRemote = llm.apiUrl.endsWith('/ollama');
  if (mode === 'remote' && !wasRemote) {
    remember(LOCAL_LLM_URL_KEY, llm.apiUrl);
    remember(LOCAL_LLM_MODEL_KEY, llm.model);
    // The local GPU is not needed any more: free it.
    if (llm.provider === 'ollama') await unloadOllamaModel(llm.apiUrl, llm.model).catch(() => undefined);
  }
  // Remote: the model the provider picked there. Back home: the model this computer ran before.
  const model = mode === 'remote' ? (remote?.model ?? llm.model) : wasRemote ? (recall(LOCAL_LLM_MODEL_KEY) ?? aiConfig.llm.model) : llm.model;
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
