/**
 * The assistant's configuration.
 *
 * Speech is transcribed by Omi Med STT, streamed live over the bridge's
 * WebSocket; every decision about what to do is made by the local model
 * through tool calling. There is no rule-based path.
 *
 * Environment variables give the defaults. The Configuration page saves the
 * provider's choices on top of them (model runtime, model, performance knobs,
 * bridge address) in this browser; the Omi Med STT model, backend and timings
 * are saved by the bridge itself (python/stt_settings.json).
 */
export type LLMProviderKind = 'ollama' | 'openai-compatible' | 'bridge';

export interface AIConfig {
  stt: {
    /** WebSocket of the bridge's streaming endpoint. */
    wsUrl: string;
  };
  llm: {
    provider: LLMProviderKind;
    apiUrl: string;
    model: string;
    timeoutMs: number;
    /** Layers offloaded to the GPU (99 = all). Without it Ollama may split the model and run 3× slower. */
    numGpu: number;
    /** Context window: the system prompt with every tool schema, the conversation and tool results. */
    numCtx: number;
    /** Most model calls one utterance may take (tool call → result → next tool …). */
    maxSteps: number;
  };
  enableVoice: boolean;
  enableDebugPanel: boolean;
  appName: string;
}

const env = import.meta.env;
const bool = (v: string | undefined, fallback: boolean) => (v === undefined ? fallback : v === 'true' || v === '1');
const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

/** The defaults, from the environment. */
export const aiConfig: AIConfig = {
  stt: {
    wsUrl: env.VITE_STT_WS_URL || 'ws://127.0.0.1:8765/ws/stt',
  },
  llm: {
    provider: (env.VITE_LLM_PROVIDER as LLMProviderKind) || 'ollama',
    apiUrl: env.VITE_LLM_API_URL || 'http://127.0.0.1:11434',
    model: env.VITE_LLM_MODEL || 'qwen3.5:4b',
    timeoutMs: num(env.VITE_LLM_TIMEOUT_MS, 90000),
    numGpu: num(env.VITE_LLM_NUM_GPU, 99),
    numCtx: num(env.VITE_LLM_NUM_CTX, 12288),
    maxSteps: num(env.VITE_AGENT_MAX_STEPS, 8),
  },
  enableVoice: bool(env.VITE_ENABLE_VOICE, true),
  enableDebugPanel: bool(env.VITE_ENABLE_DEBUG_PANEL, true),
  appName: env.VITE_APP_NAME || 'CareFlow PMS',
};

/** What the Configuration page saved in this browser, on top of the defaults. */
export interface AIOverride {
  llm?: Partial<AIConfig['llm']>;
  stt?: Partial<AIConfig['stt']>;
}

const OVERRIDE_KEY = 'careflow.ai.config';

export function getAIOverride(): AIOverride {
  try {
    const parsed = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '{}') as AIOverride;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setAIOverride(override: AIOverride) {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(override));
  } catch {
    /* storage unavailable — the choice lasts for this page only */
  }
}

export function clearAIOverride() {
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function effectiveConfig(): AIConfig {
  const o = getAIOverride();
  return { ...aiConfig, llm: { ...aiConfig.llm, ...o.llm }, stt: { ...aiConfig.stt, ...o.stt } };
}

/** The bridge's HTTP address, from its streaming WebSocket address (ws://host:port/ws/stt → http://host:port). */
export function bridgeHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):/, 'http$1:').replace(/\/ws\/stt\/?$/, '');
}
