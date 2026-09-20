/** Runtime AI configuration read from Vite environment variables. */
export type AIMode = 'mock' | 'local';
export type STTProviderKind = 'mock' | 'browser' | 'http';
export type LLMProviderKind = 'mock' | 'ollama' | 'openai-compatible' | 'http';

export interface AIConfig {
  mode: AIMode;
  stt: { provider: STTProviderKind; apiUrl: string };
  llm: { provider: LLMProviderKind; apiUrl: string; model: string; timeoutMs: number; numGpu: number; numCtx: number };
  fallbackToRules: boolean;
  enableVoice: boolean;
  enableDebugPanel: boolean;
  appName: string;
}

const env = import.meta.env;
const bool = (v: string | undefined, fallback: boolean) => (v === undefined ? fallback : v === 'true' || v === '1');

export const aiConfig: AIConfig = {
  mode: (env.VITE_AI_MODE as AIMode) || 'mock',
  stt: {
    provider: (env.VITE_STT_PROVIDER as STTProviderKind) || 'browser',
    apiUrl: env.VITE_STT_API_URL || 'http://127.0.0.1:8765/api/stt',
  },
  llm: {
    provider: (env.VITE_LLM_PROVIDER as LLMProviderKind) || 'ollama',
    apiUrl: env.VITE_LLM_API_URL || 'http://127.0.0.1:11434',
    model: env.VITE_LLM_MODEL || 'qwen3.5:4b',
    timeoutMs: Number(env.VITE_LLM_TIMEOUT_MS || 20000),
    /** Layers to offload to the GPU (99 = all). qwen3.5:4b Q4 fits entirely in 4 GB VRAM at num_ctx 4096. */
    numGpu: Number(env.VITE_LLM_NUM_GPU || 99),
    /** Context window; must hold the ~1k-token system prompt + output. Keep small to save VRAM. */
    numCtx: Number(env.VITE_LLM_NUM_CTX || 4096),
  },
  fallbackToRules: bool(env.VITE_AI_FALLBACK_TO_RULES, true),
  enableVoice: bool(env.VITE_ENABLE_VOICE, true),
  enableDebugPanel: bool(env.VITE_ENABLE_DEBUG_PANEL, true),
  appName: env.VITE_APP_NAME || 'CareFlow PMS',
};

/** Allow the dev console to override providers at runtime (persisted in localStorage). */
const OVERRIDE_KEY = 'careflow.ai.override';
export interface AIOverride {
  mode?: AIMode;
  llmProvider?: LLMProviderKind;
  sttProvider?: STTProviderKind;
  llmModel?: string;
  llmApiUrl?: string;
  sttApiUrl?: string;
}
export function getAIOverride(): AIOverride {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '{}') as AIOverride;
  } catch {
    return {};
  }
}
export function setAIOverride(override: AIOverride) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(override));
}
export function effectiveConfig(): AIConfig {
  const o = getAIOverride();
  const mode = o.mode ?? aiConfig.mode;
  return {
    ...aiConfig,
    mode,
    llm: { ...aiConfig.llm, provider: mode === 'mock' ? 'mock' : o.llmProvider ?? aiConfig.llm.provider, model: o.llmModel ?? aiConfig.llm.model, apiUrl: o.llmApiUrl ?? aiConfig.llm.apiUrl },
    stt: { ...aiConfig.stt, provider: o.sttProvider ?? (mode === 'mock' ? 'browser' : aiConfig.stt.provider), apiUrl: o.sttApiUrl ?? aiConfig.stt.apiUrl },
  };
}
