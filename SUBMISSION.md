# Product Engineering Challenge Submission

## Candidate

- **Name:** Naman Patidar
- **Email:** namanpatidar800@gmail.com
- **GitHub:** [https://github.com/namanpatidar800](https://github.com/namanpatidar800)
- **Selected problem:** Problem 5 — Reliable AI Conversation Runtime
- **Demo video:** [Google Drive recording](https://drive.google.com/file/d/13ej7jCsvnXT6OAy_OFgMKMzY_RlPgRyo/view?usp=sharing)

## Run the project

### Prerequisites

- Node.js 22 or newer-
- A MongoDB Atlas cluster
- An Atlas database user with read/write access
- The reviewer's IP address allowed in Atlas Network Access

### Setup

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

Set the following values in `.env` before starting:

```env
PORT=8080
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER_HOST/runtime_lab?retryWrites=true&w=majority&appName=RuntimeLab
```

The database name is included in the URI path. Credentials must be URL-encoded when they contain reserved URI characters. No model-provider API key is required.

After `npm run dev` starts:

- Frontend: <http://localhost:5173>
- Backend health: <http://localhost:8080>
- API health: <http://localhost:8080/api/health>

### Reproduce the scenarios

- **Successful completion:** Keep **Normal completion**, use a 4000 ms deadline, and submit any allowed prompt.
- **Policy rejection:** Click **Load rejection demo** and submit. The provider-called indicator remains `no`.
- **Cancellation:** Start a normal or slow turn and select **Cancel active run** while it is streaming.
- **Timeout:** Select **Slow provider / timeout** and use the suggested 900 ms deadline.
- **Provider failure:** Select **Fail after partial output** and submit.

Only completed turns appear in **Committed conversation** and are persisted to MongoDB. Partial output from unsuccessful runs remains inspectable on the active run but is not stored as a successful assistant response.

## Run the tests

```bash
npm test
```

Create a production frontend build with:

```bash
npm run build
```

The test suite uses deterministic providers and an in-memory implementation of the same repository contract. It does not require Atlas, a paid model API, or arbitrary long sleeps.

## Acceptance scenarios and verification

### Completed acceptance scenarios

- **AC1 — Successful streamed turn:** Ordered chunks are emitted through the provider abstraction. A normal provider return claims completion, persists one completed turn, and reaches `completed` once.
- **AC2 — Pre-response rejection:** A deterministic policy rejects inputs containing `[reject]` or `blocked request` before the provider is invoked.
- **AC3 — Cancellation:** Cancellation aborts the provider through `AbortController`, transitions the run to `cancelled`, and prevents later completion.
- **AC4 — Timeout:** A configurable deadline aborts provider consumption, retains inspectable partial output, and reaches `timed_out` without successful persistence.
- **AC5 — Provider failure:** A deterministic provider can fail after partial output. The runtime records a safe failure event and reaches `failed` without a successful assistant record.
- **AC6 — Terminal-state race:** `RunExecution` owns all state changes. The first valid terminal transition wins; later attempts are ignored and counted without adding post-terminal events.
- **AC7 — Safe operational trace:** Every run exposes ordered lifecycle events containing safe metadata. Inputs, generated prose, raw provider error messages, credentials, and hidden reasoning are excluded.

### Focused automated tests

The test suite covers:

- Successful streaming and persistence
- Policy rejection and zero provider calls
- Cancellation during streaming
- Timeout with a controllable provider
- Provider failure after partial output
- Competing terminal transitions
- Secret redaction
- Cancellation racing with an in-flight completion commit
- Snapshot isolation from external mutation

### Verification benchmark

Run:

```bash
npm run benchmark
```

Observed locally on 19 September 2026:

```text
Reliable runtime verification benchmark
=======================================
Runs: 50 (10 per deterministic scenario)
completed:  10
rejected:   10
cancelled:  10
timed_out:  10
failed:     10
Persisted successful assistant responses: 10
PASS: exactly one terminal state per run
PASS: rejected runs never invoked the provider
PASS: unsuccessful runs persisted no successful assistant response
PASS: no trace events occurred after a terminal event
```

The failure/recovery path demonstrated in the video should use **Slow provider / timeout** and **Fail after partial output**. Both paths are deterministic and reproducible from the frontend.

## Architecture and data flow

```text
React client
    │ JSON API requests and immutable run polling
    ▼
Express API
    ▼
RuntimeEngine
    ├── DeterministicPolicy
    ├── DeterministicProvider
    ├── RunExecution state machine
    └── MongoConversationRepository
                ▼
             MongoDB Atlas
```

- **React client:** Owns presentation, scenario controls, polling, and rendering. It never decides the authoritative run state.
- **Express API:** Owns HTTP validation, route handling, cancellation requests, and health reporting.
- **RuntimeEngine:** Orchestrates policy evaluation, provider streaming, cancellation, timeout, and persistence.
- **RunExecution:** Sole owner of run status, accumulated output, ordered trace, completion claims, and terminal-state arbitration.
- **Policy:** Makes a deterministic allow/reject decision before provider invocation.
- **Provider:** Streams deterministic chunks and observes an `AbortSignal`. A live model adapter can implement the same boundary.
- **Repository:** Atomically upserts a single completed-turn MongoDB document using a unique `runId`.

The browser polls immutable snapshots every 120 ms. Streaming still occurs incrementally inside the provider/runtime boundary: every provider callback appends one ordered chunk and one ordered operational event.

## Technology choices

The MERN stack keeps the application in one language across frontend and backend. React provides a small interactive inspection interface, Express keeps the HTTP boundary thin, and Node's `AbortController` maps naturally to cancellation and timeout propagation. MongoDB stores one completed turn per document; a unique `runId` and atomic single-document upsert make successful persistence idempotent.

Vite was chosen for a fast development loop and deterministic production build. Node's built-in test runner avoids adding a separate testing framework.

Polling was selected instead of SSE or WebSockets because resumable network delivery is not the focus of Problem 5. This keeps presentation transport replaceable while preserving a genuinely streamed provider/runtime interface. A production client would likely use cursor-based SSE or WebSockets.

## Important decisions

### 1. Completed output is the persistence boundary

Partial output is visible for diagnosis but is not a successful conversation record. Only a normal provider return can claim `committing`. MongoDB acknowledgement then produces `completed`; a persistence error produces `failed`.

### 2. Completion is claimed before the asynchronous database write

The transition from `running` to `committing` is synchronous. Once claimed, a concurrent cancellation cannot create a `cancelled` run whose output was already written successfully. If the write fails, the run becomes `failed`.

### 3. Operational traces contain structured facts, not private prose

Events contain sequence numbers, timestamps, state changes, chunk indexes/sizes, reason codes, and error classes. They exclude user input, generated output, raw exception messages, credentials, and hidden model reasoning. Sensitive-looking metadata is redacted before retention.

## Assumptions and limitations

- One Node.js process owns active runs. Active runs and their traces do not recover after a process restart.
- Successfully completed conversation turns are durable in MongoDB Atlas.
- The policy and provider are deterministic demonstrations, not production safety or model-quality systems.
- Cancellation is cooperative. A live provider adapter must connect the `AbortSignal` to its SDK or HTTP request.
- Active runs are retained in memory without pagination or expiry because this is a bounded prototype.
- The browser uses polling and therefore does not implement resumable delivery cursors.
- Authentication, authorization, billing, distributed execution, and production observability infrastructure are intentionally out of scope.
- Malformed provider-event recovery is optional stretch work and is not implemented.

## Production and scale

The submitted prototype stores active state in one Node.js process and completed turns in MongoDB Atlas. For production, the first change would be to persist active state transitions and trace events using versioned compare-and-set updates. Execution would move to a durable queue so process restarts do not lose active work.

Chunks would be published through cursor-based SSE or WebSockets. A real provider adapter would pass `AbortSignal` to the upstream request. Additional production work would include authentication and tenant isolation, encryption, retention/deletion policies, rate limiting, bounded trace storage, metrics, distributed tracing, and database indexes based on measured query patterns.

## AI usage

OpenAI Codex was used to analyze the problem brief, compare solution approaches, scaffold and review the MERN implementation, identify concurrency cases, and prepare documentation. Generated work was reviewed through focused deterministic tests, the required 50-run benchmark, a React production build, and HTTP smoke checks. The candidate remains responsible for understanding, explaining, and modifying every submitted component.

## Credibility note

I built and publicly shipped **ScopeWatch**, an open-source AI-assisted scope-check workflow for software-services agencies.

- **Problem it solved:** Informal client messages often combine several “small changes,” making it difficult for delivery teams to determine which requests are covered by an approved statement of work. ScopeWatch splits a message into atomic asks, compares each ask with explicit SOW clauses, validates the cited evidence, and produces a manager-review report with `IN_SCOPE`, `OUT_OF_SCOPE`, or `NEEDS_REVIEW` recommendations. Reviewed live reports can then be published to GitHub Issues.
- **My personal contribution:** I designed and implemented the Node.js CLI workflow, configurable Gemini integration, deterministic offline-fixture mode, input schemas, evidence validator, Markdown/JSON/trace report generation, and GitHub Issues publishing path. I also added the deterministic test suite and documented executable evidence for the workflow.
- **Scale or operational complexity:** The public prototype processes requests through a multi-stage pipeline covering input validation, AI decomposition, evidence reconciliation, report generation, and external GitHub publishing. It includes five version-controlled request scenarios—including mixed-scope and adversarial prompt-injection cases—and 46 deterministic tests. The live path also handles retryable provider failures, model fallback, token/latency metadata, duplicate-issue detection, and a publish lock to avoid concurrent duplicate creation.
- **One difficult engineering or product decision:** I chose not to treat model verdicts as authoritative. Every quoted request fragment and SOW clause is checked deterministically against the source text. Missing or fabricated evidence, unknown clause identifiers, and verdict/clause mismatches are conservatively downgraded to `NEEDS_REVIEW`. This can create more manual review, but it prevents plausible model prose from becoming an unsupported delivery or commercial decision. Offline fixture results are also explicitly blocked from GitHub publishing so demonstrations cannot be mistaken for live analysis.
- **Public link and evidence:** https://github.com/namanpatidar800/Scopewatch. The repository includes source code, deterministic tests, sample fixtures, generated-report evidence, and screenshots of test execution and GitHub publishing.
