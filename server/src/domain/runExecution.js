import { randomUUID } from 'node:crypto';
import { isTerminal, RunStatus } from './status.js';
import { sanitizeMetadata } from './traceSanitizer.js';

export class RunExecution {
  #status = RunStatus.CREATED;
  #output = '';
  #events = [];
  #errorCode = null;
  #providerInvoked = false;
  #ignoredTerminalTransitions = 0;
  #terminalPromise;
  #resolveTerminal;

  constructor({ input, providerMode, timeoutMs }) {
    this.id = randomUUID();
    this.input = input;
    this.providerMode = providerMode;
    this.timeoutMs = timeoutMs;
    this.createdAt = new Date().toISOString();
    this.abortController = new AbortController();
    this.#terminalPromise = new Promise(resolve => { this.#resolveTerminal = resolve; });
    this.event('run.created', { mode: providerMode, timeout_ms: timeoutMs });
  }

  get terminal() { return isTerminal(this.#status); }

  event(type, metadata = {}) {
    if (this.terminal) return false;
    this.#events.push({
      sequence: this.#events.length + 1,
      occurredAt: new Date().toISOString(),
      type,
      metadata: sanitizeMetadata(metadata),
    });
    return true;
  }

  beginProvider() {
    if (this.#status !== RunStatus.CREATED) return false;
    this.#status = RunStatus.RUNNING;
    this.event('run.running');
    this.#providerInvoked = true;
    this.event('provider.started', { provider: 'deterministic-fake' });
    return true;
  }

  appendChunk(chunk) {
    if (this.#status !== RunStatus.RUNNING) return false;
    this.#output += chunk;
    const chunkIndex = this.#events.filter(event => event.type === 'provider.chunk').length + 1;
    this.event('provider.chunk', { chunk_index: chunkIndex, size: chunk.length });
    return true;
  }

  claimCompletion() {
    if (this.#status !== RunStatus.RUNNING) {
      this.#ignoredTerminalTransitions += 1;
      return false;
    }
    this.#status = RunStatus.COMMITTING;
    this.event('persistence.started');
    return true;
  }

  finish(status, errorCode = null) {
    if (!isTerminal(status)) throw new TypeError('finish requires a terminal status');
    if (this.terminal || this.#status === RunStatus.COMMITTING && ![RunStatus.COMPLETED, RunStatus.FAILED].includes(status)) {
      this.#ignoredTerminalTransitions += 1;
      return false;
    }
    this.#status = status;
    this.#errorCode = errorCode;
    this.#events.push({
      sequence: this.#events.length + 1,
      occurredAt: new Date().toISOString(),
      type: `run.${status}`,
      metadata: sanitizeMetadata(errorCode ? { code: errorCode } : {}),
    });
    this.#resolveTerminal(this.snapshot());
    return true;
  }

  snapshot() {
    return {
      id: this.id,
      input: this.input,
      providerMode: this.providerMode,
      timeoutMs: this.timeoutMs,
      status: this.#status,
      output: this.#output,
      errorCode: this.#errorCode,
      providerInvoked: this.#providerInvoked,
      ignoredTerminalTransitions: this.#ignoredTerminalTransitions,
      createdAt: this.createdAt,
      events: this.#events.map(event => ({ ...event, metadata: { ...event.metadata } })),
    };
  }

  async awaitTerminal(timeoutMs = 5_000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Run ${this.id} did not terminate in time`)), timeoutMs);
    });
    try {
      await Promise.race([this.#terminalPromise, timeout]);
      return this.snapshot();
    }
    finally { clearTimeout(timer); }
  }
}
