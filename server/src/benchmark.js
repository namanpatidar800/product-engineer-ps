import { DeterministicPolicy } from './policy.js';
import { ProviderError } from './provider.js';
import { InMemoryConversationRepository } from './repositories/inMemoryConversationRepository.js';
import { RuntimeEngine } from './runtimeEngine.js';

class BenchmarkProvider {
  async stream({ mode, signal, onChunk }) {
    if (mode === 'normal') {
      onChunk('deterministic ');
      onChunk('response');
      return;
    }
    if (mode === 'fail') {
      onChunk('partial');
      throw new ProviderError('benchmark failure');
    }
    await new Promise((_, reject) => {
      if (signal.aborted) return reject(new DOMException('stopped', 'AbortError'));
      signal.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true });
    });
  }
}

const repository = new InMemoryConversationRepository();
const runtime = new RuntimeEngine({ repository, provider: new BenchmarkProvider(), policy: new DeterministicPolicy() });
const expected = new Map();

function start(input, providerMode, timeoutMs, status) {
  const run = runtime.start({ input, providerMode, timeoutMs });
  expected.set(run.id, status);
  return run.id;
}

async function waitForProvider(id) {
  const deadline = Date.now() + 1_000;
  while (!runtime.find(id).providerInvoked) {
    if (Date.now() > deadline) throw new Error('Provider did not start');
    await new Promise(resolve => setImmediate(resolve));
  }
}

const ids = [];
for (let iteration = 1; iteration <= 10; iteration += 1) {
  ids.push(start(`success ${iteration}`, 'normal', 2_000, 'completed'));
  ids.push(start(`[reject] benchmark ${iteration}`, 'normal', 2_000, 'rejected'));
  const cancelledId = start(`cancel ${iteration}`, 'slow', 2_000, 'cancelled');
  ids.push(cancelledId);
  await waitForProvider(cancelledId);
  runtime.cancel(cancelledId);
  ids.push(start(`timeout ${iteration}`, 'slow', 100, 'timed_out'));
  ids.push(start(`failure ${iteration}`, 'fail', 2_000, 'failed'));
}

const runs = await Promise.all(ids.map(id => runtime.awaitTerminal(id)));
await new Promise(resolve => setImmediate(resolve));
const violations = [];
const counts = new Map();
const terminalTypes = new Set(['run.completed', 'run.rejected', 'run.cancelled', 'run.timed_out', 'run.failed']);

for (const terminalSnapshot of runs) {
  const run = runtime.find(terminalSnapshot.id);
  counts.set(run.status, (counts.get(run.status) ?? 0) + 1);
  if (run.status !== expected.get(run.id)) violations.push(`${run.id}: expected ${expected.get(run.id)}, got ${run.status}`);
  const terminals = run.events.filter(event => terminalTypes.has(event.type));
  if (terminals.length !== 1) violations.push(`${run.id}: ${terminals.length} terminal events`);
  if (!terminalTypes.has(run.events.at(-1).type)) violations.push(`${run.id}: event after terminal`);
  if (run.status === 'rejected' && run.providerInvoked) violations.push(`${run.id}: rejected run invoked provider`);
}

const records = await repository.allRecords();
const assistantRecords = records.filter(record => record.role === 'assistant').length;
if (assistantRecords !== 10) violations.push(`Expected 10 persisted assistant records, got ${assistantRecords}`);

console.log('Reliable runtime verification benchmark');
console.log('=======================================');
console.log('Runs: 50 (10 per deterministic scenario)');
for (const status of ['completed', 'rejected', 'cancelled', 'timed_out', 'failed']) {
  console.log(`${`${status}:`.padEnd(12)}${counts.get(status) ?? 0}`);
}
console.log(`Persisted successful assistant responses: ${assistantRecords}`);

if (violations.length) {
  console.error(`FAIL (${violations.length} violations)`);
  violations.forEach(violation => console.error(` - ${violation}`));
  process.exitCode = 1;
} else {
  console.log('PASS: exactly one terminal state per run');
  console.log('PASS: rejected runs never invoked the provider');
  console.log('PASS: unsuccessful runs persisted no successful assistant response');
  console.log('PASS: no trace events occurred after a terminal event');
}
