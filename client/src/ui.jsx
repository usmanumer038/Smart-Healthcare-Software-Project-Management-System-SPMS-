// Shared UI building blocks: app context, data hooks, table, modal forms, cards, tabs.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function useLoad(path) {
  const { version, toast } = useApp();
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!path) return undefined;
    api(path).then((d) => alive && setData(d)).catch((e) => toast(e.message, 'error'));
    return () => { alive = false; };
  }, [path, version]);
  return data;
}

// run a mutation, refresh every view, show feedback
export function useAction() {
  const { refresh, toast } = useApp();
  return async (fn, success) => {
    try {
      const out = await fn();
      refresh();
      if (success) toast(typeof success === 'function' ? success(out) : success, 'ok');
      return out ?? true;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  };
}

export function Loading() { return <div className="loading">Loading…</div>; }

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="subtabs">
      {tabs.map((t) => (
        <button key={t} className={t === active ? 'active' : ''} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}

export function Card({ title, value, sub, tone = 'neutral' }) {
  return (
    <div className={`kpi tone-${tone}`}>
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <h3>{title}</h3>
          <div className="panel-actions">{actions}</div>
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Toolbar({ children }) { return <div className="toolbar">{children}</div>; }

export function Btn({ children, kind = 'default', ...p }) {
  return <button className={`btn btn-${kind}`} {...p}>{children}</button>;
}

export function Badge({ children, tone }) {
  return <span className={`badge badge-${tone || String(children).toLowerCase().replace(/[^a-z]/g, '')}`}>{children}</span>;
}

const WRAP = new Set(['name', 'title', 'description', 'action', 'details', 'affectedCodes', 'responsibility', 'criterion', 'expected', 'actual', 'note', 'justification', 'taskCodes', 'module']);

export function Table({ columns, rows, selected, onSelect, onDouble, rowClass, empty = 'No records', maxHeight }) {
  const [sort, setSort] = useState(null);
  const sorted = useMemo(() => {
    if (!sort || !rows) return rows || [];
    const { key, asc } = sort;
    return [...rows].sort((a, b) => {
      const x = a[key]; const y = b[key];
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true });
      return asc ? r : -r;
    });
  }, [rows, sort]);
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align || 'left' }}
                onClick={() => setSort((s) => ({ key: c.key, asc: s?.key === c.key ? !s.asc : true }))}>
                {c.label}{sort?.key === c.key ? (sort.asc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length} className="empty">{empty}</td></tr>}
          {sorted.map((r, i) => (
            <tr key={r.id ?? i} className={`${rowClass ? rowClass(r) : ''} ${selected && selected === r.id ? 'selected' : ''}`}
              onClick={() => onSelect && onSelect(r.id)} onDoubleClick={() => onDouble && onDouble(r)}>
              {columns.map((c) => (
                <td key={c.key} className={WRAP.has(c.key) || c.wrap ? 'wrap' : ''} style={{ textAlign: c.align || 'left' }}>{c.render ? c.render(r) : r[c.key] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head"><h3>{title}</h3><button className="x" onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

// fields: {key,label,type:'text'|'textarea'|'number'|'date'|'select'|'multi'|'checkbox'|'static',options:[{value,label}],hint,extra}
export function FormModal({ title, fields, initial = {}, onSubmit, onClose, submitText = 'Save', wide }) {
  const [vals, setVals] = useState(() => {
    const v = {};
    for (const f of fields) v[f.key] = initial[f.key] ?? f.default ?? (f.type === 'multi' ? [] : f.type === 'checkbox' ? false : '');
    return v;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await onSubmit(vals); onClose(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} className="form">
        {fields.map((f) => (
          <label key={f.key} className={`field ${f.type === 'textarea' || f.type === 'multi' ? 'full' : ''}`}>
            <span>{f.label}</span>
            <FieldInput f={f} value={vals[f.key]} onChange={(v) => set(f.key, v)} />
            {f.hint && <small>{f.hint}</small>}
            {f.extra && f.extra(vals, set)}
          </label>
        ))}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" kind="primary" disabled={busy}>{busy ? 'Saving…' : submitText}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function FieldInput({ f, value, onChange }) {
  if (f.type === 'static') return <div className="static">{value}</div>;
  if (f.type === 'textarea') return <textarea rows={f.rows || 3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'select') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {f.allowEmpty !== false && <option value="">{f.placeholder || '- none -'}</option>}
        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (f.type === 'multi') {
    const sel = new Set(value || []);
    return (
      <div className="multi">
        {f.options.map((o) => (
          <label key={o.value} className={sel.has(o.value) ? 'on' : ''}>
            <input type="checkbox" checked={sel.has(o.value)}
              onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(o.value); else n.delete(o.value); onChange([...n]); }} />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  if (f.type === 'checkbox') return <input type="checkbox" className="check" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  return <input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined}
    value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

export function Confirm({ title, message, onYes, onClose, yesText = 'Confirm', danger }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="confirm-body">{message}</div>
      <div className="form-actions">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind={danger ? 'danger' : 'primary'} onClick={() => { onYes(); onClose(); }}>{yesText}</Btn>
      </div>
    </Modal>
  );
}

// little helper hook for "which dialog is open"
export function useDialog() {
  const [d, setD] = useState(null);
  return [d, setD, () => setD(null)];
}

export const opt = (rows, label) => (rows || []).map((r) => ({ value: r.id, label: label(r) }));
export const enumOpt = (list) => list.map((x) => ({ value: x, label: x }));

export const confirmDel = (act, path, msg = 'Deleted.') =>
  window.confirm('Delete this record?') && act(() => api(path, { method: 'DELETE' }), msg);

// save helper used by FormModal: throws so the dialog stays open on validation errors
export const saver = (act, path, isNew, msg = 'Saved.') => async (v) => {
  await api(path, { method: isNew ? 'POST' : 'PUT', body: v });
  act(async () => {}, msg);
};
