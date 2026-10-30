// Business/service layer: validation, CRUD, integration rules and analytics.
// Every write goes through here, so the React UI, the REST API and the tests share
// exactly the same rules (scope control, dependency integrity, change control, closure).
import mongoose from 'mongoose';
import * as calc from './calc.js';
import {
  Project, PlanSection, Member, Requirement, Wbs, Task, Milestone, Expense, ChangeRequest, Baseline,
  Defect, QualityCheck, Risk, Countermeasure, Closure, AuditLog,
  PRIORITIES, REQ_STATUSES, WBS_TYPES, SEVERITIES, DEFECT_STATUSES, CHECK_TYPES, CHECK_RESULTS,
  RISK_STATUSES, RISK_CATEGORIES, PROJECT_STATUSES, PLAN_SECTIONS,
} from './models.js';

export class ValidationError extends Error {}

export const ENUMS = {
  PRIORITIES, REQ_STATUSES, WBS_TYPES, SEVERITIES, DEFECT_STATUSES, CHECK_TYPES, CHECK_RESULTS,
  RISK_STATUSES, RISK_CATEGORIES, PROJECT_STATUSES, PLAN_SECTIONS,
};

// ------------------------------------------------------------------ helpers
const S = (v) => (v === null || v === undefined ? null : String(v));
export const money = (v) => `PKR ${Math.round(v).toLocaleString('en-US')}`;
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

function plain(doc) {
  if (!doc) return doc;
  const o = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === '_id') o.id = String(v);
    else if (v instanceof mongoose.Types.ObjectId) o[k] = String(v);
    else if (Array.isArray(v)) o[k] = v.map((x) => (x instanceof mongoose.Types.ObjectId ? String(x) : x));
    else o[k] = v;
  }
  return o;
}
const all = async (M, filter = {}, sort = {}) => (await M.find(filter).sort(sort).lean()).map(plain);
const one = async (M, filter) => plain(await M.findOne(filter).lean());

function text(data, key, label, { required = true, max = 2000 } = {}) {
  const v = data[key] === null || data[key] === undefined ? '' : String(data[key]).trim();
  if (required && !v) throw new ValidationError(`${label} is required.`);
  if (v.length > max) throw new ValidationError(`${label} must be at most ${max} characters.`);
  return v;
}

function date(v, label, required = true) {
  if (v === null || v === undefined || String(v).trim() === '') {
    if (required) throw new ValidationError(`${label} is required (format YYYY-MM-DD).`);
    return null;
  }
  if (!calc.isValidDate(String(v).trim())) throw new ValidationError(`${label} '${v}' is not a valid date (use YYYY-MM-DD).`);
  return String(v).trim();
}

function num(v, label, { min, max, int = false, required = true } = {}) {
  if (v === null || v === undefined || String(v).trim() === '') {
    if (required) throw new ValidationError(`${label} is required.`);
    return null;
  }
  const s = String(v).replace(/,/g, '').trim();
  const n = Number(s);
  if (!/^-?\d+(\.\d+)?$/.test(s) || Number.isNaN(n)) throw new ValidationError(`${label} must be a${int ? 'n integer' : ' number'}.`);
  if (int && !Number.isInteger(n)) throw new ValidationError(`${label} must be an integer.`);
  if (min !== undefined && n < min) throw new ValidationError(`${label} must be at least ${min}.`);
  if (max !== undefined && n > max) throw new ValidationError(`${label} must be at most ${max}.`);
  return n;
}

function choice(v, label, options) {
  if (!options.includes(v)) throw new ValidationError(`${label} must be one of: ${options.join(', ')}.`);
  return v;
}

function optId(v, label = 'Reference') {
  if (v === null || v === undefined || v === '' || v === 'null') return null;
  if (!mongoose.isValidObjectId(v)) throw new ValidationError(`${label} is not a valid id.`);
  return String(v);
}

function need(row, what) {
  if (!row) throw new ValidationError(`${what} not found.`);
  return row;
}

async function nextCode(M, prefix, width = 2) {
  const rows = await M.find({ code: { $regex: '^' + prefix.replace(/[-]/g, '\\-') } }, { code: 1 }).lean();
  const nums = rows.map((r) => r.code.slice(prefix.length)).filter((x) => /^\d+$/.test(x)).map(Number);
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(width, '0');
}

export async function log(action, details = '') {
  await AuditLog.create({ ts: now(), action, details });
}

async function wrapDb(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    if (e?.code === 11000) throw new ValidationError(`Duplicate value: ${Object.keys(e.keyValue || {}).join(', ')} must be unique.`);
    if (e instanceof mongoose.Error.ValidationError) throw new ValidationError(Object.values(e.errors).map((x) => x.message).join(' '));
    throw e;
  }
}

async function checkOpen() {
  const p = await Project.findOne().lean();
  if (p && p.status === 'Closed') throw new ValidationError('The project is closed; records are read-only.');
}

const byCode = (a, b) => a.code.localeCompare(b.code, 'en', { numeric: true });
const wbsSort = (a, b) => {
  const x = a.code.split('.').map(Number); const y = b.code.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
  }
  return 0;
};

// ================================================================== MODULE 1
export async function getProject() { return one(Project, {}); }

export async function saveCharter(data) {
  return wrapDb(async () => {
    const name = text(data, 'name', 'Project name', { max: 200 });
    const objectives = text(data, 'objectives', 'Objectives');
    const stakeholders = text(data, 'stakeholders', 'Stakeholders');
    const scopeIn = text(data, 'scopeIn', 'In-scope boundary');
    const scopeOut = text(data, 'scopeOut', 'Out-of-scope boundary', { required: false });
    const approvedBudget = num(data.approvedBudget, 'Approved budget', { min: 1 });
    const startDate = date(data.startDate, 'Start date');
    const deadline = date(data.deadline, 'Deadline');
    if (deadline <= startDate) throw new ValidationError('Deadline must be after the start date.');
    const status = data.status || 'Initiated';
    choice(status, 'Status', PROJECT_STATUSES);
    const doc = {
      name, objectives, stakeholders, scopeIn, scopeOut, approvedBudget, startDate, deadline, status,
      client: text(data, 'client', 'Client', { required: false }),
      sponsor: text(data, 'sponsor', 'Sponsor', { required: false }),
      manager: text(data, 'manager', 'Project manager', { required: false }),
    };
    const existing = await Project.findOne().lean();
    if (existing) {
      if ((existing.status === 'Closed' || status === 'Closed') && existing.status !== status) {
        throw new ValidationError("Use 'Close project' to close the project (closure is final).");
      }
      await Project.updateOne({ _id: existing._id }, doc);
      await log('Charter updated', name);
    } else {
      if (status === 'Closed') throw new ValidationError('A new project cannot start as Closed.');
      await Project.create({ ...doc, baselineBudget: approvedBudget, baselineDeadline: deadline, statusDate: startDate });
      await log('Charter created', name);
    }
    return getProject();
  });
}

export async function saveSettings(data) {
  const p = need(await getProject(), 'Project');
  const sd = date(data.statusDate, 'Status date');
  if (sd < p.startDate) throw new ValidationError('Status date cannot be before the project start date.');
  const [cw, cc, sw, sc] = [['cpiWarn', 'CPI warning'], ['cpiCrit', 'CPI critical'], ['spiWarn', 'SPI warning'], ['spiCrit', 'SPI critical']]
    .map(([k, l]) => num(data[k], l, { min: 0.1, max: 1.5 }));
  if (cc > cw || sc > sw) throw new ValidationError('Critical threshold must be lower than or equal to the warning threshold.');
  const tasks = await Task.find().lean();
  const exps = await Expense.find().lean();
  const latest = [...tasks.flatMap((t) => [t.actualStart, t.actualEnd]), ...exps.map((e) => e.date)].filter(Boolean).sort().pop();
  if (latest && sd < latest) throw new ValidationError(`Status date cannot be earlier than recorded actuals (${latest}).`);
  await Project.updateOne({}, { statusDate: sd, cpiWarn: cw, cpiCrit: cc, spiWarn: sw, spiCrit: sc });
  return getProject();
}

