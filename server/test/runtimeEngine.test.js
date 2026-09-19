import assert from 'node:assert/strict';
import test from 'node:test';
import { RunExecution } from '../src/domain/runExecution.js';
import { sanitizeMetadata } from '../src/domain/traceSanitizer.js';
import { DeterministicPolicy } from '../src/policy.js';
import { ProviderError } from '../src/provider.js';
import { InMemoryConversationRepository } from '../src/repositories/inMemoryConversationRepository.js';
import { RuntimeEngine } from '../src/runtimeEngine.js';

class ControllableProvider {
  invocationCount = 0;

  async stream({ mode, signal, onChunk }) {
    this.invocationCount += 1;
    if (mode === 'normal') {
      onChunk('first ');
      onChunk('second');
      return;
    }
    if (mode === 'fail') {
      onChunk('partial');
      throw new ProviderError('controlled provider failure');
    }
    onChunk('partial');
    await new Promise((_, reject) => {
      if (signal.aborted) return reject(new DOMException('stopped', 'AbortError'));
      signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true });
    });
  }
}

function harness() {
  const repository = new InMemoryConversationRepository();
  const provider = new ControllableProvider();
  return {
    repository,
    provider,
    runtime: new RuntimeEngine({ repository, provider, policy: new DeterministicPolicy() }),
  };
}

async function waitForProvider(runtime, id) {
  const deadline = Date.now() + 1_000;
  while (!runtime.find(id).providerInvoked) {
    if (Date.now() > deadline) throw new Error('Provider did not start');
    await new Promise(resolve => setImmediate(resolve));
  }
}

function assertOneTerminalEvent(run) {
  const terminalTypes = new Set(['run.completed', 'run.rejected', 'run.cancelled', 'run.timed_out', 'run.failed']);
  const terminalEvents = run.events.filter(event => terminalTypes.has(event.type));
  assert.equal(terminalEvents.length, 1);
  assert.equal(run.events.at(-1).type, terminalEvents[0].type);
}

test('successful chunks remain ordered and only completed turn is persisted', async () => {
  const { runtime, repository } = harness();
  const started = runtime.start({ input: 'hello', providerMode: 'normal', timeoutMs: 2_000 });
  const run = await runtime.awaitTerminal(started.id);
  assert.equal(run.status, 'completed');
  assert.equal(run.output, 'first second');
  assert.deepEqual((await repository.allRecords()).map(record => record.role), ['user', 'assistant']);
  assertOneTerminalEvent(run);
});

test('policy rejection proves provider was never invoked', async () => {
  const { runtime, provider } = harness();
  const started = runtime.start({ input: '[reject] blocked request', providerMode: 'normal', timeoutMs: 2_000 });
  const run = await runtime.awaitTerminal(started.id);
  assert.equal(run.status, 'rejected');
  assert.equal(run.providerInvoked, false);
  assert.equal(provider.invocationCount, 0);
});

test('cancellation stops active provider and does not persist partial output', async () => {
  const { runtime, repository } = harness();
  const started = runtime.start({ input: 'cancel', providerMode: 'slow', timeoutMs: 2_000 });
  await waitForProvider(runtime, started.id);
  runtime.cancel(started.id);
  const run = await runtime.awaitTerminal(started.id);
  assert.equal(run.status, 'cancelled');
  assert.equal((await repository.allRecords()).length, 0);
  assertOneTerminalEvent(run);
});

test('timeout uses controllable provider and does not persist partial output', async () => {
  const { runtime, repository } = harness();
  const started = runtime.start({ input: 'timeout', providerMode: 'slow', timeoutMs: 100 });
  const run = await runtime.awaitTerminal(started.id);
  assert.equal(run.status, 'timed_out');
  assert.equal(run.output, 'partial');
  assert.equal((await repository.allRecords()).length, 0);
  assertOneTerminalEvent(run);
});

test('provider failure retains partial output and explicit trace', async () => {
  const { runtime, repository } = harness();
  const started = runtime.start({ input: 'fail', providerMode: 'fail', timeoutMs: 2_000 });
  const run = await runtime.awaitTerminal(started.id);
  assert.equal(run.status, 'failed');
  assert.equal(run.output, 'partial');
  assert.equal((await repository.allRecords()).length, 0);
  assert.ok(run.events.some(event => event.type === 'provider.failed'));
});

test('competing terminal transitions produce one terminal state and observable loser', async () => {
  const { runtime } = harness();
  const started = runtime.start({ input: 'race', providerMode: 'slow', timeoutMs: 2_000 });
  await waitForProvider(runtime, started.id);
  runtime.cancel(started.id);
  runtime.cancel(started.id);
  await runtime.awaitTerminal(started.id);
  await new Promise(resolve => setImmediate(resolve));
  const run = runtime.find(started.id);
  assert.equal(run.status, 'cancelled');
  assert.ok(run.ignoredTerminalTransitions >= 1);
  assertOneTerminalEvent(run);
});

test('trace sanitizer redacts sensitive keys and credential-shaped values', () => {
  const metadata = sanitizeMetadata({
    api_key: 'sk-super-secret-value',
    message: 'Bearer hidden-token',
    result: 'allowed',
  });
  assert.equal(metadata.api_key, '[REDACTED]');
  assert.equal(metadata.message, '[REDACTED]');
  assert.equal(metadata.result, 'allowed');
});

test('completion claim prevents cancellation from contradicting an in-flight commit', async () => {
  let releaseCommit;
  const repository = {
    async commitCompletedTurn() { await new Promise(resolve => { releaseCommit = resolve; }); },
    async allRecords() { return []; },
  };
  const runtime = new RuntimeEngine({ repository, provider: new ControllableProvider(), policy: new DeterministicPolicy() });
  const started = runtime.start({ input: 'commit race', providerMode: 'normal', timeoutMs: 2_000 });
  while (runtime.find(started.id).status !== 'committing') await new Promise(resolve => setImmediate(resolve));
  runtime.cancel(started.id);
  releaseCommit();
  const run = await runtime.awaitTerminal(started.id);
  assert.equal(run.status, 'completed');
  assert.ok(runtime.find(started.id).ignoredTerminalTransitions >= 1);
});

test('run snapshots are copies and cannot mutate runtime state', () => {
  const run = new RunExecution({ input: 'copy', providerMode: 'normal', timeoutMs: 1_000 });
  const snapshot = run.snapshot();
  snapshot.events[0].type = 'tampered';
  assert.equal(run.snapshot().events[0].type, 'run.created');
});
