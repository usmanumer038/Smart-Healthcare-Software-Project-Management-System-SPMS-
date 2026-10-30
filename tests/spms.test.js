// Automated test cases (node:test). Run:  npm test
// Uses the same MongoDB connection logic as the app (MONGO_URI, local MongoDB, or embedded),
// in a separate database "smart_healthcare_spms_test". Writes TEST_CASES.md (expected vs actual).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DB_NAME = process.env.TEST_DB_NAME || 'smart_healthcare_spms_test';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { connectDB, disconnectDB, syncIndexes } = await import('../server/db.js');
const calc = await import('../server/calc.js');
const svc = await import('../server/service.js');
const { resetAndSeed, clearAll } = await import('../server/seed.js');
const M = await import('../server/models.js');
const { createApp } = await import('../server/app.js');

const RESULTS = [];
const record = (id, desc, expected, actual, ok) => RESULTS.push([id, desc, String(expected), String(actual), ok ? 'PASS' : 'FAIL']);
const J = (v) => JSON.stringify(v);

function check(id, desc, expected, actual) {
  const ok = J(expected) === J(actual);
  record(id, desc, J(expected), J(actual), ok);
  assert.deepEqual(actual, expected);
}
async function rejects(id, desc, fn) {
  let out = 'no error';
  try { await fn(); } catch (e) { out = e instanceof svc.ValidationError ? `ValidationError: ${e.message.split('\n')[0].slice(0, 80)}` : `${e.name}: ${e.message}`; }
  const ok = out.startsWith('ValidationError');
  record(id, desc, 'ValidationError (rejected)', out, ok);
  assert.ok(ok, out);
}

const code = async (Model, c) => String((await Model.findOne({ code: c }).lean())._id);

async function minimal() {
  await svc.saveCharter({ name: 'Mini', objectives: 'o', stakeholders: 's', scopeIn: 'i', approvedBudget: 100000, startDate: '2026-01-01', deadline: '2026-01-31' });
  await svc.saveSettings({ statusDate: '2026-01-10', cpiWarn: 0.95, cpiCrit: 0.9, spiWarn: 0.95, spiCrit: 0.9 });
  await svc.saveMember({ name: 'Dev', role: 'Developer', dailyRate: 1000 });
  const dev = String((await M.Member.findOne().lean())._id);
  const root = (await svc.saveWbs({ name: 'Root', nodeType: 'Project' })).id;
  const wp = (await svc.saveWbs({ name: 'WP', nodeType: 'Work Package', parentId: root })).id;
  const a = await svc.saveTask({ name: 'A', wbsId: wp, assigneeId: dev, duration: 3, budget: 3000 });
  const b = await svc.saveTask({ name: 'B', wbsId: wp, assigneeId: dev, duration: 2, budget: 2000 });
  await svc.setDependencies(b, [a]);
  return { a, b, dev, wp };
}

let conn;
before(async () => { conn = await connectDB({ quiet: true, ephemeral: true }); await syncIndexes(); });
beforeEach(async () => { await clearAll(); });
after(async () => {
  await clearAll();
  await disconnectDB();
  RESULTS.sort((x, y) => x[0].localeCompare(y[0], 'en', { numeric: true }));
  const passed = RESULTS.filter((r) => r[4] === 'PASS').length;
  const lines = ['# Test cases - Smart Healthcare SPMS (MERN)', '',
    `Automated run: ${passed}/${RESULTS.length} passed (${new Date().toISOString().slice(0, 16).replace('T', ' ')}). Re-run with \`npm test\`.`, '',
    '| ID | Test case | Expected result | Actual result | Status |', '|---|---|---|---|---|',
    ...RESULTS.map((r) => `| ${r.map((x) => x.replace(/\|/g, '/')).join(' | ')} |`)];
  fs.writeFileSync(path.join(ROOT, 'TEST_CASES.md'), lines.join('\n') + '\n');
});