export async function getPlan() {
  const rows = Object.fromEntries((await all(PlanSection)).map((r) => [r.section, r]));
  return PLAN_SECTIONS.map((s) => ({ section: s, content: rows[s]?.content || '', updated: rows[s]?.updated || null }));
}

export async function savePlanSection(section, content) {
  choice(section, 'Plan section', PLAN_SECTIONS);
  await PlanSection.updateOne({ section }, { section, content: String(content || '').trim(), updated: now() }, { upsert: true });
}

export async function generatePlan() {
  const p = need(await getProject(), 'Project');
  const sch = await scheduleAnalysis();
  const ev = await evmAnalysis();
  const reqs = (await all(Requirement, { status: 'Approved' })).sort(byCode);
  const wps = (await all(Wbs, { nodeType: 'Work Package' })).sort(wbsSort);
  const qn = await QualityCheck.countDocuments();
  return {
    'Scope Management': `In scope: ${p.scopeIn}\nOut of scope: ${p.scopeOut || '-'}\n\n` +
      `Approved scope baseline (${reqs.length} requirements):\n${reqs.map((r) => `  ${r.code} [${r.priority}] ${r.title}`).join('\n')}\n\n` +
      `WBS work packages: ${wps.length}\n${wps.map((w) => `  ${w.code} ${w.name}`).join('\n')}\n\n` +
      'Change control: every new requirement must enter through a change request; only approved requirements may be linked to WBS work packages.',
    'Schedule Management': `Start: ${p.startDate}   Approved deadline: ${p.deadline} (original ${p.baselineDeadline})\n` +
      `Planned finish (CPM): ${sch.plannedFinish}\nActivities: ${sch.tasks.length}, critical path: ${sch.criticalPath.join(' -> ')}\n` +
      `Milestones:\n${sch.milestones.map((m) => `  ${m.name}: planned ${m.planned}`).join('\n')}\n\n` +
      'Method: finish-to-start dependencies, forward/backward pass, weekly progress updates against the status date.',
    'Cost Management': `Approved budget: ${money(p.approvedBudget)} (original ${money(p.baselineBudget)})\n` +
      `Planned cost baseline (BAC): ${money(ev.BAC)}\nManagement reserve: ${money(p.approvedBudget - ev.BAC)}\n` +
      `EVM thresholds: CPI warning < ${p.cpiWarn}, critical < ${p.cpiCrit}; SPI warning < ${p.spiWarn}, critical < ${p.spiCrit}.\n` +
      'Actual costs are recorded per activity as expenses; PV, EV, AC, CPI and SPI are computed automatically at each status date.',
    'Quality Management': `Quality checklist items: ${qn}. Every deliverable is inspected or tested before acceptance. Failed checks raise defects.\n` +
      'Defect severity: Critical / High / Medium / Low. Release criteria: zero open Critical defects, all checklist items Pass.',
    'Risk Management': 'Risks are scored Likelihood x Impact (1-5 each) in the prioritization matrix. Score >= 15 High, 8-14 Medium, < 8 Low. ' +
      'High risks require preventive and corrective countermeasures in the PDPC.',
    Communication: `Sponsor: ${p.sponsor || '-'}; Project manager: ${p.manager || '-'}.\nStakeholders: ${p.stakeholders}\n` +
      'Weekly status report generated from the dashboard.',
  };
}

export async function regeneratePlan() {
  for (const [s, txt] of Object.entries(await generatePlan())) await savePlanSection(s, txt);
  return getPlan();
}

// --- milestones
export async function saveMilestone(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const name = text(data, 'name', 'Milestone name', { max: 200 });
    const taskId = optId(data.taskId, 'Activity');
    if (!taskId) throw new ValidationError('A milestone must be linked to the activity whose completion marks it.');
    need(await Task.findById(taskId).lean(), 'Activity');
    const doc = { name, taskId, ownerId: optId(data.ownerId, 'Owner'), description: text(data, 'description', 'Description', { required: false }) };
    if (id) await Milestone.updateOne({ _id: id }, doc); else await Milestone.create(doc);
  });
}

export async function deleteMilestone(id) { await checkOpen(); await Milestone.deleteOne({ _id: id }); }

// --- closure
export async function closureBlockers() {
  const b = [];
  const n1 = await Task.countDocuments({ percent: { $lt: 100 } });
  if (n1) b.push(`${n1} activities are not 100% complete.`);
  const n2 = await Defect.countDocuments({ severity: 'Critical', status: { $nin: ['Resolved', 'Closed'] } });
  if (n2) b.push(`${n2} critical defects are unresolved.`);
  const n3 = await ChangeRequest.countDocuments({ status: 'Pending' });
  if (n3) b.push(`${n3} change requests are still pending a decision.`);
  const n4 = await QualityCheck.countDocuments({ result: { $ne: 'Pass' } });
  if (n4) b.push(`${n4} quality checklist items are not passed.`);
  return b;
}

export async function closeProject(data) {
  const p = need(await getProject(), 'Project');
  if (p.status === 'Closed') throw new ValidationError('Project is already closed.');
  const b = await closureBlockers();
  if (b.length) throw new ValidationError('Project cannot be closed:\n- ' + b.join('\n- '));
  const closedDate = date(data.closedDate, 'Closure date');
  const acceptedBy = text(data, 'acceptedBy', 'Accepted by');
  const lessons = text(data, 'lessons', 'Lessons learned');
  const finalCost = (await Expense.find().lean()).reduce((s, e) => s + e.amount, 0);
  await Closure.create({ closedDate, finalCost, acceptedBy, lessons, notes: text(data, 'notes', 'Notes', { required: false }) });
  await Project.updateOne({}, { status: 'Closed' });
  await log('Project closed', `Accepted by ${acceptedBy}; final cost ${money(finalCost)}`);
}

export async function getClosure() {
  return { record: await one(Closure, {}), blockers: await closureBlockers() };
}

// ================================================================== TEAM
export async function listMembers() {
  const ms = await all(Member);
  const tasks = (await all(Task)).sort(byCode);
  return ms.map((m) => {
    const t = tasks.filter((x) => x.assigneeId === m.id);
    return { ...m, taskCount: t.length, taskCodes: t.map((x) => x.code).join(', ') };
  });
}

export async function saveMember(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const name = text(data, 'name', 'Name', { max: 100 });
    const role = text(data, 'role', 'Role', { max: 100 });
    const email = text(data, 'email', 'Email', { required: false });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError('Email address is not valid.');
    const doc = { name, role, email, responsibility: text(data, 'responsibility', 'Responsibility', { required: false }),
      dailyRate: num(data.dailyRate, 'Daily rate', { min: 0 }) };
    if (id) await Member.updateOne({ _id: id }, doc, { runValidators: true });
    else return plain((await Member.create(doc)).toObject());
  });
}

export async function deleteMember(id) {
  await checkOpen();
  const refs = (await Task.countDocuments({ assigneeId: id })) + (await Defect.countDocuments({ assignedId: id })) +
    (await Risk.countDocuments({ ownerId: id }));
  if (refs) throw new ValidationError('This member is assigned to activities, defects or risks. Reassign them first.');
  await Member.deleteOne({ _id: id });
}

// ================================================================== MODULE 2
const PRIO_ORDER = { Must: 1, Should: 2, Could: 3, "Won't": 4 };

export async function listRequirements() {
  const reqs = await all(Requirement);
  const crs = Object.fromEntries((await all(ChangeRequest)).map((c) => [c.id, c.code]));
  const wbs = await all(Wbs);
  return reqs.map((r) => ({ ...r, crCode: r.crId ? crs[r.crId] : null,
    wbsCodes: wbs.filter((w) => w.requirementId === r.id).map((w) => w.code).join(', ') }))
    .sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || byCode(a, b));
}

export async function saveRequirement(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const title = text(data, 'title', 'Title', { max: 200 });
    const description = text(data, 'description', 'Description', { required: false });
    const priority = choice(data.priority, 'Priority', PRIORITIES);
    if (id) {
      const r = need(await Requirement.findById(id).lean(), 'Requirement');
      await Requirement.updateOne({ _id: id }, { title, description, priority });
      await log('Requirement updated', r.code);
      return null;
    }
    const code = await nextCode(Requirement, 'R');
    const p = await getProject();
    const doc = await Requirement.create({ code, title, description, priority, status: 'Proposed', source: 'Original', created: p?.statusDate });
    await log('Requirement added', code);
    return plain(doc.toObject());
  });
}

