const sensitiveKeys = ['authorization', 'api_key', 'apikey', 'password', 'secret', 'token', 'chain_of_thought'];
const secretValue = /(bearer\s+\S+|sk-[a-z0-9_-]{8,})/i;

export function sanitizeMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => {
    const normalized = key.toLowerCase().replaceAll('-', '_');
    const text = String(value);
    const sensitive = sensitiveKeys.some(candidate => normalized.includes(candidate));
    return [key, sensitive || secretValue.test(text) ? '[REDACTED]' : text];
  }));
}
