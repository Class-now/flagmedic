// Thin wrapper over the Flagsmith Admin (Management) REST API.
export const API_URL = (process.env.FLAGSMITH_API_URL || 'https://api.flagsmith.com/api/v1/').replace(/\/?$/, '/');
export const ENV_KEY = process.env.FLAGSMITH_ENVIRONMENT_KEY || 'WPRAA25nbx2oWTB9TAW9s2';
export const PROJECT_ID = process.env.FLAGSMITH_PROJECT_ID || '54206';
export const DASHBOARD = process.env.FLAGSMITH_DASHBOARD || 'https://app.flagsmith.com';

export let apiCalls = 0;

export async function api(path, { method = 'GET', body } = {}) {
  const key = process.env.FLAGSMITH_API_KEY;
  if (!key) throw new Error('FLAGSMITH_API_KEY is not set (organisation API key)');
  apiCalls++;
  const res = await fetch(API_URL + path, {
    method,
    headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function experimentUrl(expId) {
  return `${DASHBOARD}/project/${PROJECT_ID}/environment/${ENV_KEY}/experiments/${expId}`;
}