export async function setRequirementStatus(id, status) {
  await checkOpen();
  choice(status, 'Status', REQ_STATUSES);
  const r = need(await Requirement.findById(id).lean(), 'Requirement');
  if (r.source === 'Change Request' && r.crId) {
    throw new ValidationError(`${r.code} came from a change request; approve or reject the change request instead (change control).`);
  }
  if (status !== 'Approved') {
    const linked = await Wbs.countDocuments({ requirementId: id });
    if (linked) throw new ValidationError(`${r.code} is part of the approved scope baseline and linked to ${linked} WBS element(s). Raise a change request to remove it.`);
  }
  await Requirement.updateOne({ _id: id }, { status });
  await log(`Requirement ${status.toLowerCase()}`, r.code);
}

export async function deleteRequirement(id) {
  await checkOpen();
  const r = need(await Requirement.findById(id).lean(), 'Requirement');
  if (r.crId) throw new ValidationError('Requirements created by a change request are managed through that CR.');
  if (r.status === 'Approved') throw new ValidationError('Approved requirements are part of the baseline and cannot be deleted.');
  await Requirement.deleteOne({ _id: id });
}

// --- WBS
export async function listWbs() {
  const rows = (await all(Wbs)).sort(wbsSort);
  const reqs = Object.fromEntries((await all(Requirement)).map((r) => [r.id, r]));
  const tasks = await all(Task);
  const byId = Object.fromEntries(rows.map((w) => [w.id, w]));
  for (const w of rows) {
    const t = tasks.filter((x) => x.wbsId === w.id);
    Object.assign(w, { reqCode: reqs[w.requirementId]?.code || '', reqStatus: reqs[w.requirementId]?.status || '',
      taskCount: t.length, budget: t.reduce((s, x) => s + x.budget, 0), rollup: 0, depth: w.code.split('.').length - 1 });
  }
  for (const w of [...rows].sort((a, b) => b.depth - a.depth)) {
    w.rollup += w.budget;
    if (w.parentId && byId[w.parentId]) byId[w.parentId].rollup += w.rollup;
  }
  return rows;
}

async function nextWbsCode(parentId) {
  if (!parentId) return '1';
  const p = await Wbs.findById(parentId).lean();
  const kids = await Wbs.find({ parentId }).lean();
  const n = Math.max(0, ...kids.map((k) => Number(k.code.split('.').pop()))) + 1;
  return `${p.code}.${n}`;
}

async function wbsDescendants(id) {
  const out = new Set(); const stack = [String(id)];
  while (stack.length) {
    for (const r of await Wbs.find({ parentId: stack.pop() }, { _id: 1 }).lean()) { out.add(String(r._id)); stack.push(String(r._id)); }
  }
  return out;
}

async function wbsInScope(id) {
  let cur = id;
  while (cur) {
    const w = await Wbs.findById(cur).lean();
    if (!w) return [false, 'WBS element not found'];
    if (w.requirementId) {
      const r = await Requirement.findById(w.requirementId).lean();
      if (r && r.status !== 'Approved') return [false, `WBS ${w.code} is linked to ${r.code} which is ${r.status}`];
    }
    cur = w.parentId;
  }
  return [true, ''];
}

export async function saveWbs(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const name = text(data, 'name', 'Name', { max: 200 });
    const nodeType = choice(data.nodeType, 'Type', WBS_TYPES);
    let parentId = optId(data.parentId, 'Parent');
    const requirementId = optId(data.requirementId, 'Requirement');
    const description = text(data, 'description', 'Description', { required: false });
    if (requirementId) {
      const r = need(await Requirement.findById(requirementId).lean(), 'Requirement');
      if (r.status !== 'Approved') throw new ValidationError(`${r.code} is '${r.status}'. Only approved requirements can be included in the approved scope (WBS).`);
    }
    if (nodeType === 'Project') {
      const ex = await Wbs.findOne({ nodeType: 'Project' }).lean();
      if (ex && String(ex._id) !== id) throw new ValidationError('Only one Project-level (root) WBS element is allowed.');
      parentId = null;
    } else {
      if (!parentId) throw new ValidationError('Deliverables and work packages need a parent WBS element.');
      const pr = need(await Wbs.findById(parentId).lean(), 'Parent WBS element');
      if (pr.nodeType === 'Work Package') throw new ValidationError('A work package is the lowest WBS level and cannot have children.');
      if (id && (parentId === id || (await wbsDescendants(id)).has(parentId))) throw new ValidationError('A WBS element cannot be moved under itself or its descendants.');
    }
    if (id) {
      const cur = need(await Wbs.findById(id).lean(), 'WBS element');
      if (nodeType !== 'Work Package' && (await Task.countDocuments({ wbsId: id }))) throw new ValidationError('This element has activities; it must remain a Work Package.');
      if (nodeType === 'Work Package' && (await Wbs.countDocuments({ parentId: id }))) throw new ValidationError('This element has children and cannot become a Work Package.');
      const code = S(cur.parentId) === parentId ? cur.code : await nextWbsCode(parentId);
      await Wbs.updateOne({ _id: id }, { code, name, parentId, nodeType, requirementId, description });
      return code;
    }
    const code = await nextWbsCode(parentId);
    const doc = await Wbs.create({ code, name, parentId, nodeType, requirementId, description });
    return plain(doc.toObject());
  });
}

export async function deleteWbs(id) {
  await checkOpen();
  if (await Wbs.countDocuments({ parentId: id })) throw new ValidationError('Delete the child elements first.');
  if (await Task.countDocuments({ wbsId: id })) throw new ValidationError('This work package has activities. Delete or move them first.');
  if ((await QualityCheck.countDocuments({ wbsId: id })) || (await Risk.countDocuments({ wbsId: id }))) {
    throw new ValidationError('Quality checks or risks reference this element.');
  }
  await Wbs.deleteOne({ _id: id });
}

// --- change requests
export async function listChangeRequests() {
  const crs = (await all(ChangeRequest)).sort(byCode);
  const tasks = await all(Task);
  const tcode = Object.fromEntries(tasks.map((t) => [t.id, t.code]));
  const members = Object.fromEntries((await all(Member)).map((m) => [m.id, m.name]));
  const reqs = await all(Requirement);
  return crs.map((c) => ({ ...c, afterCode: tcode[c.afterTaskId] || '', beforeCode: tcode[c.beforeTaskId] || '',
    assignee: members[c.assigneeId] || '', reqCode: reqs.find((r) => r.crId === c.id)?.code || '',
    taskCode: tasks.find((t) => t.crId === c.id)?.code || '' }));
}

async function preds() {
  const tasks = await Task.find({}, { preds: 1 }).lean();
  return Object.fromEntries(tasks.map((t) => [String(t._id), t.preds.map(String)]));
}

export async function saveChangeRequest(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const title = text(data, 'title', 'Title', { max: 200 });
    const description = text(data, 'description', 'Description', { required: false });
    const justification = text(data, 'justification', 'Justification');
    const requestedBy = text(data, 'requestedBy', 'Requested by');
    const requestDate = date(data.requestDate, 'Request date');
    const priority = choice(data.priority, 'Priority', PRIORITIES);
    const costImpact = num(data.costImpact, 'Cost impact (PKR)', { min: 0 });
    const scheduleImpact = num(data.scheduleImpact, 'Schedule impact (days)', { min: 0, max: 365, int: true });
    const afterTaskId = optId(data.afterTaskId, 'Predecessor activity');
    const beforeTaskId = optId(data.beforeTaskId, 'Successor activity');
    const assigneeId = optId(data.assigneeId, 'Assignee');
    if (scheduleImpact > 0 && !afterTaskId) throw new ValidationError('Select the activity the new work follows (predecessor) so the schedule impact can be applied.');
    if (afterTaskId && beforeTaskId && afterTaskId === beforeTaskId) throw new ValidationError('Predecessor and successor activities must be different.');
    if (afterTaskId) need(await Task.findById(afterTaskId).lean(), 'Predecessor activity');
    if (beforeTaskId) {
      const b = need(await Task.findById(beforeTaskId).lean(), 'Successor activity');
      if (b.actualStart) throw new ValidationError(`${b.code} has already started; new work cannot be inserted before it.`);
      const pr = await preds();
      if (afterTaskId && (calc.upstream(afterTaskId, pr).has(beforeTaskId) || afterTaskId === beforeTaskId)) {
        throw new ValidationError('The successor activity is upstream of the predecessor - this would create a dependency cycle.');
      }
    }
    const doc = { title, description, justification, requestedBy, requestDate, priority, costImpact, scheduleImpact, afterTaskId, beforeTaskId, assigneeId };
    if (id) {
      const cr = need(await ChangeRequest.findById(id).lean(), 'Change request');
      if (cr.status !== 'Pending') throw new ValidationError('Only pending change requests can be edited.');
      await ChangeRequest.updateOne({ _id: id }, doc);
      await Requirement.updateOne({ crId: id }, { title, description, priority });
      return cr.code;
    }
    const code = await nextCode(ChangeRequest, 'CR-', 3);
    const cr = await ChangeRequest.create({ ...doc, code });
    await Requirement.create({ code: await nextCode(Requirement, 'R'), title, description, priority, status: 'Proposed',
      source: 'Change Request', crId: cr._id, created: requestDate });
    await log('Change request raised', `${code}: ${title}`);
    return code;
  });
}

