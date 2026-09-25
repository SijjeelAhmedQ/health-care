/**
 * The agent loop: the model decides, the tools act.
 *
 *   utterance + CONTEXT ──► model ──► tool calls ──► tools run ──► results ──► model ──► … ──► reply
 *
 * Each model turn may call several tools; their results go back to the model,
 * which calls more tools, corrects a failed call, or answers. The loop ends
 * when the model replies without calling a tool, when a tool leaves the app
 * waiting for the user (a question or a confirmation), or after `maxSteps`
 * model calls.
 */
import type { AgentStep, AIContext, ExtractionResult, FieldValues, ToolCall, ToolResult } from '@/types/ai';
import { RECORD_KINDS } from '@/types/records';
import { FieldRegistry, type FieldScalar } from '@/registry/fieldRegistry';
import type { ChatLLM, ChatMessage, ToolSchema } from '../providers/llm';
import { parseArgs, toToolSchema, type Tool } from './tool';
import { buildExtractionMessage, buildSessionMessage, buildUserMessage, SESSION_ACK, SYSTEM_PROMPT, type Exchange } from './prompt';
import { NOTE_FINDINGS_TOOL, recordPlural, WAIT_TOOL } from './tools';
import type { AppRuntime } from './runtime';

export interface AgentOutcome {
  reply: string;
  /** The reply is worth reading aloud (an answer, a question, a confirmation). */
  speak: boolean;
  /** The app is waiting on the user (question or confirmation). */
  awaitingUser: boolean;
  /** The model judged the utterance unfinished: nothing was done, it is held for the next one. */
  deferred: boolean;
  fieldsModified: NonNullable<ToolResult['fieldsModified']>;
}

export interface AgentHooks {
  onStep?(step: AgentStep): void;
  onProgress?(text: string | null): void;
}

let stepCounter = 0;
const stepId = () => `step-${Date.now().toString(36)}-${(stepCounter++).toString(36)}`;

/** What goes back to the model for a tool call. */
function toolMessage(result: ToolResult): string {
  return JSON.stringify(result.data === undefined ? { ok: result.ok, message: result.message } : { ok: result.ok, message: result.message, data: result.data });
}

export class Agent {
  private tools: Tool[] = [];
  private schemas: ToolSchema[] = [];
  private byName = new Map<string, Tool>();
  /** Earlier exchanges (what was said, what was answered), shown in CONTEXT so follow-ups make sense. */
  private earlier: Exchange[] = [];
  private turnCounter = 0;
  static readonly EARLIER_EXCHANGES = 3;
  /** The SESSION message the model's cache was last primed with. */
  private primedSession: string | null = null;

  constructor(
    private readonly llm: ChatLLM,
    private readonly runtime: AppRuntime,
    private readonly buildContext: () => AIContext,
    private readonly maxSteps: number,
  ) {}

  get modelName() {
    return this.llm.name;
  }

  /** (Re)build the tool list — whenever its inputs (e.g. the provider list) change. */
  setTools(tools: Tool[]) {
    this.tools = tools;
    this.schemas = tools.map(toToolSchema);
    this.byName = new Map(tools.map((t) => [t.name, t]));
  }

  get toolNames() {
    return this.tools.map((t) => t.name);
  }

  get toolList(): readonly Tool[] {
    return this.tools;
  }

