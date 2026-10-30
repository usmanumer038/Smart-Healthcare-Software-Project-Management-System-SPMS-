import React, { useState } from 'react';
import { api } from '../api.js';
import { Badge, Btn, FormModal, Loading, Panel, Table, Tabs, Toolbar, confirmDel, enumOpt, opt, saver, useAction, useApp, useLoad } from '../ui.jsx';

const TABS = ['Defect tracking', 'Quality checklist & test results'];

export default function Quality() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div>
      <div className="page-head"><div><h1>Quality Management</h1><p className="muted">Defects with severity, owner and resolution; inspection/test checklist per deliverable</p></div></div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === TABS[0] ? <Defects /> : <Checklist />}
    </div>
  );
}

function Defects() {
  const { enums, project } = useApp();
  const rows = useLoad('/defects');
  const members = useLoad('/members');
  const sched = useLoad('/schedule');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!rows || !members || !sched) return <Loading />;
  const open = rows.filter((r) => ['Open', 'In Progress'].includes(r.status));
  const cur = rows.find((r) => r.id === sel);
  const fields = [{ key: 'title', label: 'Defect title' }, { key: 'module', label: 'Module / deliverable' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'severity', label: 'Severity', type: 'select', allowEmpty: false, options: enumOpt(enums.SEVERITIES), default: 'High' },
    { key: 'assignedId', label: 'Assigned to', type: 'select', options: opt(members, (m) => `${m.name} (${m.role})`), placeholder: '- select -' },
    { key: 'status', label: 'Status', type: 'select', allowEmpty: false, options: enumOpt(enums.DEFECT_STATUSES), default: 'Open' },
    { key: 'reportedDate', label: 'Reported date', type: 'date', default: project?.statusDate },
    { key: 'resolvedDate', label: 'Resolved date', type: 'date', hint: 'Required when Resolved / Closed' },
    { key: 'taskId', label: 'Related activity', type: 'select', options: opt(sched.tasks, (t) => `${t.code} ${t.name}`) }];
  const tone = (r) => (r.severity === 'Critical' && ['Open', 'In Progress'].includes(r.status) ? 'r-bad' : ['Open', 'In Progress'].includes(r.status) ? 'r-warn' : 'r-good');
  return (
    <Panel title="Defect tracking">
      <div className="chips">
        <span>Open defects <b>{open.length}</b></span>
        {enums.SEVERITIES.map((s) => <span key={s}>{s} <b>{open.filter((r) => r.severity === s).length}</b></span>)}
        <span>Resolved / closed <b>{rows.length - open.length}</b></span>
      </div>
      <Toolbar>
        <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Log defect</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit / change status</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/defects/${sel}`)}>Delete</Btn>
      </Toolbar>
      <Table rows={rows} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} rowClass={tone} columns={[
        { key: 'code', label: 'Code' }, { key: 'title', label: 'Defect' }, { key: 'module', label: 'Module' },
        { key: 'severity', label: 'Severity', render: (r) => <Badge tone={{ Critical: 'bad', High: 'warn', Medium: 'neutral', Low: 'good' }[r.severity]}>{r.severity}</Badge> },
        { key: 'assignee', label: 'Assigned to' }, { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
        { key: 'reportedDate', label: 'Reported' }, { key: 'resolvedDate', label: 'Resolved' }, { key: 'taskCode', label: 'Activity' }]} />
      {dlg && <FormModal wide title={dlg.mode === 'add' ? 'Log defect' : `Edit ${dlg.row.code}`} fields={fields} initial={dlg.row}
        onSubmit={saver(act, dlg.mode === 'add' ? '/defects' : `/defects/${dlg.row.id}`, dlg.mode === 'add', 'Defect saved.')} onClose={() => setDlg(null)} />}
    </Panel>
  );
}

function Checklist() {
  const { enums, project } = useApp();
  const rows = useLoad('/checks');
  const wbs = useLoad('/wbs');
  const members = useLoad('/members');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!rows || !wbs || !members) return <Loading />;
  const cur = rows.find((r) => r.id === sel);
  const pass = rows.filter((r) => r.result === 'Pass').length;
  const memberOpts = opt(members, (m) => `${m.name} (${m.role})`);
  const fields = [{ key: 'wbsId', label: 'Deliverable (WBS)', type: 'select', options: opt(wbs, (w) => `${w.code} ${w.name}`) },
    { key: 'criterion', label: 'Quality criterion' },
    { key: 'checkType', label: 'Type', type: 'select', allowEmpty: false, options: enumOpt(enums.CHECK_TYPES), default: 'Test' },
    { key: 'expected', label: 'Expected result' }];
  return (
    <Panel title="Quality checklist & inspection / test results">
      <div className="chips">
        <span>Passed <b>{pass}/{rows.length}</b> ({rows.length ? Math.round((pass / rows.length) * 100) : 0}%)</span>
        <span>Failed <b>{rows.filter((r) => r.result === 'Fail').length}</b></span><span>Pending <b>{rows.filter((r) => r.result === 'Pending').length}</b></span>
      </div>
      <Toolbar>
        <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add checklist item</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
        <Btn kind="good" disabled={!cur} onClick={() => setDlg({ mode: 'result', row: cur })}>Record inspection / test result</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/checks/${sel}`)}>Delete</Btn>
      </Toolbar>
      <Table rows={rows} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'result', row: r })}
        rowClass={(r) => ({ Pass: 'r-good', Fail: 'r-bad' }[r.result] || 'r-warn')} columns={[
          { key: 'code', label: 'Code' }, { key: 'wbsCode', label: 'WBS' }, { key: 'wbsName', label: 'Deliverable' }, { key: 'criterion', label: 'Criterion' },
          { key: 'checkType', label: 'Type' }, { key: 'expected', label: 'Expected' }, { key: 'actual', label: 'Actual' },
          { key: 'result', label: 'Result', render: (r) => <Badge tone={{ Pass: 'good', Fail: 'bad' }[r.result] || 'warn'}>{r.result}</Badge> },
          { key: 'inspector', label: 'Inspector' }, { key: 'checkDate', label: 'Date' }, { key: 'defectCode', label: 'Defect' }]} />
      {(dlg?.mode === 'add' || dlg?.mode === 'edit') && <FormModal title={dlg.mode === 'add' ? 'Add checklist item' : `Edit ${dlg.row.code}`} fields={fields} initial={dlg.row}
        onSubmit={saver(act, dlg.mode === 'add' ? '/checks' : `/checks/${dlg.row.id}`, dlg.mode === 'add', 'Checklist item saved.')} onClose={() => setDlg(null)} />}
      {dlg?.mode === 'result' && <FormModal title={`Record result — ${dlg.row.code} ${dlg.row.criterion}`}
        initial={{ ...dlg.row, checkDate: dlg.row.checkDate || project?.statusDate, severity: 'High' }} fields={[
          { key: 'result', label: 'Result', type: 'select', allowEmpty: false, options: enumOpt(enums.CHECK_RESULTS) },
          { key: 'actual', label: 'Actual result / observation', type: 'textarea' },
          { key: 'inspectorId', label: 'Inspector / tester', type: 'select', options: memberOpts }, { key: 'checkDate', label: 'Date', type: 'date' },
          { key: 'severity', label: 'Severity if failed', type: 'select', allowEmpty: false, options: enumOpt(enums.SEVERITIES) },
          { key: 'assignTo', label: 'Assign raised defect to', type: 'select', options: memberOpts }]}
        onSubmit={async (v) => {
          const r = await api(`/checks/${dlg.row.id}/result`, { method: 'POST', body: v });
          act(async () => {}, r.raised ? 'Result recorded — the failed check automatically raised a defect.' : 'Result recorded.');
        }} onClose={() => setDlg(null)} />}
    </Panel>
  );
}
