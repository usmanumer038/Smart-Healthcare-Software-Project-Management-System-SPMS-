// REST API (Express). Every endpoint delegates to the service layer.
import express from 'express';
import * as svc from './service.js';
import { resetAndSeed } from './seed.js';

const r = express.Router();
const h = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out === undefined ? { ok: true } : out);
  } catch (e) { next(e); }
};
const id = (req) => req.params.id;

// meta
r.get('/enums', h(() => svc.ENUMS));
r.get('/dashboard', h(() => svc.dashboard()));
r.get('/consistency', h(() => svc.consistencyCheck()));
r.get('/report', h(async (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="status_report.html"');
  res.type('html').send(await svc.exportReport());
}));
r.post('/admin/reset', h(() => resetAndSeed()));

// module 1
r.get('/project', h(() => svc.getProject()));
r.put('/project', h((req) => svc.saveCharter(req.body)));
r.put('/project/settings', h((req) => svc.saveSettings(req.body)));
r.get('/plan', h(() => svc.getPlan()));
r.post('/plan/generate', h(() => svc.regeneratePlan()));
r.put('/plan/:section', h((req) => svc.savePlanSection(req.params.section, req.body.content)));
r.get('/milestones', h(async () => (await svc.scheduleAnalysis()).milestones));
r.post('/milestones', h((req) => svc.saveMilestone(req.body)));
r.put('/milestones/:id', h((req) => svc.saveMilestone(req.body, id(req))));
r.delete('/milestones/:id', h((req) => svc.deleteMilestone(id(req))));
r.get('/members', h(() => svc.listMembers()));
r.post('/members', h((req) => svc.saveMember(req.body)));
r.put('/members/:id', h((req) => svc.saveMember(req.body, id(req))));
r.delete('/members/:id', h((req) => svc.deleteMember(id(req))));
r.get('/closure', h(() => svc.getClosure()));
r.post('/closure', h((req) => svc.closeProject(req.body)));
r.get('/baseline', h(() => svc.baselineHistory()));
r.get('/audit', h(() => svc.auditLog()));

// module 2
r.get('/requirements', h(() => svc.listRequirements()));
r.post('/requirements', h((req) => svc.saveRequirement(req.body)));
r.put('/requirements/:id', h((req) => svc.saveRequirement(req.body, id(req))));
r.post('/requirements/:id/status', h((req) => svc.setRequirementStatus(id(req), req.body.status)));
r.delete('/requirements/:id', h((req) => svc.deleteRequirement(id(req))));
r.get('/wbs', h(() => svc.listWbs()));
r.post('/wbs', h((req) => svc.saveWbs(req.body)));
r.put('/wbs/:id', h((req) => svc.saveWbs(req.body, id(req))));
r.delete('/wbs/:id', h((req) => svc.deleteWbs(id(req))));
r.get('/change-requests', h(() => svc.listChangeRequests()));
r.post('/change-requests', h((req) => svc.saveChangeRequest(req.body)));
r.put('/change-requests/:id', h((req) => svc.saveChangeRequest(req.body, id(req))));
r.delete('/change-requests/:id', h((req) => svc.deleteChangeRequest(id(req))));
r.get('/change-requests/:id/impact', h((req) => svc.previewChangeImpact(id(req))));
r.post('/change-requests/:id/approve', h(async (req) => ({ taskCode: await svc.approveChangeRequest(id(req), req.body.decidedBy, req.body.notes) })));
r.post('/change-requests/:id/reject', h((req) => svc.rejectChangeRequest(id(req), req.body.decidedBy, req.body.notes)));

// module 3
r.get('/schedule', h(() => svc.scheduleAnalysis()));
r.post('/tasks', h((req) => svc.saveTask(req.body)));
r.put('/tasks/:id', h((req) => svc.saveTask(req.body, id(req))));
r.delete('/tasks/:id', h((req) => svc.deleteTask(id(req))));
r.put('/tasks/:id/dependencies', h((req) => svc.setDependencies(id(req), req.body.preds)));
r.put('/tasks/:id/progress', h((req) => svc.updateProgress(id(req), req.body)));
r.get('/estimate', h(async (req) => ({ cost: await svc.estimateCost(req.query.assigneeId, req.query.duration) })));

// module 4
r.get('/evm', h(() => svc.evmAnalysis()));
r.get('/tasks/costs', h(() => svc.listTasks()));
r.get('/expenses', h(() => svc.listExpenses()));
r.post('/expenses', h((req) => svc.addExpense(req.body)));
r.delete('/expenses/:id', h((req) => svc.deleteExpense(id(req))));

// module 5
r.get('/defects', h(() => svc.listDefects()));
r.post('/defects', h((req) => svc.saveDefect(req.body)));
r.put('/defects/:id', h((req) => svc.saveDefect(req.body, id(req))));
r.delete('/defects/:id', h((req) => svc.deleteDefect(id(req))));
r.get('/checks', h(() => svc.listChecks()));
r.post('/checks', h((req) => svc.saveCheck(req.body)));
r.put('/checks/:id', h((req) => svc.saveCheck(req.body, id(req))));
r.post('/checks/:id/result', h((req) => svc.recordCheckResult(id(req), req.body)));
r.delete('/checks/:id', h((req) => svc.deleteCheck(id(req))));
r.get('/risks', h(() => svc.listRisks()));
r.post('/risks', h((req) => svc.saveRisk(req.body)));
r.put('/risks/:id', h((req) => svc.saveRisk(req.body, id(req))));
r.delete('/risks/:id', h((req) => svc.deleteRisk(id(req))));
r.get('/countermeasures', h(() => svc.listCountermeasures()));
r.post('/countermeasures', h((req) => svc.saveCountermeasure(req.body)));
r.put('/countermeasures/:id', h((req) => svc.saveCountermeasure(req.body, id(req))));
r.delete('/countermeasures/:id', h((req) => svc.deleteCountermeasure(id(req))));
r.get('/pdpc', h(() => svc.pdpcTree()));

export default r;
