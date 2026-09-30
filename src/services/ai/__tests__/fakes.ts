/**
 * Test doubles for the assistant: a scripted model and a scripted microphone.
 *
 * The scripted model stands in for Qwen: each call returns the next turn from
 * its script (tool calls and/or text) and records the messages it was sent,
 * so a test can check exactly what the model saw — including tool results.
 */
import type { ToolCall } from '@/types/ai';
import type { ChatLLM, ChatMessage, ChatTurn, ToolSchema } from '../providers/llm';
import type { ListeningCallbacks, ListeningSession, MicrophoneRecognizer } from '../providers/stt';

export type ScriptTurn =
  | { content?: string; calls?: ToolCall[]; /** Only for the model's next step within the same request. */ followUp?: boolean }
  | ((messages: ChatMessage[]) => { content?: string; calls?: ToolCall[] });

export class ScriptedLLM implements ChatLLM {
  readonly name = 'scripted';
  requests: ChatMessage[][] = [];
  tools: ToolSchema[] = [];
  private script: ScriptTurn[] = [];

  /** Queue the model's next turns. */
  then(...turns: ScriptTurn[]) {
    this.script.push(...turns);
    return this;
  }

  /**
   * Shorthand: the model calls these tools, then says `reply` once it sees their results. When the
   * tools conclude the request themselves (no further model step), the reply is simply not used.
   */
  calls(calls: ToolCall[], reply = 'Done.') {
    return this.then({ calls }, { content: reply, followUp: true });
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatTurn> {
    this.requests.push(messages.map((m) => ({ ...m })));
    this.tools = tools;
    // A new request (not a step after tool results): drop follow-up replies the last request never needed.
    const newRequest = messages[messages.length - 1]?.role !== 'tool';
    while (newRequest && this.script[0] && typeof this.script[0] !== 'function' && this.script[0].followUp) this.script.shift();
    const next = this.script.shift();
    if (!next) return { content: '(script exhausted)', toolCalls: [] };
    const turn = typeof next === 'function' ? next(messages) : next;
    return { content: turn.content ?? '', toolCalls: turn.calls ?? [] };
  }

  /** The tool messages the model received in its last request. */
  lastToolResults() {
    const last = this.requests[this.requests.length - 1] ?? [];
    return last.filter((m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool').map((m) => ({ name: m.tool_name, ...(JSON.parse(m.content) as { ok: boolean; message: string; data?: unknown }) }));
  }

  get pending() {
    return this.script.length;
  }
}

export const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({ name, arguments: args });

/** A microphone the test drives: it decides when utterances, restarts and errors happen. */
export class FakeMic implements MicrophoneRecognizer {
  readonly providerName = 'fake-mic';
  sessions: Array<{ callbacks: ListeningCallbacks; stopped: boolean; cancelled: boolean }> = [];
  isSupported() {
    return true;
  }
  start(callbacks: ListeningCallbacks): ListeningSession {
    const entry = { callbacks, stopped: false, cancelled: false };
    this.sessions.push(entry);
    return {
      stop: () => {
        entry.stopped = true;
        callbacks.onEnd?.();
      },
      cancel: () => {
        entry.cancelled = true;
        callbacks.onEnd?.();
      },
    };
  }
  get current() {
    return this.sessions[this.sessions.length - 1];
  }
  /** The user says something: a partial, then the final transcript. */
  say(text: string) {
    this.current.callbacks.onSpeechStart?.();
    this.current.callbacks.onInterim?.(text.split(' ').slice(0, 2).join(' '));
    this.current.callbacks.onTranscribing?.();
    this.current.callbacks.onFinal(text);
  }
}
