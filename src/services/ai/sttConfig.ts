/**
 * Omi Med STT settings live on the bridge (it runs the model): which model,
 * engine, backend and threads, and the streaming timings. The bridge also
 * reports every model and backend it can use on this machine.
 */
export interface SttSettings {
  engine: 'gguf' | 'mlx' | 'onnx' | 'remote' | 'mock';
  repo: string;
  gguf_file: string | null;
  backend: 'cpu' | 'cuda' | 'vulkan';
  threads: number;
  endpoint_ms: number;
  partial_ms: number;
  /** ONNX models (Parakeet): int8 (small, fastest on the CPU) or fp32 (the one that runs on a GPU). */
  precision?: 'int8' | 'fp32';
  /** engine "remote": the GPU server that transcribes (python/kaggle/careflow_gpu_server.py, e.g. a Kaggle T4). */
  remote_url?: string;
  remote_key?: string;
  remote_engine?: string;
  /** Keep every utterance's audio, transcript and what the assistant did with it (python/recordings). */
  record: boolean;
  /** The second recogniser ('' = off, 'base.en', 'small.en'): re-hears each sentence with the app's names. */
  refine?: string;
}

export interface SttRefinerOption {
  id: string;
  label: string;
  note: string;
}

export interface SttModelOption {
  id: string;
  repo: string;
  engine: 'gguf' | 'mlx' | 'onnx' | 'remote';
  gguf_file: string | null;
  label: string;
  downloaded: boolean;
  download_mb: number | null;
  /** ONNX models: which precisions are already on disk, and each one's download size. */
  downloaded_precisions?: Array<'int8' | 'fp32'>;
  download_mb_by_precision?: Record<'int8' | 'fp32', number>;
  available: boolean;
  reason: string;
}

export interface SttBackendOption {
  id: 'cpu' | 'cuda' | 'vulkan';
  installed: boolean;
  available: boolean;
  reason: string;
}

export interface SttConfig {
  settings: SttSettings;
  models: SttModelOption[];
  backends: SttBackendOption[];
  engine: { engine: string; model: string; ready: boolean; error?: string | null; backend?: string; threads?: number; gpu?: string | null; latency_ms?: number };
  /** Devices an ONNX model can run on here (CPU; the GPU when ONNX Runtime has CUDA). */
  onnx_backends?: SttBackendOption[];
  refiners?: SttRefinerOption[];
  refiner?: { engine: string; model: string; ready: boolean; error?: string | null } | null;
}

const trimSlash = (u: string) => u.replace(/\/$/, '');

async function call(url: string, init?: RequestInit, timeoutMs = 10000): Promise<SttConfig> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new Error((e as Error).name === 'AbortError' ? `${url} did not answer in time` : `Cannot reach the bridge at ${url}. Start it with "npm run bridge".`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `The bridge responded ${res.status}`);
  }
  return (await res.json()) as SttConfig;
}

export const getSttConfig = (bridgeUrl: string) => call(`${trimSlash(bridgeUrl)}/api/config/stt`);

/** Loading another model (or building a backend) can take minutes; the running model serves until it is ready. */
export const saveSttConfig = (bridgeUrl: string, settings: SttSettings) =>
  call(`${trimSlash(bridgeUrl)}/api/config/stt`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }, 30 * 60 * 1000);

/** What the assistant did with a transcript, stored next to its audio while diagnostics recording is on. */
export function postDiagnosticTrace(bridgeUrl: string, entry: Record<string, unknown>): void {
  void fetch(`${trimSlash(bridgeUrl)}/api/diagnostics/trace`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => undefined);
}
