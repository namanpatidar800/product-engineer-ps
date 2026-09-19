# Reliable Runtime Lab

MERN implementation of **Caygnus Product Engineering Challenge — Problem 5: Reliable AI Conversation Runtime**.

The application demonstrates ordered response streaming, pre-response policy rejection, cancellation, timeout, provider failure, single-winner terminal states, MongoDB persistence, and safe operational traces.

## Stack

- React 19 + Vite
- Node.js + Express
- MongoDB
- Node's built-in test runner

## Run locally

Prerequisites: Node.js 22+ and a MongoDB Atlas cluster.

```bash
npm install
cp .env.example .env
npm run dev
```

Replace the placeholder `MONGODB_URI` in `.env` with the Atlas connection string. Keep the database name in the URI path, for example `/runtime_lab?retryWrites=...`. On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Open <http://localhost:5173>.

## Test and verify

```bash
npm test
npm run benchmark
npm run build
```

The benchmark executes 10 iterations each of completion, rejection, cancellation, timeout, and provider failure.

## Production-style run

```bash
npm run build
npm start
```

Open the React frontend at <http://localhost:4173>.

The Express backend remains separate at <http://localhost:8080>. Its root and `/api/health` show only:

```json
{"status":"ok","service":"reliable-runtime-api"}
```