// ------------------------------------------------------------------ scheduling
test('TC01 CPM forward pass', () => {
  const { res } = calc.plannedSchedule(['1', '2', '3'], { 1: 3, 2: 2, 3: 4 }, { 1: [], 2: ['1'], 3: [] }, calc.toDay('2026-01-01'));
  check('TC01', 'CPM forward pass: A(3d)->B(2d) from 2026-01-01; B finishes', '2026-01-05', calc.fromDay(res[2].ef));
});
test('TC02 critical path and float', () => {
  const { res } = calc.plannedSchedule(['1', '2', '3'], { 1: 3, 2: 2, 3: 4 }, { 1: [], 2: ['1'], 3: [] }, calc.toDay('2026-01-01'));
  check('TC02', 'Critical path and float (A,B critical; C float 1 day)', [true, true, false, 1], [res[1].critical, res[2].critical, res[3].critical, res[3].float]);
});
test('TC03 cycle rejected', async () => { const { a, b } = await minimal(); await rejects('TC03', 'Circular dependency A->B while B->A exists is rejected', () => svc.setDependencies(a, [b])); });
test('TC04 self dependency', async () => { const { a } = await minimal(); await rejects('TC04', 'Activity depending on itself is rejected', () => svc.setDependencies(a, [a])); });
test('TC05 delay forecast', async () => {
  await resetAndSeed();
  const t = (await svc.scheduleAnalysis()).tasks.find((x) => x.code === 'T12');
  check('TC05', 'T12 at 25% of 14 days on 2026-10-26 -> forecast finish / delay', ['2026-11-05', 13], [t.fe, t.delay]);
});
test('TC06 delay propagation', async () => {
  await resetAndSeed();
  const s = await svc.scheduleAnalysis();
  const i = s.impacts.find((x) => x.code === 'T12');
  check('TC06', 'T12 delay propagates to dependants and the final deadline', [true, 13], [i.affectedCodes.includes('T15 (+13d)'), s.slip]);
});

// ------------------------------------------------------------------ EVM
test('TC07 EVM values', async () => {
  await resetAndSeed();
  const e = await svc.evmAnalysis();
  check('TC07', 'EVM at status date: PV, EV, AC, CPI, SPI', [3884000, 3680000, 4000000, 0.92, 0.947],
    [Math.round(e.PV), Math.round(e.EV), Math.round(e.AC), Number(e.CPI.toFixed(3)), Number(e.SPI.toFixed(3))]);
});
test('TC08 thresholds', async () => {
  await resetAndSeed();
  const a = await svc.evmAnalysis();
  await svc.saveSettings({ statusDate: '2026-10-26', cpiWarn: 0.9, cpiCrit: 0.85, spiWarn: 0.9, spiCrit: 0.85 });
  const b = await svc.evmAnalysis();
  check('TC08', 'CPI/SPI warnings at 0.95 threshold; OK after lowering to 0.90', [['WARNING', 'WARNING'], ['OK', 'OK']], [[a.cpiStatus, a.spiStatus], [b.cpiStatus, b.spiStatus]]);
});
test('TC09 overrun alert', async () => {
  await resetAndSeed();
  await svc.addExpense({ taskId: await code(M.Task, 'T12'), date: '2026-10-26', amount: 2000000, description: 'overrun' });
  const e = await svc.evmAnalysis();
  check('TC09', 'Large overspend -> CPI critical and EAC > approved budget alert', ['CRITICAL', true], [e.cpiStatus, e.alerts.some(([, m]) => m.includes('exceeds approved budget'))]);
});
test('TC10 planned fraction', () => {
  check('TC10', 'Planned % at day 5 of a 10-day activity', 0.5, calc.plannedFraction(calc.toDay('2026-01-01'), calc.toDay('2026-01-10'), calc.toDay('2026-01-05')));
});

