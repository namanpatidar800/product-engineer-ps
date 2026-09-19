import { MongoClient } from 'mongodb';

export class MongoConversationRepository {
  constructor({ uri }) {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
  }

  async connect() {
    await this.client.connect();
    this.turns = this.client.db().collection('completed_turns');
    await this.turns.createIndex({ runId: 1 }, { unique: true });
  }

  async commitCompletedTurn({ runId, userInput, assistantOutput }) {
    await this.turns.updateOne(
      { runId },
      { $setOnInsert: { runId, userInput, assistantOutput, committedAt: new Date() } },
      { upsert: true },
    );
  }

  async allRecords() {
    const turns = await this.turns.find().sort({ committedAt: 1 }).toArray();
    return turns.flatMap(turn => [
      { runId: turn.runId, role: 'user', content: turn.userInput, committedAt: turn.committedAt },
      { runId: turn.runId, role: 'assistant', content: turn.assistantOutput, committedAt: turn.committedAt },
    ]);
  }

  async close() { await this.client.close(); }
}
