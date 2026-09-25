/**
 * The Configuration page in the real application, with the model runtime and
 * the bridge answered by a fake `fetch`: the model list is read live (a model
 * "pulled" while the page is open appears), a model that cannot call tools
 * cannot be chosen, applying switches the real assistant, and the Omi Med STT
 * settings go to the bridge.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/store';
import { login } from '@/store/slices/authSlice';
import { getAIOverride, clearAIOverride } from '@/services/ai/config';
import { getVoiceController } from '@/services/ai/voiceController';
import { installBrowserStubs, pageText, renderAppAt, unmountApp, wait, waitUntil } from './harness';

const TIMEOUT = 30000;

const tag = (name: string, caps: string[], size = '4.7B') => ({ name, size: 3.4e9, modified_at: '2026-09-20T00:00:00Z', capabilities: caps, details: { family: 'qwen35', parameter_size: size, quantization_level: 'Q4_K_M' } });

let installed = [tag('qwen3.5:4b', ['completion', 'tools']), tag('gemma-no-tools:2b', ['completion'], '2B')];
const requests: Array<{ url: string; method: string; body?: unknown }> = [];
let sttSettings = { engine: 'gguf', repo: 'omi-health/omi-med-stt-v1-gguf', gguf_file: 'omi-med-stt-v1-q8_0.gguf', backend: 'cpu', threads: 0, endpoint_ms: 900, partial_ms: 500, record: false };

const sttConfig = () => ({
  settings: sttSettings,
  engine: { engine: 'gguf (omi-med-stt-v1-gguf / parakeet.cpp cpu)', model: sttSettings.repo, ready: true },
  models: [
    { id: 'omi-health/omi-med-stt-v1-gguf::omi-med-stt-v1-q8_0.gguf', repo: 'omi-health/omi-med-stt-v1-gguf', engine: 'gguf', gguf_file: 'omi-med-stt-v1-q8_0.gguf', label: 'Omi Med STT v1 · GGUF q8_0', downloaded: true, download_mb: null, available: true, reason: '' },
    { id: 'omi-health/omi-med-stt-v1-mlx-q8', repo: 'omi-health/omi-med-stt-v1-mlx-q8', engine: 'mlx', gguf_file: null, label: 'Omi Med STT v1 · MLX 8-bit', downloaded: false, download_mb: 700, available: false, reason: 'MLX builds run only on Apple Silicon Macs' },
  ],
  backends: [
    { id: 'cpu', installed: true, available: true, reason: '' },
    { id: 'cuda', installed: false, available: false, reason: 'Building it needs CMake, the CUDA Toolkit' },
    { id: 'vulkan', installed: false, available: false, reason: 'Building it needs CMake, the Vulkan SDK' },
  ],
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeAll(installBrowserStubs);

beforeEach(async () => {
  clearAIOverride();
  installed = [tag('qwen3.5:4b', ['completion', 'tools']), tag('gemma-no-tools:2b', ['completion'], '2B')];
  requests.length = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method, body });
    if (url.endsWith('/api/tags')) return json({ models: installed });
    if (url.endsWith('/api/generate')) return json({ done: true });
    if (url.endsWith('/api/chat')) return json({ message: { content: '', tool_calls: [{ function: { name: 'open_page', arguments: { page: 'dashboard' } } }] } });
    if (url.endsWith('/api/config/compute') && method === 'GET') return json({ mode: 'local', remote_url: '', has_key: false, remote: null, stt: sttConfig().engine });
    if (url.endsWith('/api/config/stt') && method === 'GET') return json(sttConfig());
    if (url.endsWith('/api/config/stt') && method === 'PUT') {
      sttSettings = body;
      return json(sttConfig());
    }
    return json({}, 404);
  });
  await store.dispatch(login({ username: 'sahmed', password: 'demo' })).unwrap();
});

afterEach(async () => {
  await unmountApp();
  vi.unstubAllGlobals();
  clearAIOverride();
  getVoiceController().reconfigure();
});

/** Open an antd Select (by its index on the page) and return its visible options. */
async function openSelect(index: number) {
  const selectors = document.querySelectorAll('.config-grid .ant-select-selector');
  const el = selectors[index] as HTMLElement;
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await waitUntil(() => document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').length > 0);
  return Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')) as HTMLElement[];
}

const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;

describe('Configuration', () => {
  it('lists the installed models live, marks tool calling, and shows a newly pulled model', async () => {
    await renderAppAt('/configuration', () => pageText().includes('2 models installed'));
    const options = await openSelect(0);
    const byName = (n: string) => options.find((o) => o.textContent?.includes(n))!;
    expect(byName('qwen3.5:4b').textContent).toContain('tool calling');
    expect(byName('gemma-no-tools:2b').textContent).toContain('no tool calling');
    expect(byName('gemma-no-tools:2b').className).toContain('ant-select-item-option-disabled');

    // `ollama pull qwen3.5:2b` in a terminal, then back to the app.
    installed = [...installed, tag('qwen3.5:2b', ['completion', 'tools'], '2.3B')];
    window.dispatchEvent(new Event('focus'));
    await waitUntil(() => pageText().includes('3 models installed'));
    expect(pageText()).toContain('3 models installed');
  }, TIMEOUT);

  it('applying a model switches the real assistant, frees the old model and loads the new one', async () => {
    installed = [...installed, tag('qwen3.5:2b', ['completion', 'tools'], '2.3B')];
    await renderAppAt('/configuration', () => pageText().includes('3 models installed'));
    const options = await openSelect(0);
    options.find((o) => o.textContent?.includes('qwen3.5:2b'))!.click();
    await wait(50);
    button('Save and apply').click();
    await waitUntil(() => pageText().includes('is loaded and ready'));

    expect(getAIOverride().llm?.model).toBe('qwen3.5:2b');
    expect(store.getState().voice.llmProvider).toBe('ollama:qwen3.5:2b');
    expect(requests.some((r) => r.url.endsWith('/api/generate') && (r.body as { model: string; keep_alive: number }).model === 'qwen3.5:4b' && (r.body as { keep_alive: number }).keep_alive === 0)).toBe(true);
    const warm = requests.filter((r) => r.url.endsWith('/api/chat')).at(-1)!.body as { model: string; tools: unknown[] };
    expect(warm.model).toBe('qwen3.5:2b');
    expect(warm.tools.length).toBeGreaterThan(20);
  }, TIMEOUT);

  it('Test proves the model calls tools', async () => {
    await renderAppAt('/configuration', () => pageText().includes('models installed'));
    button('Test').click();
    await waitUntil(() => pageText().includes('Works with the assistant'));
    expect(pageText()).toContain('Called open_page');
  }, TIMEOUT);

  it('shows the Omi Med STT models and backends this machine can run, and saves changes to the bridge', async () => {
    await renderAppAt('/configuration', () => pageText().includes('Running:'));
    const text = pageText();
    expect(text).toContain('gguf (omi-med-stt-v1-gguf / parakeet.cpp cpu)');
    expect(text).toContain('Building it needs CMake, the CUDA Toolkit');
    const cuda = Array.from(document.querySelectorAll('.ant-radio-wrapper')).find((r) => r.textContent?.includes('CUDA'))!;
    expect(cuda.className).toContain('ant-radio-wrapper-disabled');

    const options = await openSelect(1);
    const mlx = options.find((o) => o.textContent?.includes('MLX 8-bit'))!;
    expect(mlx.className).toContain('ant-select-item-option-disabled');
    expect(mlx.textContent).toContain('Apple Silicon');

    // Threads is a plain number field: change it and save.
    const threads = Array.from(document.querySelectorAll('.config-field')).find((f) => f.textContent?.startsWith('CPU threads'))!.querySelector('input') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(threads, '4');
    threads.dispatchEvent(new Event('input', { bubbles: true }));
    threads.dispatchEvent(new Event('blur', { bubbles: true }));
    await waitUntil(() => !sttSave().disabled);
    sttSave().click();
    await waitUntil(() => requests.some((r) => r.url.endsWith('/api/config/stt') && r.method === 'PUT'));
    const put = requests.find((r) => r.method === 'PUT')!.body as { threads: number; repo: string };
    expect(put.threads).toBe(4);
    expect(put.repo).toBe('omi-health/omi-med-stt-v1-gguf');
  }, TIMEOUT);

  it('"Where the AI runs": switching to the Kaggle GPU moves both models — speech on the bridge, Qwen through its proxy', async () => {
    let computeBody: { mode: string; remote_url: string; remote_key: string } | undefined;
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/config/compute') && init?.method === 'PUT') {
        computeBody = JSON.parse(String(init.body));
        return json({ mode: 'remote', remote_url: computeBody!.remote_url, has_key: true, remote: { ok: true, model: 'omi-med-stt-v1 (gguf q8_0)', device: 'cuda', gpu: 'Tesla T4', ollama: { ok: true, models: ['qwen3.5:4b'] } }, stt: { engine: 'remote (omi-med-stt-v1 on cuda)', ready: true } });
      }
      return base(input, init);
    });
    await renderAppAt('/configuration', () => pageText().includes('Where the AI runs'));
    (Array.from(document.querySelectorAll('input[type="radio"]')).find((r) => (r as HTMLInputElement).value === 'remote') as HTMLInputElement).click();
    await waitUntil(() => !!document.querySelector('#compute-url'));
    const type = (id: string, value: string) => {
      const el = document.querySelector(id) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('#compute-url', 'https://thick-knives-lie.loca.lt');
    type('#compute-key', 'secret');
    await wait(50);
    button('Switch to the Kaggle GPU').click();
    await waitUntil(() => pageText().includes('Tesla T4'));

    expect(computeBody).toEqual({ mode: 'remote', remote_url: 'https://thick-knives-lie.loca.lt', remote_key: 'secret', remote_engine: 'whisper' });
    // The language model now goes through the bridge, which forwards to the Kaggle server.
    expect(getAIOverride().llm?.apiUrl).toMatch(/127\.0\.0\.1:8765\/ollama$/);
    expect(requests.some((r) => r.url.endsWith('/ollama/api/chat'))).toBe(true);
  }, TIMEOUT);

  it('says so when the bridge is not running', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/api/tags')) return json({ models: installed });
      throw new TypeError('Failed to fetch');
    });
    await renderAppAt('/configuration', () => pageText().includes('The bridge is not reachable'));
    expect(pageText()).toContain('npm run bridge');
  }, TIMEOUT);
});

/** The speech section's "Save and apply" (the second one on the page). */
function sttSave() {
  return Array.from(document.querySelectorAll('button')).filter((b) => b.textContent?.trim().startsWith('Save and apply'))[1] as HTMLButtonElement;
}