// ------------------------------------------------------------------ scope & change control
test('TC11 unapproved requirement blocked', async () => {
  await resetAndSeed();
  const root = String((await M.Wbs.findOne({ nodeType: 'Project' }).lean())._id);
  await rejects('TC11', 'WBS element linked to unapproved requirement R08 is rejected',
    async () => svc.saveWbs({ name: 'SMS', nodeType: 'Work Package', parentId: root, requirementId: await code(M.Requirement, 'R08') }));
});
test('TC12 CR requirement direct approval', async () => {
  await resetAndSeed();
  const r = await M.Requirement.findOne({ source: 'Change Request', status: 'Proposed' }).lean();
  await rejects('TC12', 'CR-sourced requirement cannot be approved directly', () => svc.setRequirementStatus(String(r._id), 'Approved'));
});
test('TC13 CR approval effects', async () => {
  await resetAndSeed();
  const p0 = await svc.getProject(); const s0 = await svc.scheduleAnalysis(); const e0 = await svc.evmAnalysis();
  const cid = await code(M.ChangeRequest, 'CR-002');
  const tcode = await svc.approveChangeRequest(cid, 'CCB');
  const p1 = await svc.getProject(); const s1 = await svc.scheduleAnalysis(); const e1 = await svc.evmAnalysis();
  const req = await M.Requirement.findOne({ crId: cid }).lean();
  const t14 = await M.Task.findOne({ code: 'T14' }).lean();
  const nt = await M.Task.findOne({ code: tcode }).lean();
  check('TC13', 'Approve CR-002: budget +350k, deadline +9d, BAC +350k, finish +9d, req approved, T14 depends on new activity',
    [350000, 9, 350000, 9, 'Approved', true],
    [p1.approvedBudget - p0.approvedBudget, calc.toDay(p1.deadline) - calc.toDay(p0.deadline), Math.round(e1.BAC - e0.BAC),
      calc.toDay(s1.plannedFinish) - calc.toDay(s0.plannedFinish), req.status, t14.preds.map(String).includes(String(nt._id))]);
});
test('TC14 double approval', async () => {
  await resetAndSeed();
  await rejects('TC14', 'Approving an already-approved CR is rejected', async () => svc.approveChangeRequest(await code(M.ChangeRequest, 'CR-001'), 'CCB'));
});
test('TC15 reject', async () => {
  await resetAndSeed();
  const b0 = (await svc.getProject()).approvedBudget;
  const cid = await code(M.ChangeRequest, 'CR-002');
  await svc.rejectChangeRequest(cid, 'CCB');
  check('TC15', 'Rejecting CR-002 leaves budget unchanged and rejects its requirement', [b0, 'Rejected'],
    [(await svc.getProject()).approvedBudget, (await M.Requirement.findOne({ crId: cid }).lean()).status]);
});
test('TC16 baseline requirement locked', async () => {
  await resetAndSeed();
  await rejects('TC16', 'Approved requirement in WBS cannot be rejected without a CR', async () => svc.setRequirementStatus(await code(M.Requirement, 'R01'), 'Rejected'));
});
test('TC17 preview equals approval', async () => {
  await resetAndSeed();
  const cid = await code(M.ChangeRequest, 'CR-002');
  const prev = await svc.previewChangeImpact(cid);
  await svc.approveChangeRequest(cid, 'CCB');
  check('TC17', 'Impact preview forecast finish equals actual result after approval', prev.rows[5][2], (await svc.scheduleAnalysis()).forecastFinish);
});

