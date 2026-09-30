import { describe, expect, it } from 'vitest';
import { buildTools } from '../agent/tools';
import { toToolSchema } from '../agent/tool';

/** Every key/value in a schema, however deep. */
function* walk(node: unknown, path = ''): Generator<[string, string, unknown]> {
  if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) yield* walk(v, `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      yield [path, k, v];
      yield* walk(v, `${path}.${k}`);
    }
  }
}

describe('tool schemas', () => {
  it('are valid JSON Schema for OpenAI-style providers — a strict bound is a number, never true/false', () => {
    // OpenAI refused every request with "Invalid schema for function 'control_list': True is not of type 'number'".
    const bad = buildTools()
      .map(toToolSchema)
      .flatMap((s) => [...walk(s.function.parameters)].filter(([, k, v]) => (k === 'exclusiveMinimum' || k === 'exclusiveMaximum') && typeof v !== 'number').map(([p, k]) => `${s.function.name}${p}.${k}`));
    expect(bad).toEqual([]);
  });

  it('keeps the bound: a page number is above 0', () => {
    const list = toToolSchema(buildTools().find((t) => t.name === 'control_list')!);
    const page = (list.function.parameters as { properties: { page: { anyOf: Array<Record<string, unknown>> } } }).properties.page;
    expect(page.anyOf.some((s) => s.type === 'integer' && s.exclusiveMinimum === 0)).toBe(true);
  });
});
