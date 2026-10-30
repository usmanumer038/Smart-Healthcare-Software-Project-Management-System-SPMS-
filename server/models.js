// Mongoose schemas = the database schema (validated at the database layer too).
import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const Ref = (ref) => ({ type: Schema.Types.ObjectId, ref, default: null });
const DateStr = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };
const opts = { versionKey: false, timestamps: false };

export const PRIORITIES = ['Must', 'Should', 'Could', "Won't"];
export const REQ_STATUSES = ['Proposed', 'Approved', 'Rejected'];
export const WBS_TYPES = ['Project', 'Deliverable', 'Work Package'];
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const DEFECT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const CHECK_TYPES = ['Inspection', 'Test'];
export const CHECK_RESULTS = ['Pending', 'Pass', 'Fail'];
export const RISK_STATUSES = ['Open', 'Mitigating', 'Closed'];
export const RISK_CATEGORIES = ['Scope', 'Schedule', 'Cost', 'Quality', 'Technical', 'Resource', 'Security', 'External'];
export const PROJECT_STATUSES = ['Initiated', 'Planning', 'Executing', 'Monitoring & Control', 'Closed'];
export const PLAN_SECTIONS = ['Scope Management', 'Schedule Management', 'Cost Management',
  'Quality Management', 'Risk Management', 'Communication'];

export const Project = model('Project', new Schema({
  name: { type: String, required: true },
  client: String, sponsor: String, manager: String,
  objectives: { type: String, required: true },
  stakeholders: { type: String, required: true },
  scopeIn: { type: String, required: true },
  scopeOut: String,
  approvedBudget: { type: Number, required: true, min: 1 },
  baselineBudget: { type: Number, required: true, min: 1 },
  startDate: { ...DateStr, required: true },
  deadline: { ...DateStr, required: true },
  baselineDeadline: { ...DateStr, required: true },
  status: { type: String, enum: PROJECT_STATUSES, default: 'Planning' },
  statusDate: { ...DateStr, required: true },
  cpiWarn: { type: Number, default: 0.95 }, cpiCrit: { type: Number, default: 0.9 },
  spiWarn: { type: Number, default: 0.95 }, spiCrit: { type: Number, default: 0.9 },
}, opts), 'project');

export const PlanSection = model('PlanSection', new Schema({
  section: { type: String, enum: PLAN_SECTIONS, unique: true, required: true },
  content: { type: String, default: '' },
  updated: String,
}, opts), 'plan_sections');

export const Member = model('Member', new Schema({
  name: { type: String, required: true, unique: true },
  role: { type: String, required: true },
  responsibility: String,
  dailyRate: { type: Number, required: true, min: 0 },
  email: String,
}, opts), 'team_members');

export const Requirement = model('Requirement', new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  priority: { type: String, enum: PRIORITIES, required: true },
  status: { type: String, enum: REQ_STATUSES, default: 'Proposed' },
  source: { type: String, enum: ['Original', 'Change Request'], default: 'Original' },
  crId: Ref('ChangeRequest'),
  created: String,
}, opts), 'requirements');

export const Wbs = model('Wbs', new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  parentId: Ref('Wbs'),
  nodeType: { type: String, enum: WBS_TYPES, required: true },
  requirementId: Ref('Requirement'),
  description: String,
}, opts), 'wbs');

export const Task = model('Task', new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  wbsId: { ...Ref('Wbs'), required: true },
  assigneeId: Ref('Member'),
  duration: { type: Number, required: true, min: 1 },
  budget: { type: Number, required: true, min: 0 },
  actualStart: { ...DateStr, default: null },
  actualEnd: { ...DateStr, default: null },
  percent: { type: Number, min: 0, max: 100, default: 0 },
  preds: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
  crId: Ref('ChangeRequest'),
  notes: String,
}, opts), 'tasks');

export const Milestone = model('Milestone', new Schema({
  name: { type: String, required: true },
  taskId: { ...Ref('Task'), required: true },
  ownerId: Ref('Member'),
  description: String,
}, opts), 'milestones');

export const Expense = model('Expense', new Schema({
  taskId: { ...Ref('Task'), required: true },
  date: { ...DateStr, required: true },
  amount: { type: Number, required: true, min: 1 },
  description: String,
}, opts), 'expenses');

export const ChangeRequest = model('ChangeRequest', new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  justification: { type: String, required: true },
  requestedBy: { type: String, required: true },
  requestDate: { ...DateStr, required: true },
  priority: { type: String, enum: PRIORITIES, required: true },
  costImpact: { type: Number, min: 0, required: true },
  scheduleImpact: { type: Number, min: 0, required: true },
  afterTaskId: Ref('Task'),
  beforeTaskId: Ref('Task'),
  assigneeId: Ref('Member'),
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  decisionDate: String, decidedBy: String, decisionNotes: String,
}, opts), 'change_requests');

export const Baseline = model('Baseline', new Schema({
  changeDate: { ...DateStr, required: true },
  crId: Ref('ChangeRequest'),
  oldBudget: Number, newBudget: Number, oldDeadline: String, newDeadline: String, note: String,
}, opts), 'baseline_history');

export const Defect = model('Defect', new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  module: { type: String, required: true },
  severity: { type: String, enum: SEVERITIES, required: true },
  assignedId: Ref('Member'),
  status: { type: String, enum: DEFECT_STATUSES, default: 'Open' },
  reportedDate: { ...DateStr, required: true },
  resolvedDate: { ...DateStr, default: null },
  taskId: Ref('Task'),
}, opts), 'defects');

export const QualityCheck = model('QualityCheck', new Schema({
  code: { type: String, required: true, unique: true },
  wbsId: { ...Ref('Wbs'), required: true },
  criterion: { type: String, required: true },
  checkType: { type: String, enum: CHECK_TYPES, required: true },
  expected: String, actual: String,
  result: { type: String, enum: CHECK_RESULTS, default: 'Pending' },
  inspectorId: Ref('Member'),
  checkDate: { ...DateStr, default: null },
  defectId: Ref('Defect'),
}, opts), 'quality_checks');

export const Risk = model('Risk', new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: String,
  category: { type: String, enum: RISK_CATEGORIES, required: true },
  wbsId: Ref('Wbs'),
  likelihood: { type: Number, min: 1, max: 5, required: true },
  impact: { type: Number, min: 1, max: 5, required: true },
  ownerId: Ref('Member'),
  status: { type: String, enum: RISK_STATUSES, default: 'Open' },
}, opts), 'risks');

export const Countermeasure = model('Countermeasure', new Schema({
  riskId: { ...Ref('Risk'), required: true },
  actionType: { type: String, enum: ['Preventive', 'Corrective'], required: true },
  action: { type: String, required: true },
  ownerId: Ref('Member'),
  feasible: { type: Boolean, default: true },
}, opts), 'countermeasures');

export const Closure = model('Closure', new Schema({
  closedDate: { ...DateStr, required: true },
  finalCost: Number,
  acceptedBy: { type: String, required: true },
  lessons: { type: String, required: true },
  notes: String,
}, opts), 'closure');

export const AuditLog = model('AuditLog', new Schema({
  ts: { type: String, required: true },
  action: { type: String, required: true },
  details: String,
}, opts), 'audit_log');

export const ALL_MODELS = [Project, PlanSection, Member, Requirement, Wbs, Task, Milestone, Expense,
  ChangeRequest, Baseline, Defect, QualityCheck, Risk, Countermeasure, Closure, AuditLog];
