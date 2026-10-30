import React, { useState } from 'react';
import { api, f3, fmtMoney } from '../api.js';
import { Badge, Btn, Card, FormModal, Loading, Modal, Panel, Table, useAction, useLoad } from '../ui.jsx';

const TONE = { OK: 'good', WARNING: 'warn', CRITICAL: 'bad', 'N/A': 'neutral' };

export default function Dashboard() {
  const d = useLoad('/dashboard');
  const act = useAction();
  const [dlg, setDlg] = useState(null);
  if (!d) return <Loading />;
  const { project: p, evm: ev, schedule: s } = d;
  const over = ev.EAC > p.approvedBudget;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Project dashboard</h1>
          <p className="muted">Live snapshot computed from the database at status date {p.statusDate}</p>
        </div>
        <div className="row-gap">
          <Btn onClick={() => setDlg('settings')}>Monitoring settings</Btn>
          <Btn onClick={async () => setDlg({ issues: await api('/consistency') })}>Consistency check</Btn>
        </div>
      </div>

      <div className="progress-block">
        <div className="progress-labels"><span>Work complete <b>{ev.pctComplete.toFixed(1)}%</b></span><span>Planned <b>{ev.pctPlanned.toFixed(1)}%</b></span></div>
        <div className="progress"><div className="bar" style={{ width: `${ev.pctComplete}%` }} /><div className="mark" style={{ left: `${ev.pctPlanned}%` }} /></div>
      </div>

      <div className="kpis">
        <Card title="Overall progress" value={`${ev.pctComplete.toFixed(1)}%`} sub={`Planned ${ev.pctPlanned.toFixed(1)}%`} tone={ev.pctComplete < ev.pctPlanned ? 'warn' : 'good'} />
        <Card title="Budget status (EAC)" value={fmtMoney(ev.EAC)} sub={`Approved ${fmtMoney(p.approvedBudget)} · Spent ${fmtMoney(ev.AC)}`} tone={over ? 'bad' : ev.VAC < 0 ? 'warn' : 'good'} />
        <Card title="CPI (cost)" value={f3(ev.CPI)} sub={`${ev.cpiStatus} · CV ${fmtMoney(ev.CV)}`} tone={TONE[ev.cpiStatus]} />
        <Card title="SPI (schedule)" value={f3(ev.SPI)} sub={`${ev.spiStatus} · SV ${fmtMoney(ev.SV)}`} tone={TONE[ev.spiStatus]} />
        <Card title="Forecast finish" value={s.forecastFinish} sub={`Deadline ${s.deadline} · ${s.slip > 0 ? '+' : ''}${s.slip} days`} tone={s.slip > 0 ? 'bad' : 'good'} />
        <Card title="Delayed activities" value={d.delayed.length} sub={d.delayed.map((t) => t.code).join(', ') || 'None'} tone={d.delayed.length ? 'bad' : 'good'} />
        <Card title="Pending change requests" value={d.pendingCrs.length} sub={d.pendingCrs.map((c) => c.code).join(', ') || 'None'} tone={d.pendingCrs.length ? 'warn' : 'good'} />
        <Card title="Unresolved critical defects" value={d.criticalDefects.length} sub={`${d.openDefects} open defects in total`} tone={d.criticalDefects.length ? 'bad' : 'good'} />
      </div>

      <div className="grid-2">
        <Panel title={`Alerts & warnings (${d.alerts.length})`}>
          <ul className="alerts">
            {d.alerts.map(([lvl, msg], i) => <li key={i} className={lvl}><Badge tone={lvl === 'CRITICAL' ? 'bad' : 'warn'}>{lvl}</Badge>{msg}</li>)}
          </ul>
        </Panel>
        <Panel title="Delayed activities">
          <Table maxHeight={290} rows={d.delayed} rowClass={() => 'r-bad'} columns={[
            { key: 'code', label: 'Code' }, { key: 'name', label: 'Activity' }, { key: 'ef', label: 'Planned' },
            { key: 'fe', label: 'Forecast' }, { key: 'delay', label: 'Delay', align: 'right', render: (r) => `+${r.delay} d` }]} />
        </Panel>
        <Panel title="Pending change requests">
          <Table rows={d.pendingCrs} columns={[
            { key: 'code', label: 'Code' }, { key: 'title', label: 'Title' },
            { key: 'costImpact', label: 'Cost impact', align: 'right', render: (r) => fmtMoney(r.costImpact) },
            { key: 'scheduleImpact', label: 'Days', align: 'right' }, { key: 'requestDate', label: 'Requested' }]} />
        </Panel>
        <Panel title="Unresolved critical defects">
          <Table rows={d.criticalDefects} rowClass={() => 'r-bad'} columns={[
            { key: 'code', label: 'Code' }, { key: 'title', label: 'Defect' }, { key: 'assignee', label: 'Assigned' },
            { key: 'status', label: 'Status', render: (r) => <Badge>{r.status}</Badge> }]} />
        </Panel>
      </div>

      {dlg === 'settings' && (
        <FormModal title="Monitoring settings" initial={{ statusDate: p.statusDate, cpiWarn: p.cpiWarn, cpiCrit: p.cpiCrit, spiWarn: p.spiWarn, spiCrit: p.spiCrit }}
          fields={[{ key: 'statusDate', label: 'Status (data) date', type: 'date' },
            { key: 'cpiWarn', label: 'CPI warning below', type: 'number' }, { key: 'cpiCrit', label: 'CPI critical below', type: 'number' },
            { key: 'spiWarn', label: 'SPI warning below', type: 'number' }, { key: 'spiCrit', label: 'SPI critical below', type: 'number' }]}
          onSubmit={async (v) => { await api('/project/settings', { method: 'PUT', body: v }); act(async () => {}, 'Settings applied.'); }}
          onClose={() => setDlg(null)} />
      )}
      {dlg?.issues && (
        <Modal title="Consistency check" onClose={() => setDlg(null)}>
          <ul className="alerts">
            {dlg.issues.length === 0 && <li>No consistency problems found.</li>}
            {dlg.issues.map(([lvl, msg], i) => <li key={i} className={lvl}><Badge tone={lvl === 'CRITICAL' ? 'bad' : 'warn'}>{lvl}</Badge>{msg}</li>)}
          </ul>
        </Modal>
      )}
    </div>
  );
}
