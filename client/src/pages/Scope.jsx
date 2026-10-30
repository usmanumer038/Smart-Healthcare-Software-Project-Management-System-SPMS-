import React, { useState } from 'react';
import { api, fmtMoney } from '../api.js';
import { Badge, Btn, FormModal, Loading, Modal, Panel, Table, Tabs, Toolbar, confirmDel, enumOpt, opt, saver, useAction, useApp, useLoad } from '../ui.jsx';

const TABS = ['Requirements', 'Work Breakdown Structure', 'Change requests'];
const ST = { Approved: 'r-good', Proposed: 'r-warn', Rejected: 'r-muted', Pending: 'r-warn' };

export default function Scope() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div>
      <div className="page-head"><div><h1>Scope Management & WBS</h1><p className="muted">Only approved requirements form the scope baseline; new scope enters only through approved change requests</p></div></div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === TABS[0] && <Requirements />}
      {tab === TABS[1] && <WbsTree />}
      {tab === TABS[2] && <ChangeRequests />}
    </div>
  );
}

function Requirements() {
  const { enums } = useApp();
  const rows = useLoad('/requirements');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!rows) return <Loading />;
  const cur = rows.find((r) => r.id === sel);
  const status = (s) => act(() => api(`/requirements/${sel}/status`, { method: 'POST', body: { status: s } }), `Requirement ${s.toLowerCase()}.`);
  const fields = [{ key: 'title', label: 'Title' }, { key: 'priority', label: 'Priority (MoSCoW)', type: 'select', options: enumOpt(enums.PRIORITIES), allowEmpty: false, default: 'Must' },
    { key: 'description', label: 'Description', type: 'textarea' }];
  return (
    <Panel title="Requirements">
      <Toolbar>
        <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add requirement</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
        <Btn kind="good" disabled={!cur} onClick={() => status('Approved')}>Approve</Btn>
        <Btn disabled={!cur} onClick={() => status('Rejected')}>Reject</Btn>
        <Btn disabled={!cur} onClick={() => status('Proposed')}>Back to proposed</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/requirements/${sel}`)}>Delete</Btn>
      </Toolbar>
      <Table rows={rows} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} rowClass={(r) => ST[r.status]} columns={[
        { key: 'code', label: 'Code', width: 60 }, { key: 'title', label: 'Requirement' },
        { key: 'priority', label: 'Priority', render: (r) => <Badge tone={r.priority === 'Must' ? 'bad' : r.priority === 'Should' ? 'warn' : 'neutral'}>{r.priority}</Badge> },
        { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> }, { key: 'source', label: 'Source' },
        { key: 'crCode', label: 'CR' }, { key: 'wbsCodes', label: 'In WBS' }]} />
      {dlg && <FormModal title={dlg.mode === 'add' ? 'Add requirement' : `Edit ${dlg.row.code}`} fields={fields} initial={dlg.row}
        onSubmit={saver(act, dlg.mode === 'add' ? '/requirements' : `/requirements/${dlg.row.id}`, dlg.mode === 'add', 'Requirement saved.')} onClose={() => setDlg(null)} />}
    </Panel>
  );
}

function WbsTree() {
  const rows = useLoad('/wbs');
  const reqs = useLoad('/requirements');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [closed, setClosed] = useState(new Set());
  const [dlg, setDlg] = useState(null);
  if (!rows || !reqs) return <Loading />;
  const byId = Object.fromEntries(rows.map((w) => [w.id, w]));
  const hidden = (w) => { let p = w.parentId; while (p) { if (closed.has(p)) return true; p = byId[p]?.parentId; } return false; };
  const hasKids = (id) => rows.some((w) => w.parentId === id);
  const cur = byId[sel];
  const root = rows.find((w) => w.nodeType === 'Project');
  const fields = (isRoot) => [{ key: 'name', label: 'Name' },
    { key: 'nodeType', label: 'Type', type: 'select', allowEmpty: false, options: isRoot ? [{ value: 'Project', label: 'Project (root)' }] : enumOpt(['Deliverable', 'Work Package']) },
    ...(isRoot ? [] : [{ key: 'parentId', label: 'Parent', type: 'select', allowEmpty: false, options: opt(rows.filter((w) => w.nodeType !== 'Work Package'), (w) => `${w.code} ${w.name}`) }]),
    { key: 'requirementId', label: 'Approved requirement', type: 'select', options: opt(reqs.filter((r) => r.status === 'Approved'), (r) => `${r.code} ${r.title}`),
      hint: 'Only approved requirements are offered (scope control)' },
    { key: 'description', label: 'Description', type: 'textarea' }];
  const toggle = (id) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Panel title="Work Breakdown Structure (hierarchical)">
      <Toolbar>
        <Btn kind="primary" onClick={() => (root ? setDlg({ mode: 'add', row: { parentId: cur && cur.nodeType !== 'Work Package' ? cur.id : root.id, nodeType: 'Work Package' } }) : setDlg({ mode: 'root' }))}>
          {root ? 'Add child element' : 'Create WBS root'}</Btn>
        <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
        <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/wbs/${sel}`)}>Delete</Btn>
        <Btn onClick={() => setClosed(new Set())}>Expand all</Btn>
        <span className="muted small">Select a deliverable, then "Add child element"</span>
      </Toolbar>
      <Table rows={rows.filter((w) => !hidden(w))} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })}
        rowClass={(w) => (w.reqStatus && w.reqStatus !== 'Approved' ? 'r-bad' : w.nodeType !== 'Work Package' ? 'r-head' : '')} columns={[
          { key: 'code', label: 'WBS code / element', render: (w) => (
            <span style={{ paddingLeft: w.depth * 22 }} className="tree-cell">
              {hasKids(w.id) ? <button className="twisty" onClick={(e) => { e.stopPropagation(); toggle(w.id); }}>{closed.has(w.id) ? '▸' : '▾'}</button> : <span className="twisty" />}
              <b>{w.code}</b>&nbsp; {w.name}
            </span>) },
          { key: 'nodeType', label: 'Type' }, { key: 'reqCode', label: 'Requirement' },
          { key: 'reqStatus', label: 'Req. status', render: (w) => (w.reqStatus ? <Badge>{w.reqStatus}</Badge> : '') },
          { key: 'taskCount', label: 'Activities', align: 'right', render: (w) => (w.nodeType === 'Work Package' ? w.taskCount : '') },
          { key: 'rollup', label: 'Budget (rolled up)', align: 'right', render: (w) => fmtMoney(w.rollup) }]} />
      {dlg && <FormModal title={dlg.mode === 'edit' ? `Edit WBS ${dlg.row.code}` : dlg.mode === 'root' ? 'Create WBS root' : 'Add WBS element'}
        fields={fields(dlg.mode === 'root' || dlg.row?.nodeType === 'Project')} initial={dlg.row || { nodeType: 'Project' }}
        onSubmit={saver(act, dlg.mode === 'edit' ? `/wbs/${dlg.row.id}` : '/wbs', dlg.mode !== 'edit', 'WBS saved.')} onClose={() => setDlg(null)} />}
    </Panel>
  );
}