// ------------------------------------------------------------------ validation
test('TC18 100% without finish', async () => { const { a } = await minimal(); await rejects('TC18', '100% complete without actual finish date', () => svc.updateProgress(a, { actualStart: '2026-01-01', actualEnd: '', percent: 100 })); });
test('TC19 future actual', async () => { const { a } = await minimal(); await rejects('TC19', 'Actual start after status date', () => svc.updateProgress(a, { actualStart: '2026-01-20', actualEnd: '', percent: 10 })); });
test('TC20 FS violation', async () => { const { b } = await minimal(); await rejects('TC20', 'Successor B started before predecessor A finished', () => svc.updateProgress(b, { actualStart: '2026-01-02', actualEnd: '', percent: 10 })); });
test('TC21 bad date', async () => {
  await rejects('TC21', 'Invalid date format in charter', () => svc.saveCharter({ name: 'X', objectives: 'o', stakeholders: 's', scopeIn: 'i', approvedBudget: 1, startDate: '2026-13-45', deadline: '2026-01-31' }));
});
test('TC22 deadline before start', async () => {
  await rejects('TC22', 'Deadline before start date', () => svc.saveCharter({ name: 'X', objectives: 'o', stakeholders: 's', scopeIn: 'i', approvedBudget: 1, startDate: '2026-02-01', deadline: '2026-01-31' }));
});
test('TC23 non-numeric cost', async () => { const { wp } = await minimal(); await rejects('TC23', 'Non-numeric activity cost', () => svc.saveTask({ name: 'X', wbsId: wp, duration: 2, budget: 'abc' })); });
test('TC24 expense before start', async () => { const { a } = await minimal(); await rejects('TC24', 'Expense booked on an activity that has not started', () => svc.addExpense({ taskId: a, date: '2026-01-05', amount: 500 })); });
test('TC25 member delete blocked', async () => { const { dev } = await minimal(); await rejects('TC25', 'Deleting a team member assigned to activities', () => svc.deleteMember(dev)); });

// ------------------------------------------------------------------ quality & risk
test('TC26 resolved without date', async () => {
  await resetAndSeed();
  const m = String((await M.Member.findOne().lean())._id);
  await rejects('TC26', 'Resolved defect without resolved date', () => svc.saveDefect({ title: 'x', module: 'm', severity: 'Low', assignedId: m, status: 'Resolved', reportedDate: '2026-10-20' }));
});
test('TC27 failed check raises defect', async () => {
  await resetAndSeed();
  const n0 = await M.Defect.countDocuments();
  const q = await M.QualityCheck.findOne({ result: 'Pending' }).lean();
  const qa = String((await M.Member.findOne({ role: 'QA Engineer' }).lean())._id);
  await svc.recordCheckResult(String(q._id), { result: 'Fail', actual: 'Dropped at 12 min', inspectorId: qa, checkDate: '2026-10-26', severity: 'Critical' });
  check('TC27', 'Failed quality check automatically raises a linked defect', [n0 + 1, true],
    [await M.Defect.countDocuments(), !!(await M.QualityCheck.findById(q._id).lean()).defectId]);
});
test('TC28 risk ranking', () => {
  const r = calc.rankRisks([{ code: 'A', likelihood: 5, impact: 4 }, { code: 'B', likelihood: 4, impact: 5 }, { code: 'C', likelihood: 2, impact: 2 }]);
  check('TC28', 'Prioritization: equal score 20 -> higher impact first; levels', [['B', 20, 'High'], ['A', 20, 'High'], ['C', 4, 'Low']], r.map((x) => [x.code, x.score, x.level]));
});
test('TC29 likelihood range', async () => { await resetAndSeed(); await rejects('TC29', 'Risk likelihood 7 (outside 1-5)', () => svc.saveRisk({ title: 'x', category: 'Scope', likelihood: 7, impact: 3 })); });
test('TC30 PDPC', async () => {
  await resetAndSeed();
  const t = await svc.pdpcTree();
  const all = Object.values(t.areas).flat();
  check('TC30', 'PDPC contains every open risk with countermeasures', [8, true], [all.length, all.every((r) => r.measures.length > 0)]);
});

