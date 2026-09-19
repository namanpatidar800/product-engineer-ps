export const RunStatus = Object.freeze({
  CREATED: 'created',
  RUNNING: 'running',
  COMMITTING: 'committing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  TIMED_OUT: 'timed_out',
  FAILED: 'failed',
});

export const TERMINAL_STATUSES = new Set([
  RunStatus.COMPLETED,
  RunStatus.REJECTED,
  RunStatus.CANCELLED,
  RunStatus.TIMED_OUT,
  RunStatus.FAILED,
]);

export const isTerminal = status => TERMINAL_STATUSES.has(status);
