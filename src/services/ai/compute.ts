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
  try {
    return localStorage.getItem(LOCAL_LLM_URL_KEY) || aiConfig.llm.apiUrl;
  } catch {
    return aiConfig.llm.apiUrl;
  }
}

/**
 * Move both models. The bridge checks the remote server (key, speech model, Ollama) before anything
 * switches; then the language model is pointed at the new place, loaded and its cache primed.
 * Resolves with the new status and, when the language model could not be loaded, why.
 */
export async function switchCompute(mode: ComputeMode, remote?: { url: string; key: string; speech?: RemoteSpeech }): Promise<{ status: ComputeStatus; problem: string | null }> {
  const status = await call(`${bridge()}/api/config/compute`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, remote_url: remote?.url ?? '', remote_key: remote?.key ?? '', remote_engine: remote?.speech ?? 'whisper' }),
  });
  const llm = effectiveConfig().llm;
  if (mode === 'remote' && !llm.apiUrl.endsWith('/ollama')) {
    try {
      localStorage.setItem(LOCAL_LLM_URL_KEY, llm.apiUrl);
    } catch {
      /* private mode: the default local address is used on the way back */
    }
    // The local GPU is not needed any more: free it.
    if (llm.provider === 'ollama') await unloadOllamaModel(llm.apiUrl, llm.model).catch(() => undefined);
  }
  const models = status.remote?.ollama?.models ?? [];
  if (mode === 'remote' && models.length && !models.includes(llm.model)) {
    return { status, problem: `The remote server does not have ${llm.model} (it has ${models.join(', ')}). Run "ollama pull ${llm.model}" there.` };
  }
  setAIOverride({ ...getAIOverride(), llm: { ...llm, provider: 'ollama', apiUrl: llmUrlFor(mode) } });
  const controller = getVoiceController();
  controller.reconfigure();
  const problem = await controller.warmUp();
  return { status, problem };
}