  /** What every request starts with: the static system prompt, then the day's SESSION exchange. */
  private prefix(ctx: AIContext): ChatMessage[] {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildSessionMessage(ctx) },
      { role: 'assistant', content: SESSION_ACK },
    ];
  }

  /**
   * Load the model and prime its cache with the prefix (system prompt, tools, SESSION), off the
   * first utterance's path. Resolves with an error message when the model could not be loaded, or null.
   */
  async warmUp(): Promise<string | null> {
    if (!this.llm.warmUp) return null;
    const ctx = this.buildContext();
    this.primedSession = buildSessionMessage(ctx);
    return this.llm.warmUp(this.prefix(ctx), this.schemas);
  }

  resetConversation() {
    this.earlier = [];
  }

  contextBlock(said: string, ctx = this.buildContext(), alsoHeard?: string) {
    return buildUserMessage(said, ctx, this.earlier, alsoHeard);
  }

  /** `alsoHeard`: the same speech as a second recogniser (with the app's vocabulary) heard it. */
  async run(said: string, hooks: AgentHooks = {}, signal?: AbortSignal, alsoHeard?: string): Promise<AgentOutcome> {
    const turn = ++this.turnCounter;
    const ctx = this.buildContext();
    const userMessage: ChatMessage = { role: 'user', content: this.contextBlock(said, ctx, alsoHeard) };
    const messages: ChatMessage[] = [...this.prefix(ctx), userMessage];
    // A new day (or another provider) changed the SESSION block: re-prime the cache after this turn.
    const reprime = this.primedSession !== null && buildSessionMessage(ctx) !== this.primedSession;
    const outcome: AgentOutcome = { reply: '', speak: false, awaitingUser: false, deferred: false, fieldsModified: [] };
    let lastToolMessage = '';
    let calledTools = false;
    const seen = new Set<string>();
    let stalls = 0;

    this.runtime.beginTurn(turn);
    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const modelStep: AgentStep = { id: stepId(), type: 'model', startedAt: Date.now() };
        hooks.onStep?.(modelStep);
        hooks.onProgress?.(step === 0 ? 'Understanding…' : 'Thinking…');
        let content = '';
        let calls: ToolCall[] = [];
        try {
          const answer = await this.llm.chat(messages, this.schemas, { signal });
          content = answer.content.trim();
          calls = answer.toolCalls;
          hooks.onStep?.({ ...modelStep, finishedAt: Date.now(), content, toolCalls: calls });
        } catch (e) {
          hooks.onStep?.({ ...modelStep, finishedAt: Date.now(), error: (e as Error).message });
          throw e;
        }

        if (!calls.length) {
          outcome.reply = content || lastToolMessage || 'Done.';
          if (!calledTools) outcome.speak = true;
          break;
        }
        calledTools = true;
        messages.push({ role: 'assistant', content, tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) });

        // Every result goes back to the model: only the model knows whether the request has
        // more parts ("go to patients, select James and add a task") or is done.
        for (const call of calls) {
          if (signal?.aborted) throw new DOMException('cancelled', 'AbortError');
          if (call.name === WAIT_TOOL && calls.length === 1) {
            outcome.deferred = true;
            hooks.onStep?.({ id: stepId(), type: 'tool', startedAt: Date.now(), finishedAt: Date.now(), call, result: { ok: true, message: 'Waiting for the rest of the sentence.' } });
            return outcome;
          }
          const result = await this.execute(call, hooks);
          // The same call giving the same result again is a loop, not progress ("next page" twice is
          // progress: its result changes). Tell the model once; the second time, end the turn.
          const signature = `${call.name} ${JSON.stringify(call.arguments)} → ${result.message}`;
          const stalled = seen.has(signature);
          seen.add(signature);
          if (stalled && ++stalls >= 2) {
            outcome.reply = result.message;
            outcome.speak = true;
            return outcome;
          }
          const note = stalled ? { ...result, message: `${result.message} (Same call, same result as before — do not repeat it: try something different or answer the provider.)` } : result;
          messages.push({ role: 'tool', tool_name: call.name, content: toolMessage(note) });
          lastToolMessage = result.message;
          if (result.fieldsModified) outcome.fieldsModified.push(...result.fieldsModified);
          if (result.speak) outcome.speak = true;
          if (result.awaitUser) {
            // The app needs the user now; the rest of the plan waits for their answer.
            outcome.reply = result.message;
            outcome.awaitingUser = true;
            return outcome;
          }
          if (result.final) {
            // Nothing can follow (the model is being replaced, or the provider signed out).
            outcome.reply = result.message;
            return outcome;
          }
        }
        if (step === this.maxSteps - 1) outcome.reply = lastToolMessage;
      }
      return outcome;
    } finally {
      this.runtime.endTurn();
      hooks.onProgress?.(null);
      if (outcome.reply || outcome.awaitingUser) {
        this.earlier.push({ said, reply: outcome.reply });
        this.earlier = this.earlier.slice(-Agent.EARLIER_EXCHANGES);
      }
      if (reprime) void this.warmUp();
    }
  }

  private async execute(call: ToolCall, hooks: AgentHooks): Promise<ToolResult> {
    const step: AgentStep = { id: stepId(), type: 'tool', startedAt: Date.now(), call };
    hooks.onStep?.(step);
    const tool = this.byName.get(call.name);
    let result: ToolResult;
    if (!tool) {
      result = { ok: false, message: `There is no tool "${call.name}". Available: ${this.toolNames.join(', ')}.` };
    } else {
      const parsed = parseArgs(tool, call.arguments);
      if (!parsed.ok) result = { ok: false, message: parsed.error };
      else {
        hooks.onProgress?.(tool.progress?.(parsed.args) ?? 'Working…');
        try {
          result = await tool.run(parsed.args, { runtime: this.runtime });
        } catch (e) {
          result = { ok: false, message: `${call.name} failed: ${(e as Error).message}` };
        }
      }
    }
    hooks.onStep?.({ ...step, finishedAt: Date.now(), result });
    return result;
  }

  /**
   * Extract a clinical note into items for review (AI Summary). Uses the same system prompt
   * and tools as every command, so the runtime's cached prefix is reused; the model reports
   * the findings through the record_note_findings tool, validated against its schema.
   */
  async extractNote(note: string, hooks: AgentHooks = {}): Promise<ExtractionResult> {
    const tool = this.byName.get(NOTE_FINDINGS_TOOL)!;
    const ctx = this.buildContext();
    const messages: ChatMessage[] = [...this.prefix(ctx), { role: 'user', content: buildExtractionMessage(note, ctx) }];
    for (let attempt = 0; attempt < 3; attempt++) {
      const modelStep: AgentStep = { id: stepId(), type: 'model', startedAt: Date.now() };
      hooks.onStep?.(modelStep);
      const answer = await this.llm.chat(messages, this.schemas, { maxTokens: 1500 });
      hooks.onStep?.({ ...modelStep, finishedAt: Date.now(), content: answer.content, toolCalls: answer.toolCalls });
      const call = answer.toolCalls.find((c) => c.name === NOTE_FINDINGS_TOOL);
      const parsed = call ? parseArgs(tool, call.arguments) : null;
      const findings = call && parsed?.ok ? toExtraction(note, this.llm.name, parsed.args as Record<string, unknown>) : null;
      if (findings && !findings.problems.length) return findings.result;
      const problem = !call ? 'You did not call record_note_findings.' : findings ? `Fix these and call it again: ${findings.problems.join('; ')}` : (parsed as { error: string }).error;
      messages.push(
        { role: 'assistant', content: answer.content, tool_calls: answer.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) },
        call ? { role: 'tool', tool_name: call.name, content: JSON.stringify({ ok: false, message: problem }) } : { role: 'user', content: `${problem} Call it now with the findings of the note.` },
      );
    }
    throw new Error('The model did not return the note findings in the expected form. Try again, or add the items by hand.');
  }
}

