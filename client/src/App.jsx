import React, { useCallback, useEffect, useState } from 'react';
import { api, fmtMoney } from './api.js';
import { Ctx } from './ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Initiation from './pages/Initiation.jsx';
import Scope from './pages/Scope.jsx';
import Schedule from './pages/Schedule.jsx';
import Cost from './pages/Cost.jsx';
import Quality from './pages/Quality.jsx';
import Risk from './pages/Risk.jsx';

const PAGES = [
  ['dashboard', 'Dashboard', Dashboard],
  ['initiation', '1 · Initiation & Integration', Initiation],
  ['scope', '2 · Scope & WBS', Scope],
  ['schedule', '3 · Schedule & Resources', Schedule],
  ['cost', '4 · Cost & EVM', Cost],
  ['quality', '5 · Quality', Quality],
  ['risk', '5 · Risk Control', Risk],
];

export default function App() {
  const [page, setPage] = useState(() => (window.location.hash.slice(1) || 'dashboard'));
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [enums, setEnums] = useState(null);
  const [project, setProject] = useState(null);

  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => { api('/enums').then(setEnums).catch((e) => toast(e.message, 'error')); }, []);
  useEffect(() => { api('/project').then(setProject).catch(() => {}); }, [version]);
  useEffect(() => { window.location.hash = page; }, [page]);

  const resetData = async () => {
    if (!window.confirm('Delete ALL records and reload the case-study sample data?')) return;
    try { await api('/admin/reset', { method: 'POST' }); refresh(); toast('Sample data reloaded.'); } catch (e) { toast(e.message, 'error'); }
  };

  const Page = (PAGES.find((p) => p[0] === page) || PAGES[0])[2];
  return (
    <Ctx.Provider value={{ version, refresh, toast, enums, project, setPage }}>
      <header className="topbar">
        <div className="brand">
          <div className="logo">SH</div>
          <div>
            <div className="title">{project?.name || 'Smart Healthcare SPMS'}</div>
            <div className="meta">
              <span className="pill strong">{project?.status}</span>
              <span>Status date <b>{project?.statusDate}</b></span>
              <span>Budget <b>{project && fmtMoney(project.approvedBudget)}</b></span>
              <span>Deadline <b>{project?.deadline}</b></span>
              <span className="muted">MERN · MongoDB</span>
            </div>
          </div>
        </div>
        <div className="top-actions">
          <a className="btn btn-light" href="/api/report">Export HTML report</a>
          <button className="btn btn-light" onClick={resetData}>Reset demo data</button>
        </div>
      </header>
      <nav className="mainnav">
        {PAGES.map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>
        ))}
      </nav>
      <main className="content">{enums ? <Page /> : <div className="loading">Connecting to server…</div>}</main>
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
