import React, { useState } from 'react';
import { api, dayNum, f3, fmtMoney, fmtNum, shortDate } from '../api.js';
import { Badge, Btn, Card, FormModal, Loading, Panel, Table, Tabs, Toolbar, confirmDel, opt, useAction, useApp, useLoad } from '../ui.jsx';

const TABS = ['Earned Value Management', 'Cost estimates & expenditure'];
const TONE = { OK: 'good', WARNING: 'warn', CRITICAL: 'bad', 'N/A': 'neutral' };

export default function Cost() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div>
      <div className="page-head"><div><h1>Cost Management & Earned Value Analysis</h1><p className="muted">PV, EV, AC, CPI and SPI computed from the cost baseline, progress and recorded expenditure</p></div></div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === TABS[0] ? <Evm /> : <Expenditure />}
    </div>
  );
}

function Evm() {
  const ev = useLoad('/evm');
  if (!ev) return <Loading />;
  const neg = (v) => (v < 0 ? 'bad' : 'neutral');
  return (
    <>
      <div className="kpis six">
        <Card title="BAC — planned budget" value={fmtNum(ev.BAC)} sub="PKR" />
        <Card title="Planned Value (PV)" value={fmtNum(ev.PV)} sub="PKR" />
        <Card title="Earned Value (EV)" value={fmtNum(ev.EV)} sub="PKR" />
        <Card title="Actual Cost (AC)" value={fmtNum(ev.AC)} sub="PKR" />
        <Card title="CPI = EV / AC" value={f3(ev.CPI)} sub={ev.cpiStatus} tone={TONE[ev.cpiStatus]} />
        <Card title="SPI = EV / PV" value={f3(ev.SPI)} sub={ev.spiStatus} tone={TONE[ev.spiStatus]} />
        <Card title="CV = EV − AC" value={fmtNum(ev.CV)} sub="PKR" tone={neg(ev.CV)} />
        <Card title="SV = EV − PV" value={fmtNum(ev.SV)} sub="PKR" tone={neg(ev.SV)} />
        <Card title="EAC = BAC / CPI" value={fmtNum(ev.EAC)} sub="forecast at completion" tone={ev.EAC > ev.approvedBudget ? 'bad' : 'neutral'} />
        <Card title="VAC = BAC − EAC" value={fmtNum(ev.VAC)} sub="PKR" tone={neg(ev.VAC)} />
        <Card title="ETC = EAC − AC" value={fmtNum(ev.ETC)} sub="still to spend" />
        <Card title="TCPI" value={f3(ev.TCPI)} sub="efficiency needed for the rest" tone={ev.TCPI > 1.05 ? 'warn' : 'good'} />
      </div>
      <div className="grid-2 cost-grid">
        <div>
          <Panel title="Automatic cost / schedule warnings">
            <ul className="alerts">
              {ev.alerts.length === 0 && <li>Performance is within thresholds.</li>}
              {ev.alerts.map(([l, m], i) => <li key={i} className={l}><Badge tone={l === 'CRITICAL' ? 'bad' : 'warn'}>{l}</Badge>{m}</li>)}
            </ul>
          </Panel>
          <Panel title="EVM per activity">
            <Table maxHeight={330} rows={ev.tasks} rowClass={(r) => (r.CPI !== null && r.CPI < ev.cpiCrit ? 'r-bad' : r.CPI !== null && r.CPI < ev.cpiWarn ? 'r-warn' : '')} columns={[
              { key: 'code', label: 'Code' }, { key: 'name', label: 'Activity' },
              ...['BAC', 'PV', 'EV', 'AC'].map((k) => ({ key: k, label: k, align: 'right', render: (r) => fmtNum(r[k]) })),
              { key: 'CPI', label: 'CPI', align: 'right', render: (r) => f3(r.CPI) }, { key: 'SPI', label: 'SPI', align: 'right', render: (r) => f3(r.SPI) }]} />
          </Panel>
        </div>
        <Panel title="S-curve — cumulative PV vs AC, EV at status date"><SCurve ev={ev} /></Panel>
      </div>
    </>
  );
}

