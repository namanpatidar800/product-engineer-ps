const chunks = [
  'A reliable ', 'conversation runtime ', 'treats every outcome ',
  'as an explicit state transition. ', 'Only a fully completed response ',
  'is committed to conversation history.',
];

export class ProviderError extends Error {}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Provider consumption stopped', 'AbortError'));
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Provider consumption stopped', 'AbortError'));
    }, { once: true });
  });
}

export class DeterministicProvider {
  invocationCount = 0;

  async stream({ mode, signal, onChunk }) {
    this.invocationCount += 1;
    const delay = mode === 'slow' ? 550 : 140;
    for (const [index, chunk] of chunks.entries()) {
      await abortableDelay(delay, signal);
      if (signal.aborted) throw new DOMException('Provider consumption stopped', 'AbortError');
      onChunk(chunk);
      if (mode === 'fail' && index === 2) throw new ProviderError('Simulated upstream disconnect');
    }
  }
}
