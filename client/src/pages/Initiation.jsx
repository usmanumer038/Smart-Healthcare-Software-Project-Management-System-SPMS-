import React, { useEffect, useState } from 'react';
import { api, fmtMoney } from '../api.js';
import { Badge, Btn, Confirm, FormModal, Loading, Panel, Table, Tabs, Toolbar, confirmDel, enumOpt, opt, useAction, useApp, useLoad } from '../ui.jsx';

const TABS = ['Project charter', 'Management plan', 'Status & milestones', 'Team & responsibilities', 'Project closure', 'Baseline & audit log'];

export default function Initiation() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div>
      <div className="page-head"><div><h1>Initiation & Integration Management</h1><p className="muted">Charter, plan, milestones, responsibilities and closure</p></div></div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === TABS[0] && <Charter />}
      {tab === TABS[1] && <Plan />}
      {tab === TABS[2] && <Milestones />}
      {tab === TABS[3] && <Team />}
      {tab === TABS[4] && <Closure />}
      {tab === TABS[5] && <Logs />}
    </div>
  );
}

function Charter() {
  const { enums, version } = useApp();
  const act = useAction();
  const p = useLoad('/project');
  const [v, setV] = useState(null);
  useEffect(() => { if (p) setV({ ...p }); }, [p, version]);
  if (!v) return <Loading />;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const statuses = enums.PROJECT_STATUSES.filter((s) => s !== 'Closed' || p.status === 'Closed');
  return (
    <Panel title="Project charter" actions={<Btn kind="primary" onClick={() => act(() => api('/project', { method: 'PUT', body: v }), 'Charter saved.')}>Save charter</Btn>}>
      <div className="form charter">
        <label className="field full"><span>Project name</span><input value={v.name} onChange={set('name')} /></label>
        <label className="field"><span>Client</span><input value={v.client || ''} onChange={set('client')} /></label>
        <label className="field"><span>Sponsor</span><input value={v.sponsor || ''} onChange={set('sponsor')} /></label>
        <label className="field"><span>Project manager</span><input value={v.manager || ''} onChange={set('manager')} /></label>
        <label className="field"><span>Project status</span>
          <select value={v.status} onChange={set('status')}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="field full"><span>Objectives</span><textarea rows={4} value={v.objectives} onChange={set('objectives')} /></label>
        <label className="field full"><span>Stakeholders</span><textarea rows={2} value={v.stakeholders} onChange={set('stakeholders')} /></label>
        <label className="field"><span>Scope boundary — IN</span><textarea rows={3} value={v.scopeIn} onChange={set('scopeIn')} /></label>
        <label className="field"><span>Scope boundary — OUT</span><textarea rows={3} value={v.scopeOut || ''} onChange={set('scopeOut')} /></label>
        <label className="field"><span>Approved budget (PKR)</span><input value={v.approvedBudget} onChange={set('approvedBudget')} />
          <small>After approval, changes only via approved change requests</small></label>
        <label className="field"><span>Original baseline</span><div className="static">{fmtMoney(p.baselineBudget)} · deadline {p.baselineDeadline}</div></label>
        <label className="field"><span>Start date</span><input type="date" value={v.startDate} onChange={set('startDate')} /></label>
        <label className="field"><span>Deadline</span><input type="date" value={v.deadline} onChange={set('deadline')} /></label>
      </div>
    </Panel>
  );
}

