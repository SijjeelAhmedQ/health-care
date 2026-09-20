import { AICommandListSchema, type AICommand } from '@/types/ai';

export class CommandParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'CommandParseError';
  }
}

/**
 * Extract the first JSON value (object or array) from model output that may
 * contain <think> blocks, markdown fences or explanatory prose.
 */
export function extractJson(raw: string): string | null {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = Math.min(...['{', '['].map((c) => text.indexOf(c)).filter((i) => i >= 0));
  if (!Number.isFinite(start)) return null;
  // Walk to the matching bracket to tolerate trailing prose.
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse + validate raw model output into a list of AICommands. Throws CommandParseError. */
export function parseCommands(raw: string): AICommand[] {
  const json = extractJson(raw);
  if (!json) throw new CommandParseError('Model output did not contain JSON', raw);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new CommandParseError(`Invalid JSON: ${(e as Error).message}`, raw);
  }
  // Accept {"commands":[...]} envelopes as well.
  if (value && typeof value === 'object' && !Array.isArray(value) && 'commands' in (value as Record<string, unknown>)) {
    value = (value as { commands: unknown }).commands;
  }
  const result = AICommandListSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new CommandParseError(`Command failed validation: ${issue?.path.join('.') || 'root'} ${issue?.message ?? ''}`.trim(), raw);
  }
  return result.data;
}

/** Validate an already-parsed object (used by tests and the dev console). */
export function validateCommands(value: unknown): AICommand[] {
  const result = AICommandListSchema.safeParse(value);
  if (!result.success) throw new CommandParseError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), JSON.stringify(value));
  return result.data;
}