export async function deleteChangeRequest(id) {
  await checkOpen();
  const cr = need(await ChangeRequest.findById(id).lean(), 'Change request');
  if (cr.status === 'Approved') throw new ValidationError('Approved change requests are part of the baseline history and cannot be deleted.');
  await Requirement.deleteMany({ crId: id });
  await ChangeRequest.deleteOne({ _id: id });
}

async function taskGraph() {
  const tasks = (await all(Task)).sort(byCode);
  const ids = tasks.map((t) => t.id);
  const info = Object.fromEntries(tasks.map((t) => [t.id, {
    duration: t.duration, percent: t.percent,
    actualStart: t.actualStart ? calc.toDay(t.actualStart) : null, actualEnd: t.actualEnd ? calc.toDay(t.actualEnd) : null }]));
  const pr = Object.fromEntries(tasks.map((t) => [t.id, [...t.preds]]));
  return { tasks, ids, info, pr };
}

export async function previewChangeImpact(id) {
  const cr = need(await one(ChangeRequest, { _id: id }), 'Change request');
  const p = await getProject();
  const before = await scheduleAnalysis();
  const ev = await evmAnalysis();
  const { ids, info, pr } = await taskGraph();
  if (cr.scheduleImpact > 0) {
    const nid = '__new__';
    ids.push(nid);
    info[nid] = { duration: cr.scheduleImpact, actualStart: null, actualEnd: null, percent: 0 };
    pr[nid] = cr.afterTaskId ? [cr.afterTaskId] : [];
    if (cr.beforeTaskId) pr[cr.beforeTaskId] = [...(pr[cr.beforeTaskId] || []), nid];
  }
  const dur = Object.fromEntries(ids.map((i) => [i, info[i].duration]));
  const { res, finish } = calc.plannedSchedule(ids, dur, pr, calc.toDay(p.startDate));
  const fc = calc.forecast(ids, info, pr, res, calc.toDay(p.statusDate));
  const nReq = await Requirement.countDocuments({ status: 'Approved' });
  return {
    cr,
    rows: [
      ['Approved scope (requirements)', nReq, nReq + 1],
      ['Approved budget', money(p.approvedBudget), money(p.approvedBudget + cr.costImpact)],
      ['Planned cost baseline (BAC)', money(ev.BAC), money(ev.BAC + cr.costImpact)],
      ['Approved deadline', p.deadline, calc.fromDay(calc.toDay(p.deadline) + cr.scheduleImpact)],
      ['Planned finish (CPM)', before.plannedFinish, calc.fromDay(finish)],
      ['Forecast finish', before.forecastFinish, calc.fromDay(Math.max(...ids.map((i) => fc[i].fe)))],
    ],
  };
}

// Change control: approval updates scope (requirement + WBS + activity), schedule (dependency
// insertion + deadline) and budget (approved budget + BAC). Any failure undoes every step.
export async function approveChangeRequest(id, decidedBy, notes = '', decisionDate = null) {
  await checkOpen();
  const cr = need(await ChangeRequest.findById(id).lean(), 'Change request');
  if (cr.status !== 'Pending') throw new ValidationError(`${cr.code} is already ${cr.status}.`);
  decidedBy = text({ v: decidedBy }, 'v', 'Decided by');
  const p = await getProject();
  const ddate = date(decisionDate || p.statusDate, 'Decision date');
  if (ddate < cr.requestDate) throw new ValidationError('Decision date cannot be before the request date.');
  if (cr.beforeTaskId) {
    const b = await Task.findById(cr.beforeTaskId).lean();
    if (b?.actualStart) throw new ValidationError(`${b.code} has already started; the new work can no longer be inserted before it. Edit the change request first.`);
  }
  const root = await Wbs.findOne({ nodeType: 'Project' }).lean();
  if (!root) throw new ValidationError('Create the root WBS element before approving change requests.');

  const undo = [];
  try {
    const req = await Requirement.findOne({ crId: id }).lean();
    await Requirement.updateOne({ _id: req._id }, { status: 'Approved' });
    undo.push(() => Requirement.updateOne({ _id: req._id }, { status: req.status }));
    const dcode = await nextWbsCode(root._id);
    const del = await Wbs.create({ code: dcode, name: cr.title, parentId: root._id, nodeType: 'Deliverable', requirementId: req._id, description: `Added by ${cr.code}` });
    undo.push(() => Wbs.deleteOne({ _id: del._id }));
    let taskCode = null;
    if (cr.scheduleImpact > 0) {
      const wp = await Wbs.create({ code: `${dcode}.1`, name: `${cr.title} - development`, parentId: del._id, nodeType: 'Work Package', requirementId: req._id, description: `Added by ${cr.code}` });
      undo.push(() => Wbs.deleteOne({ _id: wp._id }));
      taskCode = await nextCode(Task, 'T');
      const t = await Task.create({ code: taskCode, name: cr.title, wbsId: wp._id, assigneeId: cr.assigneeId, duration: cr.scheduleImpact,
        budget: cr.costImpact, crId: cr._id, preds: cr.afterTaskId ? [cr.afterTaskId] : [], notes: `Created by approval of ${cr.code}` });
      undo.push(() => Task.deleteOne({ _id: t._id }));
      if (cr.beforeTaskId) {
        const b = await Task.findById(cr.beforeTaskId).lean();
        await Task.updateOne({ _id: b._id }, { $addToSet: { preds: t._id } });
        undo.push(() => Task.updateOne({ _id: b._id }, { preds: b.preds }));
      }
      const g = await taskGraph();
      calc.topologicalOrder(g.ids, g.pr); // throws CycleError -> rollback
    }
    const newBudget = p.approvedBudget + cr.costImpact;
    const newDeadline = calc.fromDay(calc.toDay(p.deadline) + cr.scheduleImpact);
    await Project.updateOne({}, { approvedBudget: newBudget, deadline: newDeadline });
    undo.push(() => Project.updateOne({}, { approvedBudget: p.approvedBudget, deadline: p.deadline }));
    const bl = await Baseline.create({ changeDate: ddate, crId: cr._id, oldBudget: p.approvedBudget, newBudget, oldDeadline: p.deadline, newDeadline,
      note: `${cr.code} approved: +${money(cr.costImpact)}, +${cr.scheduleImpact} days` });
    undo.push(() => Baseline.deleteOne({ _id: bl._id }));
    await ChangeRequest.updateOne({ _id: id }, { status: 'Approved', decisionDate: ddate, decidedBy, decisionNotes: notes });
    await log('Change request approved', `${cr.code}: budget ${money(p.approvedBudget)} -> ${money(newBudget)}, deadline ${p.deadline} -> ${newDeadline}, activity ${taskCode || '-'}`);
    return taskCode;
  } catch (e) {
    for (const u of undo.reverse()) await u();
    if (e instanceof calc.CycleError) throw new ValidationError(`Approval rolled back: ${e.message}`);
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`Approval rolled back (database error): ${e.message}`);
  }
}

