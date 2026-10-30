export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Is "npm start" still running?');
  }
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error((isJson && data.error) || `Request failed (${res.status})`);
  return data;
}

export const fmtMoney = (v) => (v === null || v === undefined ? '' : `PKR ${Math.round(v).toLocaleString('en-US')}`);
export const fmtNum = (v) => (v === null || v === undefined || v === '' ? '' : Math.round(v).toLocaleString('en-US'));
export const f3 = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(3));
export const dayNum = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / 86400000);
export const fromDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const shortDate = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