function ChangeRequests() {
  const { enums, project } = useApp();
  const rows = useLoad('/change-requests');
  const s = useLoad('/schedule');
  const members = useLoad('/members');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!rows || !s || !members) return <Loading />;
  const cur = rows.find((r) => r.id === sel);
  const taskOpts = opt(s.tasks, (t) => `${t.code} ${t.name}`);
  const fields = [{ key: 'title', label: 'Change title' }, { key: 'requestedBy', label: 'Requested by' },
    { key: 'description', label: 'Description', type: 'textarea' }, { key: 'justification', label: 'Justification', type: 'textarea' },
    { key: 'requestDate', label: 'Request date', type: 'date', default: project?.statusDate },
    { key: 'priority', label: 'Priority', type: 'select', allowEmpty: false, options: enumOpt(enums.PRIORITIES), default: 'Should' },
    { key: 'costImpact', label: 'Cost impact (PKR)', type: 'number', default: '0' },
    { key: 'scheduleImpact', label: 'Schedule impact (days)', type: 'number', default: '0', hint: 'Becomes a new activity on approval' },
    { key: 'afterTaskId', label: 'New work follows activity', type: 'select', options: taskOpts },
    { key: 'beforeTaskId', label: '…and must finish before', type: 'select', options: taskOpts },
    { key: 'assigneeId', label: 'Assign new work to', type: 'select', options: opt(members, (m) => `${m.name} (${m.role})`) }];
  const preview = async () => { try { setDlg({ mode: 'impact', imp: await api(`/change-requests/${sel}/impact`) }); } catch (e) { act(() => { throw e; }); } };
  return (
    <>
      <Panel title="Change requests">
        <Toolbar>
          <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>New change request</Btn>
          <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
          <Btn disabled={!cur} onClick={preview}>Preview impact / approve</Btn>
          <Btn disabled={!cur} onClick={() => setDlg({ mode: 'reject' })}>Reject</Btn>
          <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/change-requests/${sel}`)}>Delete</Btn>
        </Toolbar>
        <Table rows={rows} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} rowClass={(r) => ST[r.status]} columns={[
          { key: 'code', label: 'Code' }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          { key: 'priority', label: 'Priority' }, { key: 'costImpact', label: 'Cost impact', align: 'right', render: (r) => fmtMoney(r.costImpact) },
          { key: 'scheduleImpact', label: 'Days', align: 'right' }, { key: 'afterCode', label: 'After' }, { key: 'beforeCode', label: 'Before' },
          { key: 'reqCode', label: 'Req.' }, { key: 'taskCode', label: 'Activity' }, { key: 'requestedBy', label: 'Requested by' },
          { key: 'requestDate', label: 'Requested' }, { key: 'decisionDate', label: 'Decided' }]} />
      </Panel>
      <Panel title="Details">
        {cur ? (
          <div className="detail">
            <h4>{cur.code} — {cur.title} <Badge>{cur.status}</Badge></h4>
            <p><b>Description:</b> {cur.description || '-'}</p>
            <p><b>Justification:</b> {cur.justification}</p>
            <p><b>Impact:</b> +{fmtMoney(cur.costImpact)}, +{cur.scheduleImpact} days {cur.afterCode && `(inserted after ${cur.afterCode}${cur.beforeCode ? `, before ${cur.beforeCode}` : ''})`}</p>
            <p><b>Decision:</b> {cur.decidedBy || '-'} {cur.decisionDate && `on ${cur.decisionDate}`} {cur.decisionNotes && `— ${cur.decisionNotes}`}</p>
          </div>
        ) : <p className="muted">Select a change request. Approving a CR automatically approves its requirement, adds a WBS deliverable + work package, inserts a new activity into the dependency network, and raises the approved budget and deadline.</p>}
      </Panel>
      {(dlg?.mode === 'add' || dlg?.mode === 'edit') && <FormModal wide title={dlg.mode === 'add' ? 'New change request' : `Edit ${dlg.row.code}`} fields={fields} initial={dlg.row}
        onSubmit={saver(act, dlg.mode === 'add' ? '/change-requests' : `/change-requests/${dlg.row.id}`, dlg.mode === 'add', 'Change request saved.')} onClose={() => setDlg(null)} />}
      {dlg?.mode === 'impact' && <ImpactDialog imp={dlg.imp} onClose={() => setDlg(null)} act={act} />}
      {dlg?.mode === 'reject' && <FormModal title={`Reject ${cur.code}`} submitText="Reject" initial={{ decidedBy: 'Change Control Board' }}
        fields={[{ key: 'decidedBy', label: 'Rejected by' }, { key: 'notes', label: 'Reason', type: 'textarea' }]}
        onSubmit={async (v) => { await api(`/change-requests/${sel}/reject`, { method: 'POST', body: v }); act(async () => {}, `${cur.code} rejected.`); }}
        onClose={() => setDlg(null)} />}
    </>
  );
}

function ImpactDialog({ imp, onClose, act }) {
  const [by, setBy] = useState('Change Control Board');
  const [err, setErr] = useState('');
  const pending = imp.cr.status === 'Pending';
  const approve = async () => {
    try {
      const r = await api(`/change-requests/${imp.cr.id}/approve`, { method: 'POST', body: { decidedBy: by, notes: 'Approved via UI' } });
      act(async () => {}, `${imp.cr.code} approved. New activity ${r.taskCode || '-'}; budget ${imp.rows[1][2]}, deadline ${imp.rows[3][2]}.`);
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={`Impact of ${imp.cr.code}: ${imp.cr.title}`} onClose={onClose} wide>
      <table className="grid impact">
        <thead><tr><th>Item</th><th>Before</th><th /><th>After approval</th></tr></thead>
        <tbody>{imp.rows.map(([k, a, b]) => <tr key={k} className={String(a) !== String(b) ? 'r-warn' : ''}><td>{k}</td><td>{a}</td><td>→</td><td><b>{b}</b></td></tr>)}</tbody>
      </table>
      {pending ? (
        <div className="approve-row">
          <label className="field"><span>Approved by</span><input value={by} onChange={(e) => setBy(e.target.value)} /></label>
          {err && <div className="form-error">{err}</div>}
          <div className="form-actions"><button className="btn btn-default" onClick={onClose}>Close</button><button className="btn btn-good" onClick={approve}>Approve change request</button></div>
        </div>
      ) : <p className="muted">This change request is already {imp.cr.status}.</p>}
    </Modal>
  );
}