function SCurve({ ev }) {
  const W = 640; const H = 420; const L = 64; const R = 20; const T = 20; const B = 56;
  if (!ev.curve.length) return null;
  const d0 = dayNum(ev.curve[0][0]); const d1 = Math.max(dayNum(ev.curve.at(-1)[0]), dayNum(ev.statusDate));
  const ymax = Math.max(...ev.curve.map((p) => p[1]), ...ev.acCurve.map((p) => p[1]), ev.EAC, ev.approvedBudget, 1) * 1.05;
  const X = (d) => L + ((dayNum(d) - d0) / Math.max(d1 - d0, 1)) * (W - L - R);
  const Y = (v) => H - B - (v / ymax) * (H - T - B);
  const path = (pts) => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${X(d).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const sx = X(ev.statusDate);
  const labels = [['EV', ev.EV, '#16a34a'], ['AC', ev.AC, '#dc2626'], ['PV', ev.PV, '#2563eb']].sort((a, b) => Y(a[1]) - Y(b[1]));
  let last = -99;
  const step = Math.max(1, Math.floor(ev.curve.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="scurve">
      {[0, 1, 2, 3, 4, 5].map((i) => { const v = (ymax * i) / 5; return (
        <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#eef2f7" /><text x={L - 8} y={Y(v) + 4} textAnchor="end" className="axis">{(v / 1e6).toFixed(1)}M</text></g>); })}
      {ev.curve.filter((_, i) => i % step === 0).map(([d]) => <text key={d} x={X(d)} y={H - B + 16} textAnchor="middle" className="axis">{shortDate(d)}</text>)}
      <line x1={L} x2={W - R} y1={Y(ev.approvedBudget)} y2={Y(ev.approvedBudget)} stroke="#d97706" strokeDasharray="6 4" />
      <text x={W - R} y={Y(ev.approvedBudget) - 6} textAnchor="end" className="axis" fill="#d97706">Approved budget</text>
      <path d={path(ev.curve)} fill="none" stroke="#2563eb" strokeWidth="2.5" />
      {ev.acCurve.length > 1 && <path d={path(ev.acCurve)} fill="none" stroke="#dc2626" strokeWidth="2.5" />}
      <line x1={sx} x2={sx} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="4 3" />
      <circle cx={sx} cy={Y(ev.EV)} r="5" fill="#16a34a" />
      {labels.map(([k, v, c]) => { let y = Y(v); y = Math.max(y, last + 14); last = y; return <text key={k} x={sx - 8} y={y + 4} textAnchor="end" className="axis strong" fill={c}>{k} {(v / 1e6).toFixed(2)}M</text>; })}
      {[['PV (planned)', '#2563eb'], ['AC (actual)', '#dc2626'], ['EV (earned)', '#16a34a']].map(([t, c], i) => (
        <g key={t}><rect x={L + i * 130} y={H - 22} width="14" height="10" fill={c} rx="2" /><text x={L + 20 + i * 130} y={H - 13} className="axis">{t}</text></g>))}
    </svg>
  );
}

function Expenditure() {
  const { project } = useApp();
  const tasks = useLoad('/tasks/costs');
  const exps = useLoad('/expenses');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(false);
  if (!tasks || !exps) return <Loading />;
  const rows = tasks.map((t) => ({ ...t, labour: t.duration * t.dailyRate, bcwp: (t.budget * t.percent) / 100, variance: (t.budget * t.percent) / 100 - t.actualCost }));
  const bac = rows.reduce((s, r) => s + r.budget, 0); const spent = rows.reduce((s, r) => s + r.actualCost, 0);
  return (
    <div className="grid-2 wide-left">
      <Panel title="Activity cost estimates vs actuals">
        <div className="totals">
          <span>Total planned budget (BAC) <b>{fmtMoney(bac)}</b></span><span>Approved budget <b>{fmtMoney(project?.approvedBudget)}</b></span>
          <span>Reserve <b>{fmtMoney((project?.approvedBudget || 0) - bac)}</b></span><span>Actual spent <b>{fmtMoney(spent)}</b></span>
        </div>
        <Table maxHeight={560} rows={rows} rowClass={(r) => (r.variance < 0 ? 'r-bad' : '')} columns={[
          { key: 'code', label: 'Code' }, { key: 'name', label: 'Activity' }, { key: 'assignee', label: 'Assigned' },
          { key: 'duration', label: 'Days', align: 'right' }, { key: 'labour', label: 'Labour est.', align: 'right', render: (r) => fmtNum(r.labour) },
          { key: 'budget', label: 'Budget', align: 'right', render: (r) => fmtNum(r.budget) },
          { key: 'bcwp', label: 'Budgeted cost of work done', align: 'right', render: (r) => fmtNum(r.bcwp) },
          { key: 'actualCost', label: 'Actual', align: 'right', render: (r) => fmtNum(r.actualCost) },
          { key: 'variance', label: 'Variance', align: 'right', render: (r) => fmtNum(r.variance) }]} />
      </Panel>
      <Panel title="Expense ledger (actual expenditure)">
        <Toolbar>
          <Btn kind="primary" onClick={() => setDlg(true)}>Record expense</Btn>
          <Btn kind="danger" disabled={!sel} onClick={() => confirmDel(act, `/expenses/${sel}`, 'Expense deleted.')}>Delete</Btn>
        </Toolbar>
        <Table maxHeight={560} rows={exps} selected={sel} onSelect={setSel} columns={[
          { key: 'date', label: 'Date' }, { key: 'taskCode', label: 'Activity' },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtNum(r.amount) }, { key: 'description', label: 'Description' }]} />
      </Panel>
      {dlg && <FormModal title="Record expense" initial={{ date: project?.statusDate }} fields={[
        { key: 'taskId', label: 'Activity (started only)', type: 'select', options: opt(tasks.filter((t) => t.actualStart), (t) => `${t.code} ${t.name}`) },
        { key: 'date', label: 'Date', type: 'date' }, { key: 'amount', label: 'Amount (PKR)', type: 'number' }, { key: 'description', label: 'Description' }]}
        onSubmit={async (v) => { await api('/expenses', { method: 'POST', body: v }); act(async () => {}, 'Expense recorded.'); }} onClose={() => setDlg(false)} />}
    </div>
  );
}
