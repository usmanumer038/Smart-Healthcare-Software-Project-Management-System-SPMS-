# Smart Healthcare – Software Project Management System (MERN)

CSE-494 Software Project Management – Mid-term (CLO-6).
Full-stack web application: **MongoDB + Express + React + Node.js** for planning, executing, monitoring and controlling the Smart Healthcare project from the case study.

## Run it (Windows)

1. Install **Node.js LTS** (v18.18 or newer) from https://nodejs.org.
2. Double-click **`start.bat`**. It installs packages (first run only), builds the frontend if needed, starts the server and opens **http://localhost:5000**.

Manual way (any OS):

```
npm install
npm start            # http://localhost:5000   (dist/ is already built; run "npm run build" after changing the React code)
```

### MongoDB – no setup required

The server picks the database automatically:

| Situation | What happens |
|---|---|
| `MONGO_URI` environment variable set (Atlas, Docker, remote) | Uses it |
| MongoDB Community Server running locally on port 27017 | Uses `mongodb://127.0.0.1:27017`, database `smart_healthcare_spms` (visible in MongoDB Compass) |
| No MongoDB installed | Starts an **embedded MongoDB** automatically (downloaded once on first run, ~70 MB) and stores data on disk in `data/db/`, so records persist between runs |

On first start with an empty database, the case-study sample data is loaded automatically.

```
set MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net   (Windows, optional)
set PORT=5050                                                (optional, if 5000 is busy)
```

### Other commands

```
npm test             # 38 automated test cases -> TEST_CASES.md (expected vs actual)
npm run seed         # wipe the database and reload the sample data
npm run export-db    # database/schema.json + database/sample_data/*.json
npm run dev:server   # + "npm run dev:client" in a 2nd terminal = hot-reload dev mode on http://localhost:5173
```

Import the sample data into any MongoDB: `mongoimport --db smart_healthcare_spms --collection tasks --jsonArray --file database/sample_data/tasks.json` (one per collection).

## Structure

| Path | Purpose |
|---|---|
| `server/index.js` | Entry point: connect DB, seed if empty, start Express |
| `server/db.js` | MongoDB connection (MONGO_URI → local → embedded) |
| `server/models.js` | Mongoose schemas for 16 collections (required, enum, min/max, unique, date-format constraints) |
| `server/calc.js` | CPM forward/backward pass, critical path, delay forecast & propagation, EVM, risk scoring |
| `server/service.js` | Validation, CRUD, change control, scope control, closure rules, dashboard, HTML report |
| `server/routes.js`, `server/app.js` | REST API (`/api/...`), JSON errors (HTTP 400 for validation) |
| `server/seed.js` | Case-study data: 7-person team, 18 activities, 3 CRs, 7 defects, 8 quality checks, 8 risks |
| `client/src/` | React UI: `pages/` (one per module), `ui.jsx` (tables, forms, modals), SVG charts |
| `tests/spms.test.js` | 38 test cases (service + REST API) |
| `database/` | Schema and sample data export |
| `screenshots/` | Screenshots of every module, incl. before/after CR-002 approval |

## Requirement → implementation map

| Module (marks) | Where in the app |
|---|---|
| 1 Initiation & Integration (4) | **1 · Initiation & Integration**: charter (objectives, stakeholders, scope in/out, approved budget, deadline); management plan (scope/schedule/cost/quality/risk/communication, generated from live data); status + milestones (planned/forecast/actual, automatic status); team responsibilities; closure (blocked until all work done, no critical defects, no pending CRs, all checks passed → project becomes read-only); baseline history + audit log |
| 2 Scope & WBS (4) | **2 · Scope & WBS**: requirements (add/edit/MoSCoW/approve/reject); hierarchical WBS tree with auto codes and rolled-up budget; change requests with justification, cost & schedule impact, status, impact preview; unapproved requirements cannot enter the WBS and activities cannot be created outside approved scope |
| 3 Schedule & Resources (5) | **3 · Schedule & Resources**: activities with assignee, duration, finish-to-start dependencies (cycle detection); CPM schedule (ES/EF/LS/LF/float/critical path); progress; delayed activities and their impact on every dependent activity and the deadline; SVG Gantt chart (baseline vs forecast, dependency arrows, milestones, status date, deadlines) |
| 4 Cost & EVM (5) | **4 · Cost & EVM**: activity cost estimate (duration × daily rate), BAC, expense ledger (actual cost), budgeted cost of work performed; PV, EV, AC, **CPI, SPI**, CV, SV, EAC, ETC, VAC, TCPI; configurable thresholds with automatic WARNING/CRITICAL messages; S-curve |
| 5 Quality & Risk (4) | **5 · Quality**: defect tracking (severity, assignee, status, dates); quality checklist per deliverable with inspection/test results (a failed check auto-raises a defect). **5 · Risk Control**: 5×5 Likelihood × Impact prioritization matrix with ranking; PDPC tree (goal → deliverable → potential problem → preventive/corrective countermeasures, O/X feasibility) |
| 6 Integration & Reporting (3) | One MongoDB database shared by all modules; validation on every API call (server-side) with clear messages; consistency check; dashboard (progress, budget status, CPI/SPI, forecast finish, delayed activities, pending CRs, unresolved critical defects, alerts); HTML status report export |

## How an approved change request affects the project

Approving a CR (**2 · Scope & WBS → Change requests → Preview impact / approve**):
1. **Scope** – its requirement becomes Approved; a WBS deliverable + work package is added.
2. **Schedule** – a new activity (duration = schedule impact) is inserted after the chosen predecessor and before the chosen successor; CPM recalculates every downstream date.
3. **Budget** – approved budget += cost impact; the new activity's budget raises BAC; EVM recomputes.
4. The deadline is extended, recorded in baseline history and the audit log. If any step fails, all steps are undone.

Sample data: CR-001 (AI diagnosis, +PKR 450,000, +12 days) approved; **CR-002 (mobile app, +PKR 350,000, +9 days) pending for the live demo** (together +PKR 800,000 and 3 weeks, as in the case); CR-003 (blockchain) rejected.

## Demo script (≈5 min)

1. **Dashboard** – status date 2026-10-26: 74.2% complete vs 78.3% planned, CPI 0.920 / SPI 0.947 (warnings), forecast 13 days late, 2 critical defects (double booking, record overwrite).
2. **3 · Schedule → Delay analysis** – T12 integration testing (25%) is the root cause; slip shown on T13, T18, T14, T15 and the deadline. Open the **Gantt chart**.
3. **2 · Scope → Change requests** – select CR-002 → *Preview impact / approve* → *Approve*. Budget 5.45M → 5.80M, deadline 2026-12-04 → 12-13, new WBS 1.6 and activity T19 in the Gantt.
4. **Validation** – make T01 depend on T15 (cycle), set 100% without a finish date, enter likelihood 7: each is rejected with a message.
5. **Dashboard → Monitoring settings** – lower the CPI warning threshold to 0.90 and the warning disappears.
6. **5 · Quality → Checklist** – record *Fail* for Q07 (video consultation): a defect is raised automatically. Show the risk matrix and PDPC.
7. **1 · Initiation → Project closure** – shows why closure is blocked. **Export HTML report** (top right).

**Reset demo data** (top right) restores the original sample data at any time.
