import React, { useState } from 'react';
import { Badge, Btn, FormModal, Loading, Panel, Table, Tabs, Toolbar, confirmDel, enumOpt, opt, saver, useAction, useApp, useLoad } from '../ui.jsx';

const TABS = ['Prioritization matrix', 'PDPC — risk response chart'];
const LVL = { High: 'r-bad', Medium: 'r-warn', Low: 'r-good' };

export default function Risk() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div>
      <div className="page-head"><div><h1>Risk Control</h1><p className="muted">Likelihood × Impact prioritization and Process Decision Program Chart with preventive / corrective actions</p></div></div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === TABS[0] ? <Matrix /> : <Pdpc />}
    </div>
  );
}

function Matrix() {
  const { enums } = useApp();
  const rows = useLoad('/risks');
  const members = useLoad('/members');
  const wbs = useLoad('/wbs');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!rows || !members || !wbs) return <Loading />;
  const cur = rows.find((r) => r.id === sel);
  const cells = {};
  for (const r of rows) if (r.status !== 'Closed') (cells[`${r.likelihood}-${r.impact}`] ||= []).push(r);
  const fields = [{ key: 'title', label: 'Risk / issue' }, { key: 'category', label: 'Category', type: 'select', allowEmpty: false, options: enumOpt(enums.RISK_CATEGORIES), default: 'Scope' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'wbsId', label: 'Affected deliverable', type: 'select', options: opt(wbs, (w) => `${w.code} ${w.name}`) },
    { key: 'likelihood', label: 'Likelihood (1–5)', type: 'number', default: '3' }, { key: 'impact', label: 'Impact (1–5)', type: 'number', default: '3' },
    { key: 'ownerId', label: 'Owner', type: 'select', options: opt(members, (m) => `${m.name} (${m.role})`) },
    { key: 'status', label: 'Status', type: 'select', allowEmpty: false, options: enumOpt(enums.RISK_STATUSES), default: 'Open' }];
  return (
    <div className="risk-layout">
      <Panel title="Risk prioritization matrix (Likelihood × Impact)">
        <div className="matrix">
          <div className="ylab">LIKELIHOOD</div>
          <div className="mgrid">
            {[5, 4, 3, 2, 1].map((l) => (
              <React.Fragment key={l}>
                <div className="axisn">{l}</div>
                {[1, 2, 3, 4, 5].map((i) => {
                  const sc = l * i; const lv = sc >= 15 ? 'hi' : sc >= 8 ? 'md' : 'lo';
                  return (
                    <div key={i} className={`cell ${lv}`}>
                      <span className="sc">{sc}</span>
                      {(cells[`${l}-${i}`] || []).map((r) => <button key={r.id} className={sel === r.id ? 'sel' : ''} onClick={() => setSel(r.id)}>{r.code}</button>)}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            <div />{[1, 2, 3, 4, 5].map((i) => <div key={i} className="axisn">{i}</div>)}
          </div>
          <div className="xlab">IMPACT (1 negligible … 5 severe)</div>
          <div className="legend"><i className="lg-bad" />High ≥ 15 <i className="lg-warn" />Medium 8–14 <i className="lg-good" />Low &lt; 8</div>
        </div>
      </Panel>
      <Panel title="Ranked risks and issues">
        <Toolbar>
          <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add risk / issue</Btn>
          <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
          <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/risks/${sel}`)}>Delete</Btn>
        </Toolbar>
        <Table rows={rows} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} rowClass={(r) => LVL[r.level]} columns={[
          { key: 'rank', label: '#', align: 'right' }, { key: 'code', label: 'Code' }, { key: 'title', label: 'Risk / issue' }, { key: 'category', label: 'Category' },
          { key: 'likelihood', label: 'L', align: 'right' }, { key: 'impact', label: 'I', align: 'right' }, { key: 'score', label: 'Score', align: 'right' },
          { key: 'level', label: 'Level', render: (r) => <Badge tone={{ High: 'bad', Medium: 'warn', Low: 'good' }[r.level]}>{r.level}</Badge> },
          { key: 'owner', label: 'Owner' }, { key: 'status', label: 'Status' }]} />
      </Panel>
      {dlg && <FormModal wide title={dlg.mode === 'add' ? 'Add risk / issue' : `Edit ${dlg.row.code}`} fields={fields}
        initial={dlg.row ? { ...dlg.row, likelihood: String(dlg.row.likelihood), impact: String(dlg.row.impact) } : undefined}
        onSubmit={saver(act, dlg.mode === 'add' ? '/risks' : `/risks/${dlg.row.id}`, dlg.mode === 'add', 'Risk saved.')} onClose={() => setDlg(null)} />}
    </div>
  );
}

function Pdpc() {
  const tree = useLoad('/pdpc');
  const cms = useLoad('/countermeasures');
  const risks = useLoad('/risks');
  const members = useLoad('/members');
  const act = useAction();
  const [sel, setSel] = useState(null);
  const [dlg, setDlg] = useState(null);
  if (!tree || !cms || !risks || !members) return <Loading />;
  const cur = cms.find((c) => c.id === sel);
  const fields = [{ key: 'riskId', label: 'Risk', type: 'select', options: opt(risks, (r) => `${r.code} ${r.title}`), placeholder: '- select -' },
    { key: 'actionType', label: 'Type', type: 'select', allowEmpty: false, options: [{ value: 'Preventive', label: 'Preventive (before it happens)' }, { value: 'Corrective', label: 'Corrective (if it happens)' }], default: 'Preventive' },
    { key: 'action', label: 'Action', type: 'textarea' }, { key: 'ownerId', label: 'Owner', type: 'select', options: opt(members, (m) => m.name) },
    { key: 'feasible', label: 'Feasible (O)', type: 'checkbox', default: true }];
  return (
    <>
      <Panel title="Process Decision Program Chart" actions={<span className="muted small">Goal → deliverable → potential problem → countermeasures (O feasible · X not feasible)</span>}>
        <div className="pdpc">
          <div className="pd-goal">{tree.goal}</div>
          <div className="pd-children">
            {Object.entries(tree.areas).map(([area, rs]) => (
              <div className="pd-branch" key={area}>
                <div className="pd-area">{area}</div>
                <div className="pd-children">
                  {rs.map((r) => (
                    <div className="pd-branch" key={r.id}>
                      <div className={`pd-risk lvl-${r.level}`}><b>#{r.rank} {r.code}</b> · score {r.score} ({r.level})<br />{r.title}</div>
                      <div className="pd-children">
                        {(r.measures.length ? r.measures : [{ id: 'none', actionType: '-', action: 'No countermeasure defined', feasible: false }]).map((m) => (
                          <div className="pd-branch" key={m.id}>
                            <div className={`pd-cm ${m.actionType} ${m.feasible ? 'ok' : 'no'}`} onClick={() => m.id !== 'none' && setSel(m.id)}>
                              <span className="mark">{m.feasible ? 'O' : 'X'}</span><b>{m.actionType}:</b> {m.action}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Countermeasures">
        <Toolbar>
          <Btn kind="primary" onClick={() => setDlg({ mode: 'add' })}>Add countermeasure</Btn>
          <Btn disabled={!cur} onClick={() => setDlg({ mode: 'edit', row: cur })}>Edit</Btn>
          <Btn kind="danger" disabled={!cur} onClick={() => confirmDel(act, `/countermeasures/${sel}`)}>Delete</Btn>
        </Toolbar>
        <Table maxHeight={300} rows={cms} selected={sel} onSelect={setSel} onDouble={(r) => setDlg({ mode: 'edit', row: r })} columns={[
          { key: 'riskCode', label: 'Risk' }, { key: 'actionType', label: 'Type' }, { key: 'action', label: 'Action' }, { key: 'owner', label: 'Owner' },
          { key: 'feasible', label: 'Feasible', render: (r) => (r.feasible ? <Badge tone="good">O yes</Badge> : <Badge tone="bad">X no</Badge>) }]} />
      </Panel>
      {dlg && <FormModal title={dlg.mode === 'add' ? 'Add countermeasure' : 'Edit countermeasure'} fields={fields} initial={dlg.row}
        onSubmit={saver(act, dlg.mode === 'add' ? '/countermeasures' : `/countermeasures/${dlg.row.id}`, dlg.mode === 'add', 'Countermeasure saved.')} onClose={() => setDlg(null)} />}
    </>
  );
}