function Plan() {
  const plan = useLoad('/plan');
  const act = useAction();
  const [sec, setSec] = useState(0);
  const [text, setText] = useState('');
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (plan) setText(plan[sec].content); }, [plan, sec]);
  if (!plan) return <Loading />;
  return (
    <div className="plan">
      <div className="plan-list">
        {plan.map((s, i) => <button key={s.section} className={i === sec ? 'active' : ''} onClick={() => setSec(i)}>{s.section}</button>)}
        <Btn onClick={() => setAsk(true)}>Generate all from project data</Btn>
      </div>
      <Panel title={plan[sec].section} actions={<><span className="muted small">Updated {plan[sec].updated || 'never'}</span>
        <Btn kind="primary" onClick={() => act(() => api(`/plan/${encodeURIComponent(plan[sec].section)}`, { method: 'PUT', body: { content: text } }), 'Section saved.')}>Save section</Btn></>}>
        <textarea className="mono" rows={22} value={text} onChange={(e) => setText(e.target.value)} />
      </Panel>
      {ask && <Confirm title="Generate plan" message="Regenerate all plan sections from current scope, schedule, cost and quality data? Manual edits will be replaced."
        onYes={() => act(() => api('/plan/generate', { method: 'POST' }), 'Plan regenerated.')} onClose={() => setAsk(false)} />}
    </div>
  );
}

function Milestones() {
  const s = useLoad('/schedule');
  const members = useLoad('/members');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!s || !members) return <Loading />;
  const fields = [{ key: 'name', label: 'Milestone' },
    { key: 'taskId', label: 'Achieved when activity finishes', type: 'select', options: opt(s.tasks, (t) => `${t.code} ${t.name}`), allowEmpty: false },
    { key: 'ownerId', label: 'Responsible', type: 'select', options: opt(members, (m) => `${m.name} (${m.role})`) },
    { key: 'description', label: 'Description', type: 'textarea' }];
  const cur = s.milestones.find((m) => m.id === sel);
  const tone = (st) => (st === 'Achieved' ? 'good' : st.startsWith('Missed') ? 'bad' : st === 'On track' ? 'neutral' : 'warn');
  return (
    <Panel title="Project status & milestones">
      <div className="status-strip">
        <div><span>Start</span><b>{s.startDate}</b></div><div><span>Approved deadline</span><b>{s.deadline}</b></div>
        <div><span>Original deadline</span><b>{s.baselineDeadline}</b></div><div><span>Planned finish</span><b>{s.plannedFinish}</b></div>
        <div><span>Forecast finish</span><b className={s.slip > 0 ? 'bad' : 'good'}>{s.forecastFinish}</b></div>
        <div className="grow"><span>Critical path</span><b>{s.criticalPath.join(' → ')}</b></div>
      </div>
      <Toolbar>
        <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add milestone</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/milestones/${sel}`, 'Milestone deleted.')}>Delete</Btn>
      </Toolbar>
      <Table rows={s.milestones} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} columns={[
        { key: 'name', label: 'Milestone' }, { key: 'taskCode', label: 'Marked by' }, { key: 'owner', label: 'Responsible' },
        { key: 'planned', label: 'Planned' }, { key: 'forecast', label: 'Forecast' }, { key: 'actual', label: 'Actual' },
        { key: 'variance', label: 'Variance', align: 'right', render: (r) => (r.variance > 0 ? `+${r.variance} d` : `${r.variance} d`) },
        { key: 'status', label: 'Status', render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> }]} />
      {dlg && <FormModal title={dlg.mode === 'add' ? 'Add milestone' : 'Edit milestone'} fields={fields} initial={dlg.row || { taskId: s.tasks[0]?.id }}
        onSubmit={async (v) => { await api(dlg.mode === 'add' ? '/milestones' : `/milestones/${dlg.row.id}`, { method: dlg.mode === 'add' ? 'POST' : 'PUT', body: v }); act(async () => {}, 'Milestone saved.'); }}
        onClose={() => setDlg(null)} />}
    </Panel>
  );
}

function Team() {
  const rows = useLoad('/members');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!rows) return <Loading />;
  const cur = rows.find((r) => r.id === sel);
  const fields = [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'responsibility', label: 'Responsibilities', type: 'textarea' },
    { key: 'dailyRate', label: 'Daily rate (PKR)', type: 'number' }, { key: 'email', label: 'Email' }];
  return (
    <Panel title="Team & responsibilities">
      <Toolbar>
        <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add member</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/members/${sel}`, 'Member deleted.')}>Delete</Btn>
      </Toolbar>
      <Table rows={rows} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} columns={[
        { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'responsibility', label: 'Responsibilities' },
        { key: 'dailyRate', label: 'Daily rate', align: 'right', render: (r) => fmtMoney(r.dailyRate) },
        { key: 'taskCount', label: '# Activities', align: 'right' }, { key: 'taskCodes', label: 'Assigned activities' }, { key: 'email', label: 'Email' }]} />
      {dlg && <FormModal title={dlg.mode === 'add' ? 'Add team member' : 'Edit team member'} fields={fields} initial={dlg.row}
        onSubmit={async (v) => { await api(dlg.mode === 'add' ? '/members' : `/members/${dlg.row.id}`, { method: dlg.mode === 'add' ? 'POST' : 'PUT', body: v }); act(async () => {}, 'Member saved.'); }}
        onClose={() => setDlg(null)} />}
    </Panel>
  );
}

