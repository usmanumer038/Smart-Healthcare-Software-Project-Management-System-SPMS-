// Realistic sample data for the Smart Healthcare case study.
// Everything goes through the service layer, so the sample data obeys the same validation
// and change-control rules as data entered through the UI.
import * as svc from './service.js';
import { fromDay, toDay } from './calc.js';
import { ALL_MODELS, Member, Requirement, Wbs, Task, ChangeRequest, Defect, QualityCheck } from './models.js';

export const STATUS_DATE = '2026-10-26';

export async function clearAll() {
  for (const M of ALL_MODELS) await M.deleteMany({});
}

const idOf = async (M, filter) => String((await M.findOne(filter).lean())._id);

export async function seed() {
  await svc.saveCharter({
    name: 'Smart Healthcare Project Management & Monitoring System',
    client: 'Network of five partner hospitals',
    sponsor: 'Hospital Network Board (CEO office)',
    manager: 'Ayesha Khan',
    objectives: '1. Deliver an integrated system for patient appointments, laboratory reports, doctor schedules, online consultations and hospital billing across 5 hospitals.\n' +
      '2. Go live within 16 weeks and within PKR 5,000,000.\n3. Zero critical defects at go-live; 95% of appointments booked online within 3 months.',
    stakeholders: 'Hospital Network Board (sponsor); hospital administrators (5); doctors; lab staff; billing department; patients; IT department; development team; QA.',
    scopeIn: 'Web system for appointments, doctor schedules, lab reports, online consultations, billing, patient records; deployment and staff training at 5 hospitals.',
    scopeOut: 'Medical hardware procurement, insurance-claim integration, pharmacy inventory, data migration of paper records older than 2 years.',
    approvedBudget: 5000000, startDate: '2026-08-03', deadline: '2026-11-22', status: 'Monitoring & Control',
  });
  await svc.saveSettings({ statusDate: STATUS_DATE, cpiWarn: 0.95, cpiCrit: 0.9, spiWarn: 0.95, spiCrit: 0.9 });

  const team = [
    ['Ayesha Khan', 'Project Manager', 'Planning, stakeholder communication, change control, reporting', 12000],
    ['Usman Ali', 'Backend Developer', 'Appointments, consultations, APIs', 9000],
    ['Hamza Raza', 'Backend Developer', 'Doctor schedules, lab reports, AI module', 9000],
    ['Fatima Noor', 'Frontend Developer', 'UI/UX design, web front-end', 8000],
    ['Bilal Ahmed', 'Frontend Developer', 'Appointment and billing screens, mobile UI', 8000],
    ['Zainab Tariq', 'Database Developer', 'Database design, billing, patient records', 8500],
    ['Hassan Iqbal', 'QA Engineer', 'Test planning, integration testing, UAT', 7000],
  ];
  for (const [name, role, responsibility, dailyRate] of team) {
    await svc.saveMember({ name, role, responsibility, dailyRate, email: `${name.split(' ')[0].toLowerCase()}@healthsoft.pk` });
  }
  const M = {};
  for (const m of await Member.find().lean()) M[m.name.split(' ')[0]] = String(m._id);

  const reqs = [
    ['Patient appointment booking, rescheduling and cancellation', 'Must'], ['Doctor schedule and availability management', 'Must'],
    ['Laboratory report upload, approval and patient access', 'Must'], ['Online video consultations', 'Should'],
    ['Hospital billing, invoices and payments', 'Must'], ['Patient record management (EMR basic)', 'Must'],
    ['Multi-hospital support for 5 branches', 'Must'], ['SMS appointment reminders', 'Could'],
  ];
  for (const [title, priority] of reqs) await svc.saveRequirement({ title, priority, description: title });
  const R = {};
  for (const r of await Requirement.find().lean()) R[r.code] = String(r._id);
  for (const c of ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07']) await svc.setRequirementStatus(R[c], 'Approved');

  const wbs = async (name, nodeType, parentId = null, requirementId = null) => {
    await svc.saveWbs({ name, nodeType, parentId, requirementId });
    return idOf(Wbs, { name });
  };
  const root = await wbs('Smart Healthcare PMS', 'Project');
  const pm = await wbs('Project Management', 'Deliverable', root);
  const wInit = await wbs('Initiation & Planning', 'Work Package', pm);
  const wDeploy = await wbs('Deployment & Training', 'Work Package', pm, R.R07);
  const rd = await wbs('Requirements & Design', 'Deliverable', root);
  const wReq = await wbs('Requirements Analysis', 'Work Package', rd);
  const wArch = await wbs('Architecture & Database Design', 'Work Package', rd, R.R07);
  const wUi = await wbs('UI/UX Design', 'Work Package', rd);
  const core = await wbs('Core Modules', 'Deliverable', root);
  const wApp = await wbs('Patient Appointments', 'Work Package', core, R.R01);
  const wDoc = await wbs('Doctor Schedules', 'Work Package', core, R.R02);
  const wLab = await wbs('Laboratory Reports', 'Work Package', core, R.R03);
  const wCon = await wbs('Online Consultations', 'Work Package', core, R.R04);
  const wBill = await wbs('Hospital Billing', 'Work Package', core, R.R05);
  const wRec = await wbs('Patient Records', 'Work Package', core, R.R06);
  const wFe = await wbs('Web Front-end', 'Work Package', core);
  const qa = await wbs('Testing & Quality Assurance', 'Deliverable', root);
  const wIt = await wbs('Integration & System Testing', 'Work Package', qa);
  const wFix = await wbs('Defect Fixing & Regression', 'Work Package', qa);
  const wUat = await wbs('User Acceptance Testing', 'Work Package', qa);
  const wInf = await wbs('Infrastructure & Licences', 'Work Package', rd);

  // name, wbs, assignee, duration, budget, predecessors
  const tasks = [
    ['Project charter, kickoff & plan', wInit, 'Ayesha', 5, 60000, []],
    ['Requirements elicitation (5 hospitals)', wReq, 'Ayesha', 10, 150000, ['T01']],
    ['System architecture & database design', wArch, 'Zainab', 10, 250000, ['T02']],
    ['UI/UX design & prototypes', wUi, 'Fatima', 10, 110000, ['T02']],
    ['Appointment module backend', wApp, 'Usman', 18, 300000, ['T03']],
    ['Appointment module frontend', wApp, 'Bilal', 15, 180000, ['T04']],
    ['Doctor schedule module', wDoc, 'Hamza', 14, 220000, ['T03']],
    ['Laboratory reports module', wLab, 'Hamza', 16, 260000, ['T07']],
    ['Online consultation module', wCon, 'Usman', 25, 420000, ['T05']],
    ['Billing module', wBill, 'Zainab', 16, 280000, ['T03']],
    ['Front-end for schedules, labs & billing', wFe, 'Fatima', 25, 300000, ['T04']],
    ['Integration & system testing', wIt, 'Hassan', 14, 200000, ['T06', 'T08', 'T09', 'T10', 'T11', 'T17']],
    ['Defect fixing & regression testing', wFix, 'Usman', 10, 180000, ['T12']],
    ['User acceptance testing at hospitals', wUat, 'Hassan', 10, 150000, ['T13']],
    ['Deployment to 5 hospitals & staff training', wDeploy, 'Ayesha', 10, 350000, ['T14', 'T16']],
    ['Hosting, licences & server procurement', wInf, 'Zainab', 5, 900000, ['T03']],
    ['Patient record (EMR) module', wRec, 'Zainab', 12, 200000, ['T03']],
  ];
  const T = {};
  for (const [i, [name, wbsId, who, duration, budget]] of tasks.entries()) {
    T[`T${String(i + 1).padStart(2, '0')}`] = await svc.saveTask({ name, wbsId, assigneeId: M[who], duration, budget });
  }
  for (const [i, t] of tasks.entries()) {
    if (t[5].length) await svc.setDependencies(T[`T${String(i + 1).padStart(2, '0')}`], t[5].map((c) => T[c]));
  }

  // actual progress at the status date: code, start, end, %, extra cost (overrun)
  const progress = [
    ['T01', '2026-08-03', '2026-08-07', 100, 0], ['T02', '2026-08-08', '2026-08-19', 100, 10000],
    ['T03', '2026-08-20', '2026-08-29', 100, 15000], ['T04', '2026-08-20', '2026-08-28', 100, 0],
    ['T05', '2026-08-30', '2026-09-18', 100, 40000], ['T06', '2026-08-29', '2026-09-14', 100, 0],
    ['T07', '2026-08-30', '2026-09-12', 100, 0], ['T08', '2026-09-13', '2026-09-30', 100, 30000],
    ['T09', '2026-09-19', '2026-10-15', 100, 80000], ['T10', '2026-08-30', '2026-09-16', 100, 20000],
    ['T11', '2026-08-29', '2026-09-25', 100, 20000], ['T16', '2026-08-30', '2026-09-03', 100, 60000],
    ['T17', '2026-08-30', '2026-09-12', 100, 25000], ['T12', '2026-10-16', null, 25, 20000],
  ];
  for (const [code, s, e, pct, extra] of progress) {
    await svc.updateProgress(T[code], { actualStart: s, actualEnd: e, percent: pct });
    const t = await Task.findById(T[code]).lean();
    const total = (t.budget * pct) / 100 + extra;
    const dates = [];
    for (let d = toDay(s); d <= toDay(e || STATUS_DATE); d += 7) dates.push(d);
    const share = Math.round(total / dates.length);
    for (const [i, d] of dates.entries()) {
      const amount = i < dates.length - 1 ? share : total - share * (dates.length - 1);
      await svc.addExpense({ taskId: T[code], date: fromDay(d), amount, description: i ? 'Labour & resources' : 'Labour, tools & setup' });
    }
  }

  for (const [name, code, who] of [
    ['M1 Charter approved & kickoff', 'T01', 'Ayesha'], ['M2 Requirements & design signed off', 'T03', 'Zainab'],
    ['M3 Core modules complete', 'T09', 'Usman'], ['M4 System testing complete', 'T13', 'Hassan'],
    ['M5 UAT sign-off', 'T14', 'Hassan'], ['M6 Go-live at 5 hospitals (project closure)', 'T15', 'Ayesha'],
  ]) await svc.saveMilestone({ name, taskId: T[code], ownerId: M[who] });

  // change requests from hospital management (CR-001 + CR-002 = +PKR 800,000 and +21 days)
  await svc.saveChangeRequest({
    title: 'AI-based preliminary diagnosis module',
    description: 'Symptom checker suggesting a preliminary diagnosis and the right specialist before booking.',
    justification: 'Hospital management wants to reduce unnecessary specialist visits and triage load.',
    requestedBy: 'Hospital Network Board', requestDate: '2026-09-28', priority: 'Should', costImpact: 450000, scheduleImpact: 12,
    afterTaskId: T.T13, beforeTaskId: T.T14, assigneeId: M.Hamza,
  });
  const t18code = await svc.approveChangeRequest(await idOf(ChangeRequest, { code: 'CR-001' }), 'Hospital Network Board / CCB',
    'Approved with +12 days and PKR 450,000.', '2026-10-05');
  const t18 = await idOf(Task, { code: t18code });
  await svc.saveChangeRequest({
    title: 'Patient mobile application (Android/iOS)',
    description: 'Mobile app for booking appointments, viewing lab reports and joining consultations.',
    justification: 'More than 60% of patients use smartphones; administrators expect fewer call-centre bookings.',
    requestedBy: 'Hospital administrators', requestDate: '2026-10-12', priority: 'Should', costImpact: 350000, scheduleImpact: 9,
    afterTaskId: t18, beforeTaskId: T.T14, assigneeId: M.Bilal,
  });
  await svc.saveChangeRequest({
    title: 'Blockchain-based patient record ledger', description: 'Store record hashes on a private blockchain.',
    justification: "Suggested by one hospital's IT head for tamper-evidence.", requestedBy: 'IT Head, Hospital 3', requestDate: '2026-10-01',
    priority: 'Could', costImpact: 600000, scheduleImpact: 20, afterTaskId: T.T17, beforeTaskId: T.T14, assigneeId: M.Zainab,
  });
  await svc.rejectChangeRequest(await idOf(ChangeRequest, { code: 'CR-003' }), 'Change Control Board',
    'Out of scope; audit trail in the database already gives tamper evidence.', '2026-10-08');

  const defects = [
    ['Same doctor slot can be double-booked', 'Patient Appointments', 'Critical', 'Usman', 'Open', '2026-10-19', null, 'T05'],
    ['Patient record overwritten on concurrent edits', 'Patient Records', 'Critical', 'Zainab', 'In Progress', '2026-10-20', null, 'T17'],
    ['Appointment reminder shows wrong time zone', 'Patient Appointments', 'High', 'Usman', 'Resolved', '2026-10-17', '2026-10-22', 'T05'],
    ['Billing tax rounding error of PKR 1', 'Hospital Billing', 'Medium', 'Zainab', 'Closed', '2026-10-17', '2026-10-21', 'T10'],
    ['Lab report PDF not rendering on Safari', 'Laboratory Reports', 'Low', 'Fatima', 'Open', '2026-10-21', null, 'T08'],
    ['Video consultation drops on low bandwidth', 'Online Consultations', 'High', 'Usman', 'Open', '2026-10-22', null, 'T09'],
    ['Cancelled appointment still visible in doctor schedule', 'Doctor Schedules', 'High', 'Hamza', 'In Progress', '2026-10-23', null, 'T07'],
  ];
  const D = {};
  for (const [title, module, severity, who, status, reportedDate, resolvedDate, task] of defects) {
    D[title] = await svc.saveDefect({ title, module, severity, assignedId: M[who], status, reportedDate, resolvedDate, taskId: T[task],
      description: `Found during integration testing (${reportedDate}).` });
  }

  const checks = [
    [wArch, 'Database schema normalised and reviewed', 'Inspection', 'Review sign-off, no blocking comments', 'Pass', 'Signed off by PM and DB developer', 'Ayesha', '2026-08-29'],
    [wApp, 'No double booking of a doctor time slot', 'Test', 'Second booking of same slot is rejected', 'Fail', 'Second booking accepted - two patients in same slot', 'Hassan', '2026-10-19'],
    [wApp, 'Appointment API response time under 500 ms', 'Test', 'p95 < 500 ms with 200 users', 'Pass', 'p95 = 340 ms', 'Hassan', '2026-10-18'],
    [wRec, 'Concurrent edit protection on patient records', 'Test', 'Second editor gets conflict warning', 'Fail', 'Last write silently overwrote first', 'Hassan', '2026-10-20'],
    [wBill, 'Invoice totals match manual calculation', 'Test', '100 sample invoices match to the rupee', 'Pass', '100/100 matched after fix D04', 'Hassan', '2026-10-21'],
    [wLab, 'Lab reports up to 10 MB upload and open', 'Test', 'Upload + open < 5 s', 'Pass', '3.1 s average', 'Hassan', '2026-10-21'],
    [wCon, 'Video consultation stable for 30 minutes', 'Test', 'No drop at 1 Mbps', null],
    [wDeploy, 'Training material reviewed by hospital admins', 'Inspection', 'Approved by 5 admins', null],
  ];
  const link = { 'No double booking of a doctor time slot': 'Same doctor slot can be double-booked',
    'Concurrent edit protection on patient records': 'Patient record overwritten on concurrent edits' };
  for (const [wbsId, criterion, checkType, expected, result, actual, who, checkDate] of checks) {
    const qid = await svc.saveCheck({ wbsId, criterion, checkType, expected });
    if (result) {
      if (link[criterion]) await QualityCheck.updateOne({ _id: qid }, { defectId: D[link[criterion]] }); // already logged defect
      await svc.recordCheckResult(qid, { result, actual, inspectorId: M[who], checkDate });
    }
  }

  const risks = [
    ['Scope creep from hospital management', 'Scope', null, 5, 4, 'Ayesha', 'Mitigating', [
      ['Preventive', 'Formal change control board; every request needs a CR with cost/schedule impact', 'Ayesha', true],
      ['Corrective', 'Re-baseline schedule and budget only through approved CRs', 'Ayesha', true]]],
    ['Critical defects delay go-live', 'Quality', wIt, 4, 5, 'Hassan', 'Open', [
      ['Preventive', 'Code reviews and unit tests before integration', 'Usman', true],
      ['Corrective', 'Dedicated defect-fix sprint and daily triage of critical defects', 'Hassan', true],
      ['Corrective', 'Phased go-live (2 hospitals first)', 'Ayesha', true]]],
    ['Budget overrun due to change requests and rework', 'Cost', null, 4, 4, 'Ayesha', 'Open', [
      ['Preventive', 'Weekly EVM review with CPI/SPI thresholds', 'Ayesha', true],
      ['Corrective', "Use management reserve; descope 'Could' requirements", 'Ayesha', true]]],
    ['AI diagnosis gives inaccurate suggestions (liability)', 'Technical', null, 3, 5, 'Hamza', 'Open', [
      ['Preventive', 'Label output as preliminary; doctor must confirm', 'Hamza', true],
      ['Corrective', 'Disable module via feature flag if accuracy < 85%', 'Hamza', true]]],
    ['Poor internet at hospital sites affects consultations', 'External', wCon, 4, 3, 'Usman', 'Open', [
      ['Preventive', 'Adaptive bitrate and audio-only fallback', 'Usman', true],
      ['Corrective', 'Switch to phone consultation and reschedule', 'Ayesha', true]]],
    ['Patient data privacy breach', 'Security', wRec, 2, 5, 'Zainab', 'Open', [
      ['Preventive', 'Encryption at rest, role-based access, audit logging', 'Zainab', true],
      ['Corrective', 'Incident response plan and breach notification', 'Ayesha', true]]],
    ['Integration issues with lab equipment exports', 'Technical', wLab, 3, 3, 'Hamza', 'Mitigating', [
      ['Preventive', 'Agree on HL7/CSV export format early', 'Hamza', true],
      ['Corrective', 'Manual upload fallback for lab staff', 'Fatima', true]]],
    ['Key backend developer unavailable', 'Resource', null, 2, 4, 'Ayesha', 'Open', [
      ['Preventive', 'Pair programming and documentation of modules', 'Usman', true],
      ['Corrective', 'Hire a contract developer', 'Ayesha', false]]],
  ];
  for (const [title, category, wbsId, likelihood, impact, owner, status, measures] of risks) {
    const riskId = await svc.saveRisk({ title, category, wbsId, likelihood, impact, ownerId: M[owner], status, description: title });
    for (const [actionType, action, who, feasible] of measures) await svc.saveCountermeasure({ riskId, actionType, action, ownerId: M[who], feasible });
  }

  await svc.regeneratePlan();
  await svc.log('Sample data loaded', 'Smart Healthcare case study');
}

export async function resetAndSeed() {
  await clearAll();
  await seed();
}

export { Defect };
