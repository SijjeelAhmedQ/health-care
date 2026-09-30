import { describe, expect, it } from 'vitest';
import { plansLongRequests } from '../config';
import { buildTools } from '../agent/tools';
import { parseArgs } from '../agent/tool';

describe('per-model rules', () => {
  it('only qwen3.5:9b does long requests in one go — every other model plans as before', () => {
    expect(plansLongRequests({ model: 'qwen3.5:9b', planSteps: true })).toBe(false);
    for (const model of ['qwen3.5:4b', 'openai/gpt-6-luna', 'openai/gpt-oss-120b', 'qwen/qwen3.5-9b', 'deepseek/deepseek-v4.1-flash']) {
      expect(plansLongRequests({ model, planSteps: true })).toBe(true);
      expect(plansLongRequests({ model, planSteps: undefined })).toBe(true);
    }
    expect(plansLongRequests({ model: 'qwen3.5:4b', planSteps: false })).toBe(false); // the switch still turns it off
  });

  it('select_patient takes open_tab "summary" as the Summary itself instead of refusing it; real tabs and wrong values as before', () => {
    const tool = buildTools().find((t) => t.name === 'select_patient')!;
    expect(parseArgs(tool, { patient: 'Tom Baker', open_tab: 'summary' })).toEqual({ ok: true, args: { patient: 'Tom Baker' } });
    expect(parseArgs(tool, { patient: 'Tom Baker', open_tab: 'summary-task' })).toEqual({ ok: true, args: { patient: 'Tom Baker', open_tab: 'summary-task' } });
    expect(parseArgs(tool, { patient: 'Tom Baker', open_tab: 'inbox' }).ok).toBe(false);
  });
});
