import React, { useState } from 'react';
import { api, dayNum, fmtMoney, fromDay, shortDate } from '../api.js';
import { Badge, Btn, FormModal, Loading, Panel, Table, Tabs, Toolbar, confirmDel, opt, saver, useAction, useLoad } from '../ui.jsx';

const TABS = ['Activities', 'Delay analysis', 'Gantt chart'];
const stateRow = (r) => ({ Completed: 'r-good', Delayed: 'r-bad', 'In Progress': 'r-info' }[r.state] || '');

export default function Schedule() {
  const [tab, setTab] = useState(TABS[0]);
  const s = useLoad('/schedule');
  return (
    <div>
      <div className="page-head"><div><h1>Schedule & Resource Management</h1><p className="muted">Critical Path Method from durations and finish-to-start dependencies; forecast from actual progress</p></div></div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {!s ? <Loading /> : tab === TABS[0] ? <Activities s={s} /> : tab === TABS[1] ? <Delays s={s} /> : <Gantt s={s} />}
    </div>
  );
}

function Activities({ s }) {
  const members = useLoad('/members');
  const wbs = useLoad('/wbs');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!members || !wbs) return <Loading />;
  const cur = s.tasks.find((t) => t.id === sel);
  const taskFields = (tid) => [
    { key: 'name', label: 'Activity name' },
    { key: 'wbsId', label: 'WBS work package', type: 'select', allowEmpty: false, options: opt(wbs.filter((w) => w.nodeType === 'Work Package'), (w) => `${w.code} ${w.name}`) },
    { key: 'assigneeId', label: 'Assigned to', type: 'select', options: opt(members, (m) => `${m.name} (${m.role}, ${fmtMoney(m.dailyRate)}/day)`) },
    { key: 'duration', label: 'Duration (days)', type: 'number', default: '5' },
    { key: 'budget', label: 'Estimated cost (PKR)', type: 'number', extra: (v, set) => (
      <button type="button" className="link" onClick={async () => {
        try { set('budget', String((await api(`/estimate?assigneeId=${v.assigneeId}&duration=${v.duration}`)).cost)); } catch (e) { alert(e.message); }
      }}>Estimate = duration × daily rate</button>) },
    { key: 'preds', label: 'Predecessors (finish-to-start)', type: 'multi', options: opt(s.tasks.filter((t) => t.id !== tid), (t) => `${t.code} ${t.name}`) },
    { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 }];
  return (
    <Panel title={`Activities (${s.tasks.length})`}>
      <Toolbar>
        <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add activity</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit / dependencies</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'progress', row: cur })}>Update progress</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/tasks/${sel}`)}>Delete</Btn>
        <span className="legend"><i className="lg-good" />Completed <i className="lg-info" />In progress <i className="lg-bad" />Delayed</span>
      </Toolbar>
      <Table rows={s.tasks} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} rowClass={stateRow} columns={[
        { key: 'code', label: 'Code' }, { key: 'name', label: 'Activity' }, { key: 'wbsCode', label: 'WBS' }, { key: 'assignee', label: 'Assigned' },
        { key: 'duration', label: 'Dur', align: 'right' }, { key: 'predCodes', label: 'Predecessors' },
        { key: 'es', label: 'Plan start' }, { key: 'ef', label: 'Plan finish' }, { key: 'float', label: 'Float', align: 'right' },
        { key: 'critical', label: 'Critical', render: (r) => (r.critical ? <Badge tone="bad">CP</Badge> : '') },
        { key: 'actualStart', label: 'Act. start' }, { key: 'actualEnd', label: 'Act. finish' },
        { key: 'percent', label: '%', align: 'right', render: (r) => `${r.percent}%` }, { key: 'fe', label: 'Forecast fin.' },
        { key: 'delay', label: 'Delay', align: 'right', render: (r) => (r.delay > 0 ? `+${r.delay}` : r.delay) },
        { key: 'budget', label: 'Budget', align: 'right', render: (r) => r.budget.toLocaleString('en-US') }]} />
      {(dlg?.mode === 'add' || dlg?.mode === 'edit') && <FormModal wide title={dlg.mode === 'add' ? 'Add activity' : `Edit ${dlg.row.code} ${dlg.row.name}`}
        fields={taskFields(dlg.row?.id)} initial={dlg.row ? { ...dlg.row, duration: String(dlg.row.duration), budget: String(dlg.row.budget) } : { wbsId: wbs.find((w) => w.nodeType === 'Work Package')?.id }}
        onSubmit={saver(act, dlg.mode === 'add' ? '/tasks' : `/tasks/${dlg.row.id}`, dlg.mode === 'add', 'Activity saved; schedule recalculated.')} onClose={() => setDlg(null)} />}
      {dlg?.mode === 'progress' && <FormModal title={`Progress — ${dlg.row.code} ${dlg.row.name}`} initial={{ ...dlg.row, percent: String(dlg.row.percent) }}
        fields={[{ key: 'actualStart', label: 'Actual start', type: 'date' }, { key: 'actualEnd', label: 'Actual finish', type: 'date', hint: 'Leave empty if not finished' },
          { key: 'percent', label: '% complete', type: 'number', hint: '0 – 100' }]}
        onSubmit={async (v) => { await api(`/tasks/${dlg.row.id}/progress`, { method: 'PUT', body: v }); act(async () => {}, 'Progress updated.'); }} onClose={() => setDlg(null)} />}
    </Panel>
  );
}

function Delays({ s }) {
  const delayed = s.tasks.filter((t) => t.state === 'Delayed');
  return (
    <>
      <div className={`summary-banner ${s.slip > 0 ? 'bad' : 'good'}`}>
        <div><span>Planned finish (CPM)</span><b>{s.plannedFinish}</b></div>
        <div><span>Forecast finish</span><b>{s.forecastFinish}</b></div>
        <div><span>Approved deadline</span><b>{s.deadline}</b></div>
        <div><span>Deadline variance</span><b>{s.slip > 0 ? '+' : ''}{s.slip} days</b></div>
        <div><span>Status date</span><b>{s.statusDate}</b></div>
      </div>
      <Panel title="Root-cause delays and their impact on dependent activities">
        <Table rows={s.impacts.map((i) => ({ ...i, id: i.task }))} rowClass={(r) => (r.state !== 'Completed' ? 'r-bad' : 'r-warn')} columns={[
          { key: 'code', label: 'Activity' }, { key: 'name', label: 'Name' }, { key: 'ownDelay', label: 'Own delay', align: 'right', render: (r) => `${r.ownDelay} d` },
          { key: 'totalDelay', label: 'Total delay', align: 'right', render: (r) => `${r.totalDelay} d` }, { key: 'state', label: 'Status' },
          { key: 'affectedCodes', label: 'Affected downstream activities (forecast slip)', render: (r) => r.affectedCodes.join(', ') || '-' }]} />
      </Panel>
      <Panel title="Delayed activities">
        <Table rows={delayed} rowClass={() => 'r-bad'} columns={[
          { key: 'code', label: 'Code' }, { key: 'name', label: 'Activity' }, { key: 'assignee', label: 'Assigned' },
          { key: 'ef', label: 'Planned finish' }, { key: 'fe', label: 'Forecast finish' }, { key: 'delay', label: 'Delay', align: 'right', render: (r) => `+${r.delay} d` },
          { key: 'percent', label: 'Actual %', align: 'right', render: (r) => `${r.percent}%` }, { key: 'plannedPct', label: 'Planned %', align: 'right', render: (r) => `${r.plannedPct}%` },
          { key: 'critical', label: 'Critical', render: (r) => (r.critical ? <Badge tone="bad">CP</Badge> : '') }]} />
      </Panel>
    </>
  );
}

const COLORS = { Completed: '#16a34a', 'In Progress': '#2563eb', Delayed: '#ea580c', 'Not Started': '#64748b' };

function Gantt({ s }) {
  const [px, setPx] = useState(8);
  const rows = [...s.tasks].sort((a, b) => a.es.localeCompare(b.es) || a.code.localeCompare(b.code));
  if (!rows.length) return <Panel title="Gantt chart"><p className="muted">No activities.</p></Panel>;
  const start = dayNum(s.startDate);
  const end = Math.max(dayNum(s.forecastFinish), dayNum(s.deadline), dayNum(s.plannedFinish)) + 7;
  const L = 290; const top = 40; const rh = 30;
  const X = (d) => L + (dayNum(d) - start) * px;
  const W = L + (end - start) * px + 80;
  const H = top + (rows.length + s.milestones.length) * rh + 30;
  const pos = {};
  rows.forEach((t, i) => { pos[t.id] = { x1: X(t.fs), x2: X(t.fe) + px, y: top + i * rh + 20 }; });
  const weeks = [];
  for (let d = start; d <= end; d += 7) weeks.push(fromDay(d));
  const lines = [[s.statusDate, '#2563eb', 'Status date', '5 3'], [s.deadline, '#dc2626', 'Approved deadline', null], [s.baselineDeadline, '#64748b', 'Original deadline', '2 3']];
  return (
    <Panel title="Gantt chart — baseline (grey) vs forecast (coloured)" actions={<label className="zoom">Zoom <input type="range" min="4" max="16" value={px} onChange={(e) => setPx(Number(e.target.value))} /></label>}>
      <div className="legend gantt-legend">
        <i style={{ background: '#cbd5e1' }} />Baseline (CPM) {Object.entries(COLORS).map(([k, c]) => <React.Fragment key={k}><i style={{ background: c }} />{k} </React.Fragment>)}
        <span className="muted">· red labels = critical path · arrows = dependencies · ◆ milestones (grey planned, coloured forecast)</span>
      </div>
      <div className="gantt-scroll">
        <svg width={W} height={H} className="gantt">
          {weeks.map((d) => (
            <g key={d}><line x1={X(d)} x2={X(d)} y1={top - 8} y2={H - 20} stroke="#eef2f7" />
              <text x={X(d) + 3} y={top - 14} className="axis">{shortDate(d)}</text></g>
          ))}
          {rows.map((t, i) => {
            const y = top + i * rh; const c = COLORS[t.state] || '#64748b'; const p = pos[t.id];
            return (
              <g key={t.id}>
                {i % 2 === 0 && <rect x={0} y={y} width={W} height={rh} fill="#f8fafc" />}
                <text x={10} y={y + 19} className={t.critical ? 'lbl crit' : 'lbl'}>{t.code}  {t.name.slice(0, 34)}</text>
                <rect x={X(t.es)} y={y + 5} width={X(t.ef) + px - X(t.es)} height={7} rx={2} fill="#cbd5e1" />
                <rect x={p.x1} y={y + 14} width={p.x2 - p.x1} height={11} rx={3} fill="#fff" stroke={c} strokeWidth={t.critical ? 2 : 1} />
                <rect x={p.x1} y={y + 14} width={((p.x2 - p.x1) * t.percent) / 100} height={11} rx={3} fill={c} />
                <text x={p.x2 + 5} y={y + 24} className={t.delay > 0 ? 'note bad' : 'note'}>{t.percent}%{t.delay > 0 ? `  +${t.delay}d` : ''}</text>
              </g>
            );
          })}
          {rows.flatMap((t) => t.preds.filter((p) => pos[p]).map((p) => {
            const a = pos[p]; const b = pos[t.id];
            return <path key={`${p}-${t.id}`} d={`M${a.x2},${a.y} h5 V${b.y} H${b.x1 - 2}`} fill="none" stroke="#94a3b8" markerEnd="url(#arrow)" />;
          }))}
          {s.milestones.map((m, j) => {
            const y = top + (rows.length + j) * rh + 15;
            return (
              <g key={m.id}>
                <text x={10} y={y + 4} className="lbl ms">{m.name.slice(0, 42)}</text>
                {[[m.planned, '#94a3b8'], [m.forecast, m.variance > 0 ? '#dc2626' : '#16a34a']].map(([d, col], k) => {
                  const x = X(d) + px;
                  return <path key={k} d={`M${x},${y - 7} L${x + 7},${y} L${x},${y + 7} L${x - 7},${y} Z`} fill={col} />;
                })}
              </g>
            );
          })}
          {lines.map(([d, col, name, dash], k) => (
            <g key={name}><line x1={X(d)} x2={X(d)} y1={top - 8} y2={H - 20} stroke={col} strokeWidth={2} strokeDasharray={dash || undefined} />
              <text x={X(d) + 4} y={H - 6 - k * 0} className="axis strong" fill={col} transform={`translate(0,${-k * 13})`}>{name}</text></g>
          ))}
          <defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" /></marker></defs>
        </svg>
      </div>
    </Panel>
  );
}