export async function rejectChangeRequest(id, decidedBy, notes = '', decisionDate = null) {
  await checkOpen();
  const cr = need(await ChangeRequest.findById(id).lean(), 'Change request');
  if (cr.status !== 'Pending') throw new ValidationError(`${cr.code} is already ${cr.status}.`);
  decidedBy = text({ v: decidedBy }, 'v', 'Decided by');
  const ddate = date(decisionDate || (await getProject()).statusDate, 'Decision date');
  await Requirement.updateMany({ crId: id }, { status: 'Rejected' });
  await ChangeRequest.updateOne({ _id: id }, { status: 'Rejected', decisionDate: ddate, decidedBy, decisionNotes: notes });
  await log('Change request rejected', cr.code);
}

export async function baselineHistory() {
  const crs = Object.fromEntries((await all(ChangeRequest)).map((c) => [c.id, c.code]));
  return (await all(Baseline, {}, { _id: 1 })).map((b) => ({ ...b, crCode: crs[b.crId] || '' }));
}

// ================================================================== MODULE 3
export async function listTasks() {
  const tasks = (await all(Task)).sort(byCode);
  const wbs = Object.fromEntries((await all(Wbs)).map((w) => [w.id, w]));
  const mem = Object.fromEntries((await all(Member)).map((m) => [m.id, m]));
  const crs = Object.fromEntries((await all(ChangeRequest)).map((c) => [c.id, c.code]));
  const exps = await all(Expense);
  const code = Object.fromEntries(tasks.map((t) => [t.id, t.code]));
  return tasks.map((t) => ({
    ...t, wbsCode: wbs[t.wbsId]?.code || '', wbsName: wbs[t.wbsId]?.name || '', assignee: mem[t.assigneeId]?.name || '',
    dailyRate: mem[t.assigneeId]?.dailyRate || 0, crCode: crs[t.crId] || '',
    actualCost: exps.filter((e) => e.taskId === t.id).reduce((s, e) => s + e.amount, 0),
    predCodes: t.preds.map((p) => code[p]).sort().join(', '),
  }));
}

export async function estimateCost(assigneeId, duration) {
  const d = num(duration, 'Duration', { min: 1, int: true });
  const m = assigneeId && mongoose.isValidObjectId(assigneeId) ? await Member.findById(assigneeId).lean() : null;
  if (!m) throw new ValidationError('Select an assignee to estimate labour cost.');
  return d * m.dailyRate;
}

export async function saveTask(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const name = text(data, 'name', 'Activity name', { max: 200 });
    const wbsId = optId(data.wbsId, 'WBS');
    if (!wbsId) throw new ValidationError('Select the WBS work package for this activity.');
    const w = need(await Wbs.findById(wbsId).lean(), 'WBS element');
    if (w.nodeType !== 'Work Package') throw new ValidationError('Activities can only be defined under a WBS Work Package.');
    const [ok, why] = await wbsInScope(wbsId);
    if (!ok) throw new ValidationError(`Activity rejected - outside approved scope: ${why}.`);
    const assigneeId = optId(data.assigneeId, 'Team member');
    if (assigneeId) need(await Member.findById(assigneeId).lean(), 'Team member');
    const duration = num(data.duration, 'Duration (days)', { min: 1, max: 365, int: true });
    const budget = num(data.budget, 'Estimated cost (PKR)', { min: 0 });
    const notes = text(data, 'notes', 'Notes', { required: false });
    let tid = id;
    if (id) {
      need(await Task.findById(id).lean(), 'Activity');
      await Task.updateOne({ _id: id }, { name, wbsId, assigneeId, duration, budget, notes });
    } else {
      const t = await Task.create({ code: await nextCode(Task, 'T'), name, wbsId, assigneeId, duration, budget, notes });
      tid = String(t._id);
    }
    if (Array.isArray(data.preds)) {
      try { await setDependencies(tid, data.preds); } catch (e) { if (!id) await Task.deleteOne({ _id: tid }); throw e; }
    }
    return tid;
  });
}

export async function setDependencies(id, predIds) {
  await checkOpen();
  const set = [...new Set((predIds || []).map((p) => optId(p, 'Predecessor')).filter(Boolean))];
  if (set.includes(String(id))) throw new ValidationError('An activity cannot depend on itself.');
  const pr = await preds();
  const unknown = set.filter((p) => !pr[p]);
  if (unknown.length) throw new ValidationError(`Unknown predecessor ids: ${unknown.join(', ')}`);
  if (calc.wouldCreateCycle(String(id), set, pr)) throw new ValidationError('These dependencies would create a cycle (circular dependency).');
  const t = need(await Task.findById(id).lean(), 'Activity');
  if (t.actualStart) {
    for (const p of set) {
      const x = await Task.findById(p).lean();
      if (!x.actualEnd || x.actualEnd >= t.actualStart) {
        throw new ValidationError(`${t.code} already started on ${t.actualStart}; ${x.code} did not finish before that (finish-to-start violation).`);
      }
    }
  }
  await Task.updateOne({ _id: id }, { preds: set });
}

export async function updateProgress(id, data) {
  await checkOpen();
  const t = need(await Task.findById(id).lean(), 'Activity');
  const p = await getProject();
  const aS = date(data.actualStart, 'Actual start', false);
  const aE = date(data.actualEnd, 'Actual finish', false);
  const pct = num(data.percent, '% complete', { min: 0, max: 100, int: true });
  if (pct > 0 && !aS) throw new ValidationError('Enter the actual start date for an activity with progress > 0%.');
  if (pct === 100 && !aE) throw new ValidationError('Enter the actual finish date for a 100% complete activity.');
  if (aE && pct !== 100) throw new ValidationError('An activity with an actual finish date must be 100% complete.');
  if (aE && !aS) throw new ValidationError('Actual finish requires an actual start.');
  if (aS && aS < p.startDate) throw new ValidationError('Actual start cannot be before the project start date.');
  if (aS && aE && aE < aS) throw new ValidationError('Actual finish cannot be before actual start.');
  for (const [d, l] of [[aS, 'Actual start'], [aE, 'Actual finish']]) {
    if (d && d > p.statusDate) throw new ValidationError(`${l} (${d}) cannot be after the status date (${p.statusDate}).`);
  }
  if (aS) {
    for (const pid of t.preds) {
      const pr = await Task.findById(pid).lean();
      if (!pr.actualEnd || pr.actualEnd >= aS) throw new ValidationError(`Predecessor ${pr.code} must finish before ${t.code} starts (finish-to-start dependency).`);
    }
  }
  for (const s of await Task.find({ preds: t._id, actualStart: { $ne: null } }).lean()) {
    if (!aE || aE >= s.actualStart) throw new ValidationError(`Successor ${s.code} already started on ${s.actualStart}; ${t.code} must have finished before that.`);
  }
  const first = (await Expense.find({ taskId: id }).lean()).map((e) => e.date).sort()[0];
  if (first && (!aS || first < aS)) throw new ValidationError(`Expenses are recorded from ${first}; actual start must be on/before it.`);
  await Task.updateOne({ _id: id }, { actualStart: aS, actualEnd: aE, percent: pct });
}

export async function deleteTask(id) {
  await checkOpen();
  const t = need(await Task.findById(id).lean(), 'Activity');
  if (t.crId) throw new ValidationError('This activity was created by an approved change request and is part of the baseline.');
  if (await Task.countDocuments({ preds: t._id })) throw new ValidationError('Other activities depend on this one. Remove those dependencies first.');
  if (await Expense.countDocuments({ taskId: id })) throw new ValidationError('This activity has recorded expenses and cannot be deleted.');
  if (await Milestone.countDocuments({ taskId: id })) throw new ValidationError('A milestone is linked to this activity.');
  await Defect.updateMany({ taskId: id }, { taskId: null });
  await Task.deleteOne({ _id: id });
}

