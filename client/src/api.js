export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return body;
}
