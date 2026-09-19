import { RunExecution } from './domain/runExecution.js';
import { RunStatus } from './domain/status.js';

const providerModes = new Set(['normal', 'slow', 'fail']);

export class RuntimeEngine {
  #runs = new Map();

  constructor({ repository, policy, provider }) {
    this.repository = repository;
    this.policy = policy;
    this.provider = provider;
  }

  start({ input, providerMode = 'normal', timeoutMs = 4_000 }) {
    if (typeof input !== 'string' || !input.trim()) throw new TypeError('Input must not be blank');
    if (input.length > 4_000) throw new TypeError('Input must be at most 4000 characters');
    if (!providerModes.has(providerMode)) throw new TypeError(`Unknown provider mode: ${providerMode}`);
    const timeout = Number(timeoutMs);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60_000) {
      throw new TypeError('Timeout must be an integer between 100 and 60000 ms');
    }

    const run = new RunExecution({ input: input.trim(), providerMode, timeoutMs: timeout });
    this.#runs.set(run.id, run);
    queueMicrotask(() => this.#execute(run));
    return run.snapshot();
  }

  async #execute(run) {
    run.event('policy.started', { policy: 'deterministic-demo-v1' });
    const decision = this.policy.evaluate(run.input);
    if (!decision.allowed) {
      run.event('policy.rejected', { reason: decision.reasonCode });
      run.finish(RunStatus.REJECTED, decision.reasonCode);
      return;
    }

    run.event('policy.allowed', { reason: decision.reasonCode });
    if (!run.beginProvider()) return;

    const deadline = setTimeout(() => {
      run.abortController.abort();
      run.finish(RunStatus.TIMED_OUT, 'deadline_exceeded');
    }, run.timeoutMs);

    try {
      await this.provider.stream({
        input: run.input,
        mode: run.providerMode,
        signal: run.abortController.signal,
        onChunk: chunk => run.appendChunk(chunk),
      });
      clearTimeout(deadline);
      run.event('provider.completed');
      if (!run.claimCompletion()) return;
      const snapshot = run.snapshot();
      try {
        await this.repository.commitCompletedTurn({
          runId: run.id,
          userInput: run.input,
          assistantOutput: snapshot.output,
        });
        run.finish(RunStatus.COMPLETED);
      } catch {
        run.finish(RunStatus.FAILED, 'persistence_failure');
      }
    } catch (error) {
      clearTimeout(deadline);
      if (error?.name === 'AbortError' && run.terminal) return;
      run.event('provider.failed', { error_type: error?.constructor?.name ?? 'Error' });
      run.finish(RunStatus.FAILED, 'provider_failure');
    }
  }

  cancel(id) {
    const run = this.#runs.get(id);
    if (!run) return null;
    run.abortController.abort();
    run.finish(RunStatus.CANCELLED, 'user_cancelled');
    return run.snapshot();
  }

  find(id) { return this.#runs.get(id)?.snapshot() ?? null; }

  allRuns() {
    return [...this.#runs.values()].map(run => run.snapshot())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async conversation() { return this.repository.allRecords(); }

  async awaitTerminal(id, timeoutMs = 5_000) {
    const run = this.#runs.get(id);
    if (!run) throw new TypeError(`Unknown run: ${id}`);
    return run.awaitTerminal(timeoutMs);
  }
}
