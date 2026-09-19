import express from 'express';

export function createApp(runtime) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  const health = (_request, response) => response.json({
    status: 'ok',
    service: 'reliable-runtime-api',
  });
  app.get('/', health);
  app.get('/api/health', health);

  app.post('/api/runs', (request, response, next) => {
    try { response.status(202).json(runtime.start(request.body)); }
    catch (error) { next(error); }
  });

  app.get('/api/runs', (_request, response) => response.json(runtime.allRuns()));

  app.get('/api/runs/:id', (request, response) => {
    const run = runtime.find(request.params.id);
    if (!run) return response.status(404).json({ error: 'Run not found' });
    response.json(run);
  });

  app.post('/api/runs/:id/cancel', (request, response) => {
    const run = runtime.cancel(request.params.id);
    if (!run) return response.status(404).json({ error: 'Run not found' });
    response.json(run);
  });

  app.get('/api/conversation', async (_request, response, next) => {
    try { response.json(await runtime.conversation()); }
    catch (error) { next(error); }
  });

  app.use((error, _request, response, _next) => {
    const clientError = error instanceof TypeError || error?.type === 'entity.parse.failed';
    if (!clientError) console.error('Request failed:', error);
    response.status(clientError ? 400 : 500).json({ error: clientError ? error.message : 'Internal server error' });
  });

  return app;
}