export async function scheduleAnalysis() {
  const p = need(await getProject(), 'Project');
  const rows = await listTasks();
  const { ids, info, pr } = await taskGraph();
  const start = calc.toDay(p.startDate);
  const deadline = calc.toDay(p.deadline);
  const sd = calc.toDay(p.statusDate);
  if (!ids.length) {
    return { tasks: [], plannedFinish: p.startDate, forecastFinish: p.startDate, deadline: p.deadline, slip: 0,
      impacts: [], milestones: [], criticalPath: [], statusDate: p.statusDate, startDate: p.startDate, baselineDeadline: p.baselineDeadline };
  }
  const dur = Object.fromEntries(ids.map((i) => [i, info[i].duration]));
  const { res, finish } = calc.plannedSchedule(ids, dur, pr, start);
  const fc = calc.forecast(ids, info, pr, res, sd);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const F = calc.fromDay;
  for (const r of rows) {
    const pl = res[r.id]; const f = fc[r.id];
    Object.assign(r, { es: F(pl.es), ef: F(pl.ef), ls: F(pl.ls), lf: F(pl.lf), float: pl.float, critical: pl.critical,
      fs: F(f.fs), fe: F(f.fe), delay: f.delay, ownDelay: f.ownDelay, state: f.state,
      plannedPct: Math.round(calc.plannedFraction(pl.es, pl.ef, sd) * 100) });
  }
  const ffDay = Math.max(...ids.map((i) => fc[i].fe));
  const impacts = calc.delayImpacts(ids, fc, pr).map((imp) => ({
    ...imp, code: byId[imp.task].code, name: byId[imp.task].name, state: byId[imp.task].state,
    affectedCodes: imp.affected.map((a) => `${byId[a].code} (+${Math.max(fc[a].delay, 0)}d)`),
  }));
  const ms = [];
  for (const m of await all(Milestone, {}, { _id: 1 })) {
    const r = byId[m.taskId];
    if (!r) continue;
    let status;
    if (r.actualEnd) status = r.actualEnd <= r.ef ? 'Achieved' : 'Achieved late';
    else if (calc.toDay(r.fe) > deadline) status = 'Missed deadline (forecast)';
    else if (r.delay > 0) status = 'At risk';
    else status = 'On track';
    const owner = m.ownerId ? await Member.findById(m.ownerId).lean() : null;
    ms.push({ ...m, taskCode: r.code, owner: owner?.name || '', planned: r.ef, forecast: r.fe, actual: r.actualEnd || '', status, variance: r.delay });
  }
  const crit = [...rows].sort((a, b) => a.es.localeCompare(b.es)).filter((r) => r.critical).map((r) => r.code);
  return { tasks: rows, plannedFinish: F(finish), forecastFinish: F(ffDay), deadline: p.deadline, slip: ffDay - deadline,
    impacts, milestones: ms, criticalPath: crit, statusDate: p.statusDate, startDate: p.startDate, baselineDeadline: p.baselineDeadline };
}

// ================================================================== MODULE 4
export async function listExpenses() {
  const tasks = Object.fromEntries((await all(Task)).map((t) => [t.id, t]));
  return (await all(Expense)).map((e) => ({ ...e, taskCode: tasks[e.taskId]?.code, taskName: tasks[e.taskId]?.name }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function addExpense(data) {
  await checkOpen();
  return wrapDb(async () => {
    const taskId = optId(data.taskId, 'Activity');
    if (!taskId) throw new ValidationError('Select the activity the expense belongs to.');
    const t = need(await Task.findById(taskId).lean(), 'Activity');
    const d = date(data.date, 'Expense date');
    const amount = num(data.amount, 'Amount (PKR)', { min: 1 });
    const p = await getProject();
    if (d > p.statusDate) throw new ValidationError('Expense date cannot be after the status date (actuals only).');
    if (!t.actualStart || d < t.actualStart) throw new ValidationError(`${t.code} has not started by ${d}; costs can only be booked against started work.`);
    await Expense.create({ taskId, date: d, amount, description: text(data, 'description', 'Description', { required: false }) });
  });
}

export async function deleteExpense(id) { await checkOpen(); await Expense.deleteOne({ _id: id }); }

export async function evmAnalysis() {
  const p = need(await getProject(), 'Project');
  const sch = await scheduleAnalysis();
  const rows = sch.tasks;
  const sd = calc.toDay(p.statusDate);
  if (!rows.length) return { ...calc.evmMetrics([], {}, {}, {}, 0, sd), tasks: [], alerts: [], cpiStatus: 'N/A', spiStatus: 'N/A', curve: [], acCurve: [] };
  const ids = rows.map((r) => r.id);
  const planned = Object.fromEntries(rows.map((r) => [r.id, { es: calc.toDay(r.es), ef: calc.toDay(r.ef) }]));
  const budgets = Object.fromEntries(rows.map((r) => [r.id, r.budget]));
  const pcts = Object.fromEntries(rows.map((r) => [r.id, r.percent]));
  const exps = (await all(Expense)).filter((e) => e.date <= p.statusDate);
  const ac = exps.reduce((s, e) => s + e.amount, 0);
  const m = calc.evmMetrics(ids, budgets, planned, pcts, ac, sd);
  m.tasks = rows.map((r) => {
    const pv = r.budget * calc.plannedFraction(planned[r.id].es, planned[r.id].ef, sd);
    const ev = (r.budget * r.percent) / 100;
    return { id: r.id, code: r.code, name: r.name, BAC: r.budget, PV: pv, EV: ev, AC: r.actualCost, CV: ev - r.actualCost, SV: ev - pv,
      CPI: r.actualCost ? ev / r.actualCost : null, SPI: pv ? ev / pv : null };
  });
  m.cpiStatus = calc.classifyIndex(m.CPI, p.cpiWarn, p.cpiCrit);
  m.spiStatus = calc.classifyIndex(m.SPI, p.spiWarn, p.spiCrit);
  const alerts = [];
  if (sch.slip > 0) alerts.push(['CRITICAL', `Forecast finish ${sch.forecastFinish} is ${sch.slip} days after the approved deadline ${p.deadline}.`]);
  if (m.EAC > p.approvedBudget) alerts.push(['CRITICAL', `Forecast cost EAC ${money(m.EAC)} exceeds approved budget ${money(p.approvedBudget)}.`]);
  if (m.BAC > p.approvedBudget) alerts.push(['CRITICAL', `Planned cost baseline ${money(m.BAC)} exceeds approved budget.`]);
  if (m.cpiStatus !== 'OK' && m.CPI !== null) alerts.push([m.cpiStatus, `Cost overrun: CPI = ${m.CPI.toFixed(3)} (threshold ${p.cpiWarn}). Spent ${money(m.AC)} for ${money(m.EV)} of work.`]);
  if (m.spiStatus !== 'OK' && m.SPI !== null) alerts.push([m.spiStatus, `Schedule deviation: SPI = ${m.SPI.toFixed(3)} (threshold ${p.spiWarn}). Work behind plan by ${money(-m.SV)}.`]);
  for (const t of m.tasks) if (t.CPI !== null && t.CPI < p.cpiCrit) alerts.push(['WARNING', `${t.code} ${t.name}: activity CPI ${t.CPI.toFixed(2)}.`]);
  const order = { CRITICAL: 0, WARNING: 1 };
  m.alerts = alerts.sort((a, b) => order[a[0]] - order[b[0]]);
  m.curve = calc.pvCurve(ids, budgets, planned, calc.toDay(p.startDate), calc.toDay(sch.plannedFinish)).map(([d, v]) => [calc.fromDay(d), v]);
  const byDate = {};
  for (const e of exps) byDate[e.date] = (byDate[e.date] || 0) + e.amount;
  let cum = 0;
  m.acCurve = Object.keys(byDate).sort().map((d) => [d, (cum += byDate[d])]);
  m.statusDate = p.statusDate; m.approvedBudget = p.approvedBudget; m.cpiWarn = p.cpiWarn; m.cpiCrit = p.cpiCrit;
  return m;
}

// ================================================================== MODULE 5
const SEV_ORDER = { Critical: 1, High: 2, Medium: 3, Low: 4 };
const DST_ORDER = { Open: 1, 'In Progress': 2 };

export async function listDefects() {
  const mem = Object.fromEntries((await all(Member)).map((m) => [m.id, m.name]));
  const tasks = Object.fromEntries((await all(Task)).map((t) => [t.id, t.code]));
  return (await all(Defect)).map((d) => ({ ...d, assignee: mem[d.assignedId] || '', taskCode: tasks[d.taskId] || '' }))
    .sort((a, b) => (DST_ORDER[a.status] || 3) - (DST_ORDER[b.status] || 3) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || byCode(a, b));
}

export async function saveDefect(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const title = text(data, 'title', 'Title', { max: 200 });
    const module = text(data, 'module', 'Module');
    const severity = choice(data.severity, 'Severity', SEVERITIES);
    const status = choice(data.status || 'Open', 'Status', DEFECT_STATUSES);
    const assignedId = optId(data.assignedId, 'Assignee');
    if (!assignedId) throw new ValidationError('Assign the defect to a team member.');
    const reportedDate = date(data.reportedDate, 'Reported date');
    let resolvedDate = date(data.resolvedDate, 'Resolved date', false);
    if (['Resolved', 'Closed'].includes(status) && !resolvedDate) throw new ValidationError('Enter the resolved date for a resolved/closed defect.');
    if (['Open', 'In Progress'].includes(status)) resolvedDate = null;
    if (resolvedDate && resolvedDate < reportedDate) throw new ValidationError('Resolved date cannot be before the reported date.');
    if (reportedDate > (await getProject()).statusDate) throw new ValidationError('Reported date cannot be after the status date.');
    const doc = { title, module, severity, status, assignedId, reportedDate, resolvedDate, taskId: optId(data.taskId, 'Activity'),
      description: text(data, 'description', 'Description', { required: false }) };
    let code;
    if (id) { await Defect.updateOne({ _id: id }, doc); code = (await Defect.findById(id).lean()).code; }
    else { code = await nextCode(Defect, 'D'); id = String((await Defect.create({ ...doc, code }))._id); }
    await log('Defect saved', `${code} [${severity}] ${status}`);
    return id;
  });
}

export async function deleteDefect(id) {
  await checkOpen();
  await QualityCheck.updateMany({ defectId: id }, { defectId: null });
  await Defect.deleteOne({ _id: id });
}

export async function listChecks() {
  const wbs = Object.fromEntries((await all(Wbs)).map((w) => [w.id, w]));
  const mem = Object.fromEntries((await all(Member)).map((m) => [m.id, m.name]));
  const def = Object.fromEntries((await all(Defect)).map((d) => [d.id, d.code]));
  return (await all(QualityCheck)).sort(byCode).map((q) => ({ ...q, wbsCode: wbs[q.wbsId]?.code || '', wbsName: wbs[q.wbsId]?.name || '',
    inspector: mem[q.inspectorId] || '', defectCode: def[q.defectId] || '' }));
}

export async function saveCheck(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const wbsId = optId(data.wbsId, 'Deliverable');
    if (!wbsId) throw new ValidationError('Select the deliverable (WBS element) being checked.');
    need(await Wbs.findById(wbsId).lean(), 'WBS element');
    const doc = { wbsId, criterion: text(data, 'criterion', 'Criterion', { max: 300 }),
      checkType: choice(data.checkType, 'Check type', CHECK_TYPES), expected: text(data, 'expected', 'Expected result') };
    if (id) { await QualityCheck.updateOne({ _id: id }, doc); return id; }
    return String((await QualityCheck.create({ ...doc, code: await nextCode(QualityCheck, 'Q') }))._id);
  });
}

