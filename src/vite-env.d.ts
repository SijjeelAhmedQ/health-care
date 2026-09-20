/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_MODE?: string;
  readonly VITE_STT_PROVIDER?: string;
  readonly VITE_STT_API_URL?: string;
  readonly VITE_LLM_PROVIDER?: string;
  readonly VITE_LLM_API_URL?: string;
  readonly VITE_LLM_MODEL?: string;
  readonly VITE_LLM_TIMEOUT_MS?: string;
  readonly VITE_LLM_NUM_GPU?: string;
  readonly VITE_LLM_NUM_CTX?: string;
  readonly VITE_AI_FALLBACK_TO_RULES?: string;
  readonly VITE_ENABLE_VOICE?: string;
  readonly VITE_ENABLE_DEBUG_PANEL?: string;
  readonly VITE_APP_NAME?: string;
}