/** Findings checked against the form definitions: values that do not fit are sent back to the model to fix. */
function toExtraction(note: string, provider: string, args: Record<string, unknown>): { result: ExtractionResult; problems: string[] } {
  const items = Object.fromEntries(RECORD_KINDS.map((kind) => [kind, [] as ExtractionResult['items'][typeof kind]])) as ExtractionResult['items'];
  const problems: string[] = [];
  for (const kind of RECORD_KINDS) {
    const list = (args[recordPlural[kind]] as Array<Record<string, FieldScalar>> | undefined) ?? [];
    list.forEach((entry, i) => {
      const { quote, ...fields } = entry;
      const clean: FieldValues = {};
      for (const [name, value] of Object.entries(fields)) {
        if (value === '') continue;
        const field = FieldRegistry.resolveField(kind, name);
        if (!field) {
          problems.push(`${recordPlural[kind]}[${i}]: "${name}" is not a ${kind} field`);
          continue;
        }
        const coerced = FieldRegistry.coerceValue(field, value);
        if (coerced.ok) clean[field.name] = coerced.value;
        else problems.push(`${recordPlural[kind]}[${i}]: ${coerced.error}`);
      }
      if (Object.keys(clean).length) items[kind].push({ fields: clean, quote: typeof quote === 'string' ? quote : undefined });
    });
  }
  return { result: { transcript: note, provider, items, questions: ((args.questions as string[] | undefined) ?? []).filter(Boolean) }, problems };
}