// Recording a failing inspection/test automatically raises a linked defect.
export async function recordCheckResult(id, data) {
  await checkOpen();
  const q = need(await QualityCheck.findById(id).lean(), 'Checklist item');
  const result = choice(data.result, 'Result', CHECK_RESULTS);
  const actual = text(data, 'actual', 'Actual result', { required: result !== 'Pending' });
  const inspectorId = optId(data.inspectorId, 'Inspector');
  if (result !== 'Pending' && !inspectorId) throw new ValidationError('Select the inspector/tester.');
  const d = date(data.checkDate, 'Check date', result !== 'Pending');
  let defectId = q.defectId ? String(q.defectId) : null;
  let raised = false;
  if (result === 'Fail' && !defectId) {
    const w = await Wbs.findById(q.wbsId).lean();
    defectId = await saveDefect({ title: `Failed ${q.checkType.toLowerCase()}: ${q.criterion}`.slice(0, 200),
      description: `Expected: ${q.expected}\nActual: ${actual}`, module: w.name, severity: data.severity || 'High', status: 'Open',
      assignedId: data.assignTo || inspectorId, reportedDate: d });
    raised = true;
  }
  await QualityCheck.updateOne({ _id: id }, { actual, result, inspectorId, checkDate: d, defectId });
  return { defectId, raised };
}

export async function deleteCheck(id) { await checkOpen(); await QualityCheck.deleteOne({ _id: id }); }

export async function listRisks() {
  const mem = Object.fromEntries((await all(Member)).map((m) => [m.id, m.name]));
  const wbs = Object.fromEntries((await all(Wbs)).map((w) => [w.id, w]));
  return calc.rankRisks((await all(Risk)).map((r) => ({ ...r, owner: mem[r.ownerId] || '', wbsCode: wbs[r.wbsId]?.code || '', wbsName: wbs[r.wbsId]?.name || '' })));
}

export async function saveRisk(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const doc = {
      title: text(data, 'title', 'Risk / issue', { max: 200 }),
      description: text(data, 'description', 'Description', { required: false }),
      category: choice(data.category, 'Category', RISK_CATEGORIES),
      likelihood: num(data.likelihood, 'Likelihood', { min: 1, max: 5, int: true }),
      impact: num(data.impact, 'Impact', { min: 1, max: 5, int: true }),
      ownerId: optId(data.ownerId, 'Owner'), wbsId: optId(data.wbsId, 'Deliverable'),
      status: choice(data.status || 'Open', 'Status', RISK_STATUSES),
    };
    if (id) { await Risk.updateOne({ _id: id }, doc); return id; }
    return String((await Risk.create({ ...doc, code: await nextCode(Risk, 'RK') }))._id);
  });
}

export async function deleteRisk(id) { await checkOpen(); await Countermeasure.deleteMany({ riskId: id }); await Risk.deleteOne({ _id: id }); }

export async function listCountermeasures() {
  const mem = Object.fromEntries((await all(Member)).map((m) => [m.id, m.name]));
  const risks = Object.fromEntries((await all(Risk)).map((r) => [r.id, r.code]));
  return (await all(Countermeasure, {}, { _id: 1 })).map((c) => ({ ...c, owner: mem[c.ownerId] || '', riskCode: risks[c.riskId] || '' }))
    .sort((a, b) => a.riskCode.localeCompare(b.riskCode, 'en', { numeric: true }) || b.actionType.localeCompare(a.actionType));
}

export async function saveCountermeasure(data, id = null) {
  await checkOpen();
  return wrapDb(async () => {
    const riskId = optId(data.riskId, 'Risk');
    if (!riskId) throw new ValidationError('Select the risk this countermeasure addresses.');
    need(await Risk.findById(riskId).lean(), 'Risk');
    const doc = { riskId, actionType: choice(data.actionType, 'Action type', ['Preventive', 'Corrective']),
      action: text(data, 'action', 'Action', { max: 300 }), ownerId: optId(data.ownerId, 'Owner'),
      feasible: [true, 'true', 1, '1', 'Yes', 'yes'].includes(data.feasible) };
    if (id) await Countermeasure.updateOne({ _id: id }, doc); else await Countermeasure.create(doc);
  });
}

export async function deleteCountermeasure(id) { await checkOpen(); await Countermeasure.deleteOne({ _id: id }); }

export async function pdpcTree() {
  const p = await getProject();
  const cms = await listCountermeasures();
  const areas = {};
  for (const r of await listRisks()) {
    if (r.status === 'Closed') continue;
    const key = r.wbsCode ? `${r.wbsCode} ${r.wbsName}` : 'Project-wide';
    (areas[key] ||= []).push({ ...r, measures: cms.filter((c) => c.riskId === r.id) });
  }
  return { goal: p?.name || 'Project', areas };
}

