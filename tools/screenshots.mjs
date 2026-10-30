// Captures a screenshot of every module page into screenshots/.
// Usage: start the app (npm start), then:  node tools/screenshots.mjs [baseUrl]
// Requires Playwright (npx playwright install chromium) - optional, not needed to run the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screenshots');
const BASE = process.argv[2] || 'http://localhost:5000';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
const chromium = pw.chromium || pw.default.chromium;

const shots = [
  ['dashboard', null], ['initiation', 'Project charter'], ['initiation', 'Management plan'], ['initiation', 'Status & milestones'],
  ['initiation', 'Team & responsibilities'], ['initiation', 'Project closure'], ['initiation', 'Baseline & audit log'],
  ['scope', 'Requirements'], ['scope', 'Work Breakdown Structure'], ['scope', 'Change requests'],
  ['schedule', 'Activities'], ['schedule', 'Delay analysis'], ['schedule', 'Gantt chart'],
  ['cost', 'Earned Value Management'], ['cost', 'Cost estimates & expenditure'],
  ['quality', 'Defect tracking'], ['quality', 'Quality checklist & test results'],
  ['risk', 'Prioritization matrix'], ['risk', 'PDPC — risk response chart'],
];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('dialog', (d) => d.accept());
let n = 1;
const name = (s) => `${String(n++).padStart(2, '0')}_${s.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '')}.png`;
const go = async (key, sub) => {
  await page.goto(`${BASE}/#${key}`);
  await page.reload();
  await page.waitForSelector('.page-head');
  if (sub) await page.getByRole('button', { name: sub, exact: true }).click();
  await page.waitForTimeout(700);
};
for (const [key, sub] of shots) {
  await go(key, sub);
  await page.screenshot({ path: path.join(OUT, name(`${key}_${sub || 'overview'}`)) });
}
// CR-002 approval demo: preview impact -> approve -> after views
await go('scope', 'Change requests');
await page.getByRole('cell', { name: 'CR-002', exact: true }).click();
await page.getByRole('button', { name: 'Preview impact / approve' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, name('CR-002_impact_preview')) });
await page.getByRole('button', { name: 'Approve change request' }).click();
await page.waitForTimeout(900);
for (const [key, sub, label] of [['dashboard', null, 'AFTER_CR-002_dashboard'], ['scope', 'Work Breakdown Structure', 'AFTER_CR-002_WBS'],
  ['scope', 'Change requests', 'AFTER_CR-002_change_requests'], ['schedule', 'Gantt chart', 'AFTER_CR-002_gantt']]) {
  await go(key, sub);
  await page.screenshot({ path: path.join(OUT, name(label)) });
}
await browser.close();
console.log(`Saved ${n - 1} screenshots to ${OUT}`);
