// Pure calculation engine: CPM scheduling, delay forecasting, EVM and risk scoring.
// Dates are handled as integer "day numbers" (days since 1970-01-01, UTC) so the
// arithmetic is exact. A task with duration d starting on day S finishes on S + d - 1.

export class CycleError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toDay(s) {
  if (typeof s === 'number') return s;
  if (!s || !DATE_RE.test(String(s).trim())) throw new Error(`Invalid date '${s}'`);
  const str = String(s).trim();
  const n = Math.round(Date.parse(str + 'T00:00:00Z') / 86400000);
  if (Number.isNaN(n) || fromDay(n) !== str) throw new Error(`Invalid date '${s}'`);
  return n;
}

export const fromDay = (n) => (n === null || n === undefined ? '' : new Date(n * 86400000).toISOString().slice(0, 10));

export const isValidDate = (s) => {
  try { toDay(s); return true; } catch { return false; }
};

// ------------------------------------------------------------------ graph
export function topologicalOrder(ids, preds) {
  const indeg = new Map(ids.map((id) => [id, 0]));
  const succ = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    for (const p of preds[id] || []) {
      if (!indeg.has(p)) throw new Error(`Unknown predecessor ${p} for ${id}`);
      indeg.set(id, indeg.get(id) + 1);
      succ.get(p).push(id);
    }
  }
  const queue = ids.filter((id) => indeg.get(id) === 0);
  const order = [];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const s of succ.get(n)) {
      indeg.set(s, indeg.get(s) - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  if (order.length !== ids.length) {
    throw new CycleError('Dependency cycle detected among activities ' + ids.filter((i) => indeg.get(i) > 0).join(', '));
  }
  return order;
}

export function successorsMap(ids, preds) {
  const succ = Object.fromEntries(ids.map((i) => [i, []]));
  for (const i of ids) for (const p of preds[i] || []) (succ[p] ||= []).push(i);
  return succ;
}

export function wouldCreateCycle(taskId, newPreds, preds) {
  const trial = { ...preds, [taskId]: [...newPreds] };
  const ids = Object.keys(trial);
  for (const p of newPreds) if (!trial[p]) { trial[p] = []; ids.push(p); }
  try { topologicalOrder(ids, trial); return false; } catch (e) { if (e instanceof CycleError) return true; throw e; }
}

export function downstream(id, succ) {
  const seen = new Set();
  const stack = [...(succ[id] || [])];
  while (stack.length) {
    const n = stack.pop();
    if (!seen.has(n)) { seen.add(n); stack.push(...(succ[n] || [])); }
  }
  return seen;
}

export function upstream(id, preds) {
  const seen = new Set();
  const stack = [...(preds[id] || [])];
  while (stack.length) {
    const n = stack.pop();
    if (!seen.has(n)) { seen.add(n); stack.push(...(preds[n] || [])); }
  }
  return seen;
}

// ------------------------------------------------------------------ CPM
// durations: {id: days}; preds: {id: [ids]}; start: day number (ids given in display order)
export function plannedSchedule(ids, durations, preds, start) {
  const order = topologicalOrder(ids, preds);
  const res = {};
  for (const t of order) {
    const ps = preds[t] || [];
    const es = ps.length ? Math.max(...ps.map((p) => res[p].ef)) + 1 : start;
    res[t] = { es, ef: es + durations[t] - 1 };
  }
  if (!order.length) return { res, finish: start };
  const finish = Math.max(...Object.values(res).map((r) => r.ef));
  const succ = successorsMap(ids, preds);
  for (const t of [...order].reverse()) {
    const ss = succ[t] || [];
    const lf = ss.length ? Math.min(...ss.map((s) => res[s].ls)) - 1 : finish;
    const ls = lf - durations[t] + 1;
    Object.assign(res[t], { lf, ls, float: ls - res[t].es });
    res[t].critical = res[t].float === 0;
  }
  return { res, finish };
}

// tasks: {id: {duration, actualStart, actualEnd, percent}} (dates as day numbers or null)
export function forecast(ids, tasks, preds, planned, statusDay) {
  const order = topologicalOrder(ids, preds);
  const out = {};
  for (const t of order) {
    const info = tasks[t];
    const dur = info.duration;
    const ps = preds[t] || [];
    const ready = ps.length ? Math.max(...ps.map((p) => out[p].fe)) + 1 : planned[t].es;
    let fs, fe, state;
    if (info.actualEnd !== null && info.actualEnd !== undefined) {
      fs = info.actualStart; fe = info.actualEnd; state = 'Completed';
    } else if (info.actualStart !== null && info.actualStart !== undefined) {
      const remaining = Math.ceil((dur * (100 - info.percent)) / 100);
      fs = info.actualStart;
      fe = Math.max(fs, statusDay + Math.max(remaining, 1) - 1);
      state = 'In Progress';
    } else {
      fs = Math.max(ready, statusDay);
      fe = fs + dur - 1;
      state = 'Not Started';
    }
    const delay = fe - planned[t].ef;
    const inherited = ps.length ? Math.max(...ps.map((p) => Math.max(out[p].delay, 0))) : 0;
    const own = delay > 0 ? Math.max(delay - inherited, 0) : 0;
    if (state !== 'Completed' && delay > 0) state = 'Delayed';
    else if (state === 'Not Started' && planned[t].es < statusDay) state = 'Delayed';
    out[t] = { fs, fe, delay, inherited, ownDelay: own, state };
  }
  return out;
}

export function delayImpacts(ids, fc, preds) {
  const succ = successorsMap(ids, preds);
  const list = [];
  for (const t of ids) {
    if (fc[t].ownDelay > 0) {
      const affected = [...downstream(t, succ)].sort((a, b) => fc[a].fs - fc[b].fs);
      list.push({ task: t, ownDelay: fc[t].ownDelay, totalDelay: fc[t].delay, affected });
    }
  }
  return list.sort((a, b) => b.ownDelay - a.ownDelay);
}

// ------------------------------------------------------------------ EVM
export function plannedFraction(es, ef, statusDay) {
  if (statusDay < es) return 0;
  if (statusDay >= ef) return 1;
  return (statusDay - es + 1) / (ef - es + 1);
}

export function evmMetrics(ids, budgets, planned, percents, actualCost, statusDay) {
  const bac = ids.reduce((s, t) => s + budgets[t], 0);
  const pv = ids.reduce((s, t) => s + budgets[t] * plannedFraction(planned[t].es, planned[t].ef, statusDay), 0);
  const ev = ids.reduce((s, t) => s + (budgets[t] * (percents[t] || 0)) / 100, 0);
  const ac = Number(actualCost);
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  const eac = cpi ? bac / cpi : bac;
  return {
    BAC: bac, PV: pv, EV: ev, AC: ac, CV: ev - ac, SV: ev - pv, CPI: cpi, SPI: spi,
    EAC: eac, ETC: eac - ac, VAC: bac - eac, TCPI: bac - ac !== 0 ? (bac - ev) / (bac - ac) : null,
    pctComplete: bac ? (ev / bac) * 100 : 0, pctPlanned: bac ? (pv / bac) * 100 : 0,
  };
}

export function classifyIndex(v, warn, crit) {
  if (v === null || v === undefined) return 'N/A';
  if (v < crit) return 'CRITICAL';
  if (v < warn) return 'WARNING';
  return 'OK';
}

export function pvCurve(ids, budgets, planned, start, finish, step = 7) {
  const pts = [];
  let d = start;
  for (;;) {
    pts.push([d, ids.reduce((s, t) => s + budgets[t] * plannedFraction(planned[t].es, planned[t].ef, d), 0)]);
    if (d >= finish) break;
    d = Math.min(d + step, finish);
  }
  return pts;
}

// ------------------------------------------------------------------ risk
export const riskScore = (l, i) => Number(l) * Number(i);
export const riskLevel = (s) => (s >= 15 ? 'High' : s >= 8 ? 'Medium' : 'Low');

export function rankRisks(risks) {
  const ranked = [...risks].sort((a, b) =>
    riskScore(b.likelihood, b.impact) - riskScore(a.likelihood, a.impact) || b.impact - a.impact || a.code.localeCompare(b.code));
  return ranked.map((r, i) => {
    const score = riskScore(r.likelihood, r.impact);
    return { ...r, rank: i + 1, score, level: riskLevel(score) };
  });
}
