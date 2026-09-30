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
  await store.dispatch(login({ username: 'lwhite', password: 'demo' })).unwrap();
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

  describe('Where the AI runs — Kaggle GPU, Kaggle + OpenRouter, this computer', () => {
    const KAGGLE = 'https://gpu.trycloudflare.com';
    const HEALTH = { ok: true, model: 'whisper-large-v3-turbo', device: 'cuda', gpu: 'Tesla T4, 2199 MiB, 15360 MiB', engines: { whisper: {}, omi: {} }, ollama: { ok: true, models: ['qwen3.5:4b', 'qwen3.5:9b'] } };
    const MODELS = {
      data: [
        { id: 'vendor/newest-model', name: 'Vendor: Newest Model', created: 300, context_length: 100000, pricing: { prompt: '0.000001', completion: '0.000002' }, supported_parameters: ['tools'] },
        { id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', created: 200, context_length: 1050000, pricing: { prompt: '0.0000001', completion: '0.0000005' }, supported_parameters: ['tools'] },
        { id: 'openai/gpt-6-sol', name: 'OpenAI: GPT-6 Sol', created: 100, context_length: 1050000, pricing: { prompt: '0.000002', completion: '0.00001' }, supported_parameters: ['tools'] },
        { id: 'openai/gpt-6-sol:batch', name: 'OpenAI: GPT-6 Sol (batch)', created: 100, pricing: { prompt: '0.000001', completion: '0.000005' }, supported_parameters: ['tools'] },
        { id: 'vendor/no-tools', name: 'Vendor: No Tools', created: 400, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
      ],
    };
    let compute: Record<string, unknown>;
    let kaggleUp: boolean;
    const puts: Array<Record<string, string>> = [];

    /** A bridge that answers like the real one, with a Kaggle server and OpenRouter behind it. */
    const stubBridge = (initial: Record<string, unknown>) => {
      compute = { mode: 'local', speech: 'local', remote_url: '', has_key: false, remote: null, has_openrouter_key: false, openrouter_model: 'openai/gpt-6-sol', openrouter: null, stt: sttConfig().engine, ...initial };
      kaggleUp = true;
      puts.length = 0;
      const base = globalThis.fetch;
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/config/compute/check')) return json(kaggleUp ? HEALTH : { ok: false, error: `Cannot reach the remote GPU server at ${KAGGLE}` });
        if (url.endsWith('/api/config/compute')) {
          if (init?.method === 'PUT') {
            const body = JSON.parse(String(init.body)) as Record<string, string>;
            puts.push(body);
            compute = {
              ...compute,
              mode: body.mode,
              speech: body.speech,
              remote_url: body.remote_url || compute.remote_url,
              remote_engine: body.remote_engine,
              has_key: compute.has_key || !!body.remote_key,
              remote: body.speech === 'remote' ? HEALTH : null,
              has_openrouter_key: compute.has_openrouter_key || !!body.openrouter_key,
              openrouter_model: body.openrouter_model || compute.openrouter_model,
              openrouter: body.mode === 'openrouter' ? { ok: true, limit_remaining: 4.45 } : null,
            };
          }
          return json(compute);
        }
        if (url.includes('/openrouter/api/v1/models')) return json(MODELS);
        return base(input, init);
      });
    };
    const card = (id: string) => document.querySelector(`[data-setup="${id}"]`) as HTMLButtonElement;
    const option = (value: string) => document.querySelector(`.aisetup-option[data-value="${value}"]`) as HTMLButtonElement;
    const apply = () => document.querySelector('.aisetup-apply') as HTMLButtonElement;
    const dock = () => document.querySelector('.aisetup-dock')!.textContent ?? '';
    const type = (selector: string, value: string) => {
      const el = document.querySelector(selector) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const lastChat = () => requests.filter((r) => r.url.endsWith('/api/chat')).at(-1)!;

    it('Kaggle GPU: Whisper and Qwen both on Kaggle — the server is checked before Apply; then Qwen 4B ↔ 9B changes only the model', async () => {
      stubBridge({});
      await renderAppAt('/configuration', () => !!card('kaggle'));
      expect(card('local').getAttribute('aria-checked')).toBe('true'); // what runs now
      expect(apply().disabled).toBe(true); // nothing to apply

      card('kaggle').click();
      await waitUntil(() => !!document.querySelector('#compute-url'));
      type('#compute-url', KAGGLE);
      type('#compute-key', 'secret');
      await waitUntil(() => pageText().includes('Connected · Tesla T4'), 4000); // checked, nothing switched yet
      expect(puts).toHaveLength(0);
      option('qwen3.5:9b').click();
      await wait(50);
      expect(dock()).toContain('Whisper large-v3-turbo · Kaggle GPU');
      expect(dock()).toContain('qwen3.5:9b · Kaggle GPU');
      apply().click();
      await waitUntil(() => getAIOverride().llm?.model === 'qwen3.5:9b');
      expect(puts[0]).toMatchObject({ mode: 'remote', speech: 'remote', remote_url: KAGGLE, remote_key: 'secret', remote_engine: 'whisper' });
      expect(getAIOverride().llm?.apiUrl).toMatch(/127\.0\.0\.1:8765\/ollama$/);
      await waitUntil(() => lastChat().url.endsWith('/ollama/api/chat') && (lastChat().body as { model: string }).model === 'qwen3.5:9b');

      // Same server: only the model changes — the Kaggle server is not switched again, the 9B leaves the GPU.
      await waitUntil(() => card('kaggle').textContent!.includes('In use'));
      expect(pageText()).toContain('Server key saved on the bridge'); // no key field once it is saved
      option('qwen3.5:4b').click();
      await wait(50);
      apply().click();
      await waitUntil(() => getAIOverride().llm?.model === 'qwen3.5:4b');
      expect(puts).toHaveLength(1);
      expect(requests.some((r) => r.url.endsWith('/ollama/api/generate') && (r.body as { model: string; keep_alive: number }).model === 'qwen3.5:9b' && (r.body as { keep_alive: number }).keep_alive === 0)).toBe(true);
    }, TIMEOUT);

    it('Kaggle + OpenRouter: Whisper stays on Kaggle, any tool-calling model thinks — no key fields when the keys are saved, CareFlow’s picks first', async () => {
      stubBridge({ mode: 'remote', speech: 'remote', remote_url: KAGGLE, has_key: true, remote: HEALTH, has_openrouter_key: true });
      await renderAppAt('/configuration', () => !!card('hybrid'));
      card('hybrid').click();
      await waitUntil(() => !!document.querySelector('.openrouter-model-select'));
      expect(document.querySelector('#compute-key')).toBeNull();
      expect(document.querySelector('#openrouter-key')).toBeNull();
      expect(pageText()).toContain('OpenRouter API key set up on the bridge');
      await waitUntil(() => pageText().includes('3 models call tools'));

      (document.querySelector('.openrouter-model-select .ant-select-selector') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await waitUntil(() => document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').length >= 3);
      const listed = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')];
      expect(listed[0].textContent).toContain('GPT-6 Sol');
      expect(listed[0].textContent).toContain('$2 in · $10 out /M');
      expect(listed[1].textContent).toContain('GPT-6 Luna');
      expect(listed.at(-1)!.textContent).toContain('Newest Model');
      expect(listed.map((o) => o.textContent).join(' ')).not.toMatch(/No Tools|batch/);
      (listed[1] as HTMLElement).click();
      await wait(50);

      expect(dock()).toContain('Whisper large-v3-turbo · Kaggle GPU');
      expect(dock()).toContain('GPT-6 Luna · OpenRouter');
      apply().click();
      await waitUntil(() => getAIOverride().llm?.provider === 'openai-compatible');
      expect(puts[0]).toMatchObject({ mode: 'openrouter', speech: 'remote', remote_url: KAGGLE, remote_key: '', openrouter_key: '', openrouter_model: 'openai/gpt-6-luna' });
      expect(getAIOverride().llm).toMatchObject({ apiUrl: 'http://127.0.0.1:8765/openrouter/api', model: 'openai/gpt-6-luna' });
      expect(store.getState().voice.llmProvider).toBe('openrouter:openai/gpt-6-luna');
      await waitUntil(() => (document.querySelector('.aisetup-now')?.textContent ?? '').includes('GPT-6 Luna · OpenRouter'));
      expect(document.querySelector('.aisetup-now')!.textContent).toContain('Whisper large-v3-turbo · Kaggle');
      expect(document.querySelector('.aisetup-now')!.textContent).toContain('$4.45 left');

      // And back to this computer: the local Ollama and the model it ran before.
      card('local').click();
      await wait(50);
      apply().click();
      await waitUntil(() => getAIOverride().llm?.provider === 'ollama');
      expect(puts.at(-1)).toMatchObject({ mode: 'local', speech: 'local' });
      expect(getAIOverride().llm).toMatchObject({ apiUrl: 'http://127.0.0.1:11434', model: 'qwen3.5:4b' });
    }, TIMEOUT);

    it('a Kaggle server that does not answer is said plainly — before anything is switched', async () => {
      stubBridge({ remote_url: KAGGLE, has_key: true });
      kaggleUp = false;
      await renderAppAt('/configuration', () => !!card('hybrid'));
      card('hybrid').click();
      await waitUntil(() => pageText().includes('Not reachable'), 4000);
      expect(pageText()).toContain(`Cannot reach the remote GPU server at ${KAGGLE}`);
      expect(puts).toHaveLength(0);
    }, TIMEOUT);
  });

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
