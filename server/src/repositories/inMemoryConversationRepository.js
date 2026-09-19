export class InMemoryConversationRepository {
  #turns = [];

  async connect() {}
  async close() {}

  async commitCompletedTurn(turn) {
    if (this.#turns.some(existing => existing.runId === turn.runId)) return;
    this.#turns.push({ ...turn, committedAt: new Date().toISOString() });
  }

  async allRecords() {
    return this.#turns.flatMap(turn => [
      { runId: turn.runId, role: 'user', content: turn.userInput, committedAt: turn.committedAt },
      { runId: turn.runId, role: 'assistant', content: turn.assistantOutput, committedAt: turn.committedAt },
    ]);
  }
}