// ================================================================== MODULE 6
export async function consistencyCheck() {
  const issues = [];
  for (const t of await Task.find().lean()) {
    const [ok, why] = await wbsInScope(t.wbsId);
    if (!ok) issues.push(['CRITICAL', `${t.code} is outside approved scope: ${why}.`]);
  }
  const wbs = await Wbs.find().lean();
  const covered = new Set(wbs.map((w) => S(w.requirementId)).filter(Boolean));
  for (const r of await Requirement.find({ status: 'Approved' }).lean()) {
    if (!covered.has(String(r._id))) issues.push(['WARNING', `Approved requirement ${r.code} '${r.title}' is not covered by the WBS.`]);
  }
  const tasks = await Task.find().lean();
  const wbsWithTasks = new Set(tasks.map((t) => String(t.wbsId)));
  for (const w of wbs.filter((x) => x.nodeType === 'Work Package').sort(wbsSort)) {
    if (!wbsWithTasks.has(String(w._id))) issues.push(['WARNING', `Work package ${w.code} ${w.name} has no activities.`]);
  }
  for (const c of await ChangeRequest.find({ status: 'Approved', scheduleImpact: { $gt: 0 } }).lean()) {
    if (!tasks.some((t) => S(t.crId) === String(c._id))) issues.push(['CRITICAL', `Approved ${c.code} has no activity in the schedule.`]);
  }
  for (const d of await Defect.find({ severity: 'Critical', status: { $in: ['Open', 'In Progress'] }, taskId: { $ne: null } }).lean()) {
    const t = tasks.find((x) => String(x._id) === String(d.taskId));
    if (t && t.percent === 100) issues.push(['WARNING', `${t.code} is marked complete but critical defect ${d.code} is still open.`]);
  }
  for (const t of tasks.filter((x) => !x.assigneeId)) issues.push(['WARNING', `${t.code} has no assigned team member.`]);
  try { const g = await taskGraph(); calc.topologicalOrder(g.ids, g.pr); } catch (e) { issues.push(['CRITICAL', e.message]); }
  return issues;
}

export async function dashboard() {
  const p = need(await getProject(), 'Project');
  const schedule = await scheduleAnalysis();
  const evm = await evmAnalysis();
  const delayed = schedule.tasks.filter((t) => t.state === 'Delayed');
  const pendingCrs = (await all(ChangeRequest, { status: 'Pending' })).sort(byCode);
  const mem = Object.fromEntries((await all(Member)).map((m) => [m.id, m.name]));
  const criticalDefects = (await all(Defect, { severity: 'Critical', status: { $in: ['Open', 'In Progress'] } })).sort(byCode)
    .map((d) => ({ ...d, assignee: mem[d.assignedId] || '' }));
  const openDefects = await Defect.countDocuments({ status: { $in: ['Open', 'In Progress'] } });
  const checks = await QualityCheck.find().lean();
  const quality = { pass: checks.filter((c) => c.result === 'Pass').length, fail: checks.filter((c) => c.result === 'Fail').length,
    pending: checks.filter((c) => c.result === 'Pending').length, total: checks.length };
  const risks = await listRisks();
  const alerts = [...evm.alerts];
  for (const d of criticalDefects) alerts.push(['CRITICAL', `Unresolved critical defect ${d.code}: ${d.title}`]);
  for (const r of risks) if (r.level === 'High' && r.status !== 'Closed') alerts.push(['WARNING', `High risk ${r.code} (score ${r.score}): ${r.title}`]);
  alerts.push(...(await consistencyCheck()));
  const order = { CRITICAL: 0, WARNING: 1 };
  alerts.sort((a, b) => order[a[0]] - order[b[0]]);
  const { curve, acCurve, tasks, ...ev } = evm;
  return { project: p, evm: ev, schedule: { plannedFinish: schedule.plannedFinish, forecastFinish: schedule.forecastFinish,
    deadline: schedule.deadline, slip: schedule.slip, criticalPath: schedule.criticalPath, impacts: schedule.impacts, milestones: schedule.milestones },
  delayed, pendingCrs, criticalDefects, openDefects, quality, risks, alerts, baseline: await baselineHistory() };
}

export async function auditLog(limit = 200) { return all(AuditLog, {}, { _id: -1 }).then((r) => r.slice(0, limit)); }

export async function exportReport() {
  const d = await dashboard();
  const { project: p, schedule: s, evm: ev } = d;
  const e = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f3 = (v) => (v === null || v === undefined ? '-' : v.toFixed(3));
  const tbl = (h, rows) => (rows.length ? `<table><tr>${h.map((x) => `<th>${e(x)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</table>` : '<p><i>None</i></p>');
  const body = `
<h1>${e(p.name)} - Project Status Report</h1>
<p>Status date: <b>${p.statusDate}</b> | Project status: <b>${e(p.status)}</b> | Generated ${now()}</p>
<h2>Overall progress</h2>${tbl(['Indicator', 'Value'], [['Work complete (EV/BAC)', `${ev.pctComplete.toFixed(1)}%`], ['Planned complete (PV/BAC)', `${ev.pctPlanned.toFixed(1)}%`],
  ['Start date', p.startDate], ['Approved deadline', p.deadline], ['Original deadline', p.baselineDeadline], ['Planned finish (CPM)', s.plannedFinish],
  ['Forecast finish', s.forecastFinish], ['Schedule slip vs deadline', `${s.slip} days`], ['Critical path', s.criticalPath.join(' -> ')]])}
<h2>Budget status (EVM)</h2>${tbl(['Approved budget', 'BAC', 'PV', 'EV', 'AC', 'CV', 'SV', 'CPI', 'SPI', 'EAC', 'VAC'],
  [[money(p.approvedBudget), money(ev.BAC), money(ev.PV), money(ev.EV), money(ev.AC), money(ev.CV), money(ev.SV), f3(ev.CPI), f3(ev.SPI), money(ev.EAC), money(ev.VAC)]])}
<h2>Alerts</h2><ul>${d.alerts.map((a) => `<li class="${a[0]}"><b>${a[0]}</b> ${e(a[1])}</li>`).join('') || '<li>None</li>'}</ul>
<h2>Delayed activities</h2>${tbl(['Code', 'Activity', 'Planned finish', 'Forecast finish', 'Delay (days)', 'Own delay', '% done'],
  d.delayed.map((t) => [t.code, t.name, t.ef, t.fe, t.delay, t.ownDelay, t.percent]))}
<h2>Delay impact on dependent activities</h2>${tbl(['Root cause', 'Own delay', 'Affected activities'], s.impacts.map((i) => [`${i.code} ${i.name}`, `${i.ownDelay} d`, i.affectedCodes.join(', ') || '-']))}
<h2>Milestones</h2>${tbl(['Milestone', 'Owner', 'Planned', 'Forecast', 'Actual', 'Status'], s.milestones.map((m) => [m.name, m.owner, m.planned, m.forecast, m.actual, m.status]))}
<h2>Pending change requests</h2>${tbl(['Code', 'Title', 'Cost impact', 'Schedule impact', 'Requested'], d.pendingCrs.map((c) => [c.code, c.title, money(c.costImpact), `${c.scheduleImpact} d`, c.requestDate]))}
<h2>Baseline changes (approved CRs)</h2>${tbl(['Date', 'CR', 'Budget', 'Deadline'], d.baseline.map((b) => [b.changeDate, b.crCode, `${money(b.oldBudget)} -> ${money(b.newBudget)}`, `${b.oldDeadline} -> ${b.newDeadline}`]))}
<h2>Unresolved critical defects</h2>${tbl(['Code', 'Title', 'Module', 'Assigned', 'Status', 'Reported'], d.criticalDefects.map((x) => [x.code, x.title, x.module, x.assignee, x.status, x.reportedDate]))}
<h2>Top risks</h2>${tbl(['Rank', 'Code', 'Risk', 'L', 'I', 'Score', 'Level'], d.risks.slice(0, 8).map((r) => [r.rank, r.code, r.title, r.likelihood, r.impact, r.score, r.level]))}`;
  const css = 'body{font-family:Segoe UI,Arial,sans-serif;margin:32px;color:#1f2937}h1{color:#4338ca}h2{border-bottom:2px solid #4338ca;padding-bottom:4px;margin-top:28px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;font-size:13px}th{background:#e0e7ff}li.CRITICAL{color:#b91c1c}li.WARNING{color:#b45309}';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Status Report</title><style>${css}</style></head><body>${body}</body></html>`;
}