// ------------------------------------------------------------------ integration
test('TC31 closure blocked', async () => {
  await resetAndSeed();
  await rejects('TC31', 'Closing project with open activities / critical defects / pending CRs', () => svc.closeProject({ closedDate: '2026-10-26', acceptedBy: 'x', lessons: 'y' }));
});
test('TC32 closure ok then read-only', async () => {
  const { a, b } = await minimal();
  await svc.updateProgress(a, { actualStart: '2026-01-01', actualEnd: '2026-01-03', percent: 100 });
  await svc.updateProgress(b, { actualStart: '2026-01-04', actualEnd: '2026-01-05', percent: 100 });
  await svc.closeProject({ closedDate: '2026-01-10', acceptedBy: 'Client', lessons: 'Plan buffers' });
  let ro = false;
  try { await svc.saveMember({ name: 'New', role: 'QA', dailyRate: 1 }); } catch (e) { ro = e instanceof svc.ValidationError; }
  check('TC32', 'Complete project closes; afterwards records are read-only', ['Closed', true], [(await svc.getProject()).status, ro]);
});
test('TC33 persistence in MongoDB', async () => {
  await resetAndSeed();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  await mongoose.connect(conn.uri, { dbName: process.env.DB_NAME });
  check('TC33', 'Data persists in MongoDB after reconnecting (activities, CRs, defects)', [18, 3, 7],
    [await M.Task.countDocuments(), await M.ChangeRequest.countDocuments(), await M.Defect.countDocuments()]);
});
test('TC34 consistency check', async () => {
  await resetAndSeed();
  const r = await svc.saveRequirement({ title: 'Audit trail report', priority: 'Should' });
  await svc.setRequirementStatus(r.id, 'Approved');
  check('TC34', 'Consistency check flags approved requirement not covered by the WBS', true,
    (await svc.consistencyCheck()).some(([, m]) => m.includes('Audit trail report')));
});
test('TC35 dashboard and report', async () => {
  await resetAndSeed();
  const d = await svc.dashboard();
  const html = await svc.exportReport();
  check('TC35', 'Dashboard counts (delayed, pending CRs, critical defects) and report generated', [5, 1, 2, true],
    [d.delayed.length, d.pendingCrs.length, d.criticalDefects.length, html.includes('Pending change requests') && html.includes('Budget status')]);
});

// ------------------------------------------------------------------ REST API (Express)
async function withServer(fn) {
  const srv = createApp().listen(0);
  await new Promise((r) => srv.once('listening', r));
  try { return await fn(`http://127.0.0.1:${srv.address().port}/api`); } finally { srv.close(); }
}
test('TC36 API dashboard', async () => {
  await resetAndSeed();
  await withServer(async (base) => {
    const r = await fetch(`${base}/dashboard`); const d = await r.json();
    check('TC36', 'GET /api/dashboard returns 200 with CPI/SPI', [200, '0.920', '0.947'], [r.status, d.evm.CPI.toFixed(3), d.evm.SPI.toFixed(3)]);
  });
});
test('TC37 API validation 400', async () => {
  await resetAndSeed();
  await withServer(async (base) => {
    const r = await fetch(`${base}/risks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'x', category: 'Scope', likelihood: 9, impact: 1 }) });
    const d = await r.json();
    check('TC37', 'POST /api/risks with invalid likelihood returns HTTP 400 + message', [400, true], [r.status, d.error.includes('Likelihood')]);
  });
});
test('TC38 API approve CR', async () => {
  await resetAndSeed();
  const cid = await code(M.ChangeRequest, 'CR-002');
  await withServer(async (base) => {
    const r = await fetch(`${base}/change-requests/${cid}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decidedBy: 'CCB' }) });
    const d = await r.json(); const p = await (await fetch(`${base}/project`)).json();
    check('TC38', 'POST /api/change-requests/:id/approve creates activity and updates baseline', [200, 'T19', 5800000, '2026-12-13'], [r.status, d.taskCode, p.approvedBudget, p.deadline]);
  });
});
