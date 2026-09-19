import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { DeterministicPolicy } from './policy.js';
import { DeterministicProvider } from './provider.js';
import { MongoConversationRepository } from './repositories/mongoConversationRepository.js';
import { RuntimeEngine } from './runtimeEngine.js';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is required. Copy .env.example to .env and add your MongoDB Atlas connection string.');
  process.exit(1);
}
const repository = new MongoConversationRepository({
  uri: process.env.MONGODB_URI,
});

try {
  await repository.connect();
} catch (error) {
  console.error('Could not connect to MongoDB Atlas. Check MONGODB_URI, database-user credentials, and Network Access allowlist.');
  console.error(error.message);
  process.exit(1);
}

const runtime = new RuntimeEngine({
  repository,
  policy: new DeterministicPolicy(),
  provider: new DeterministicProvider(),
});
const port = Number(process.env.PORT ?? 8080);
const server = createApp(runtime).listen(port, () => {
  console.log('Reliable Runtime Lab is ready');
  console.log('Frontend: http://localhost:5173');
  console.log(`Backend:  http://localhost:${port}`);
  console.log(`Health:   http://localhost:${port}/api/health`);
});

async function shutdown() {
  server.close(async () => {
    await repository.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