function Closure() {
  const c = useLoad('/closure');
  const p = useLoad('/project');
  const act = useAction();
  const [v, setV] = useState({ closedDate: '', acceptedBy: '', lessons: '', notes: '' });
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (p && !v.closedDate) setV((x) => ({ ...x, closedDate: p.statusDate })); }, [p]);
  if (!c) return <Loading />;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  return (
    <Panel title="Project closure">
      <p className="muted">The project can only be closed when all activities are complete, no critical defects are open, no change requests are pending and all quality checks pass. Closing makes every record read-only.</p>
      {c.record ? (
        <div className="closed-box">CLOSED on {c.record.closedDate} — accepted by {c.record.acceptedBy}, final cost {fmtMoney(c.record.finalCost)}<br />Lessons: {c.record.lessons}</div>
      ) : (
        <>
          {c.blockers.length > 0 && <div className="blockers"><b>Closure blocked:</b><ul>{c.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
          <div className="form">
            <label className="field"><span>Closure date</span><input type="date" value={v.closedDate} onChange={set('closedDate')} /></label>
            <label className="field"><span>Accepted by (client)</span><input value={v.acceptedBy} onChange={set('acceptedBy')} /></label>
            <label className="field full"><span>Lessons learned</span><textarea rows={4} value={v.lessons} onChange={set('lessons')} /></label>
            <label className="field full"><span>Closure notes</span><textarea rows={2} value={v.notes} onChange={set('notes')} /></label>
          </div>
          <Btn kind="primary" onClick={() => setAsk(true)}>Close project</Btn>
        </>
      )}
      {ask && <Confirm title="Close project" message="Closing is final and makes all records read-only. Continue?" danger yesText="Close project"
        onYes={() => act(() => api('/closure', { method: 'POST', body: v }), 'Project closed.')} onClose={() => setAsk(false)} />}
    </Panel>
  );
}

function Logs() {
  const b = useLoad('/baseline');
  const a = useLoad('/audit');
  if (!b || !a) return <Loading />;
  return (
    <>
      <Panel title="Baseline changes (approved change requests)">
        <Table rows={b} columns={[{ key: 'changeDate', label: 'Date' }, { key: 'crCode', label: 'CR' },
          { key: 'oldBudget', label: 'Old budget', align: 'right', render: (r) => fmtMoney(r.oldBudget) },
          { key: 'newBudget', label: 'New budget', align: 'right', render: (r) => fmtMoney(r.newBudget) },
          { key: 'oldDeadline', label: 'Old deadline' }, { key: 'newDeadline', label: 'New deadline' }, { key: 'note', label: 'Note' }]} />
      </Panel>
      <Panel title="Audit log">
        <Table rows={a} maxHeight={420} columns={[{ key: 'ts', label: 'Time', width: 150 }, { key: 'action', label: 'Action', width: 220 }, { key: 'details', label: 'Details' }]} />
      </Panel>
    </>
  );
}

