import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const terminalStatuses = new Set(['completed', 'rejected', 'cancelled', 'timed_out', 'failed']);
const initialPrompt = 'Explain why terminal states matter in a streaming system.';

function Trace({ events = [] }) {
  if (!events.length) return <p className="empty">Start a turn to inspect its ordered lifecycle.</p>;
  return events.map(event => (
    <div className="trace-row" key={event.sequence}>
      <span className="trace-seq">{String(event.sequence).padStart(2, '0')}</span>
      <span className="trace-type">{event.type}</span>
      <span className="trace-meta">
        {Object.entries(event.metadata).map(([key, value]) => `${key}=${value}`).join(' · ') || '—'}
      </span>
    </div>
  ));
}

function History({ records }) {
  if (!records.length) return <p className="empty">No completed turns yet.</p>;
  return records.map((record, index) => (
    <div className="message" key={`${record.runId}-${record.role}-${index}`}>
      <span className="message-role">{record.role}</span>
      <p>{record.content}</p>
    </div>
  ));
}

export function App() {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState('normal');
  const [timeoutMs, setTimeoutMs] = useState(4000);
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const inProgress = run && !terminalStatuses.has(run.status);

  const loadHistory = useCallback(async () => {
    try { setHistory(await api('/api/conversation')); }
    catch { /* Active runtime remains usable if history is temporarily unavailable. */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!run?.id || terminalStatuses.has(run.status)) return undefined;
    const poll = async () => {
      try {
        const next = await api(`/api/runs/${run.id}`);
        setRun(next);
        if (terminalStatuses.has(next.status)) loadHistory();
        else pollRef.current = setTimeout(poll, 120);
      } catch (requestError) {
        if (requestError.status === 404) {
          setRun(null);
          setError('The backend restarted. Start a new run.');
          return;
        }
        setError(requestError.message);
        pollRef.current = setTimeout(poll, 800);
      }
    };
    pollRef.current = setTimeout(poll, 80);
    return () => clearTimeout(pollRef.current);
  }, [run?.id, loadHistory]);

  async function start(event) {
    event.preventDefault();
    setError('');
    try {
      setRun(await api('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ input: prompt, providerMode: mode, timeoutMs: Number(timeoutMs) }),
      }));
    } catch (requestError) { setError(requestError.message); }
  }

  async function cancel() {
    try {
      const cancelled = await api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' });
      setRun(cancelled);
      loadHistory();
    } catch (requestError) { setError(requestError.message); }
  }

  function loadRejection() {
    setPrompt('[reject] blocked request for deterministic policy demo');
    setMode('normal');
    setTimeoutMs(4000);
  }

  function changeMode(value) {
    setMode(value);
    setTimeoutMs(value === 'slow' ? 900 : 4000);
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">R</span><span>Runtime Lab</span></a>
        <div className="system-state"><span className="pulse" /> MERN runtime online</div>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Reliable AI conversation runtime</p>
          <h1>Every outcome is<br /><em>an honest state.</em></h1>
          <p className="intro">Explore streaming, policy rejection, cancellation, timeouts, and provider failure through one observable execution pipeline.</p>
        </section>

        <section className="workspace">
          <div className="composer card">
            <div className="section-heading">
              <div><span className="step">01</span><h2>Configure a turn</h2></div>
              <button type="button" className="text-button" onClick={loadRejection}>Load rejection demo</button>
            </div>
            <form onSubmit={start}>
              <label htmlFor="prompt">User input</label>
              <textarea id="prompt" maxLength="4000" rows="5" required value={prompt} onChange={event => setPrompt(event.target.value)} />
              <div className="controls">
                <div>
                  <label htmlFor="mode">Provider behaviour</label>
                  <select id="mode" value={mode} onChange={event => changeMode(event.target.value)}>
                    <option value="normal">Normal completion</option>
                    <option value="slow">Slow provider / timeout</option>
                    <option value="fail">Fail after partial output</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="timeout">Deadline (ms)</label>
                  <input id="timeout" type="number" min="100" max="60000" value={timeoutMs} onChange={event => setTimeoutMs(event.target.value)} />
                </div>
              </div>
              <div className="actions">
                <button className="primary" type="submit" disabled={inProgress}>Run turn <span>→</span></button>
                <button className="secondary" type="button" onClick={cancel} disabled={!inProgress}>Cancel active run</button>
              </div>
              <p className="form-error" role="alert">{error}</p>
            </form>
          </div>

          <div className="result card">
            <div className="section-heading">
              <div><span className="step">02</span><h2>Runtime output</h2></div>
              <span className={`status ${run?.status ?? 'idle'}`}>{run?.status?.replace('_', ' ') ?? 'idle'}</span>
            </div>
            <div className={`response ${inProgress ? 'cursor' : ''}`}>
              {run?.output || <span className="placeholder">{run ? 'No provider output.' : 'The streamed response will appear here.'}</span>}
            </div>
            <dl className="facts">
              <div><dt>Run ID</dt><dd title={run?.id}>{run?.id ?? '—'}</dd></div>
              <div><dt>Provider called</dt><dd>{run ? (run.providerInvoked ? 'yes' : 'no') : '—'}</dd></div>
              <div><dt>Database</dt><dd>MongoDB</dd></div>
            </dl>
          </div>
        </section>

        <section className="observability">
          <div className="section-heading wide">
            <div><span className="step">03</span><h2>Operational trace</h2></div>
            <p>Metadata only · no prompts, secrets, or hidden reasoning</p>
          </div>
          <div className="trace"><Trace events={run?.events} /></div>
        </section>

        <section className="history">
          <div className="section-heading wide">
            <div><span className="step">04</span><h2>Committed conversation</h2></div>
            <p>Only successful turns cross the MongoDB persistence boundary</p>
          </div>
          <div className="history-list"><History records={history} /></div>
        </section>
      </main>

      <footer><span>Problem 5 · Caygnus Product Engineering Challenge</span><span>React · Express · MongoDB · Node.js</span></footer>
    </>
  );
}
