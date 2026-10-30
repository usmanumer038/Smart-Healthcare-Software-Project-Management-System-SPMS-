# Test cases - Smart Healthcare SPMS (MERN)

Automated run: 38/38 passed (2026-10-27 04:16). Re-run with `npm test`.

| ID | Test case | Expected result | Actual result | Status |
|---|---|---|---|---|
| TC01 | CPM forward pass: A(3d)->B(2d) from 2026-01-01; B finishes | "2026-01-05" | "2026-01-05" | PASS |
| TC02 | Critical path and float (A,B critical; C float 1 day) | [true,true,false,1] | [true,true,false,1] | PASS |
| TC03 | Circular dependency A->B while B->A exists is rejected | ValidationError (rejected) | ValidationError: These dependencies would create a cycle (circular dependency). | PASS |
| TC04 | Activity depending on itself is rejected | ValidationError (rejected) | ValidationError: An activity cannot depend on itself. | PASS |
| TC05 | T12 at 25% of 14 days on 2026-10-26 -> forecast finish / delay | ["2026-11-05",13] | ["2026-11-05",13] | PASS |
| TC06 | T12 delay propagates to dependants and the final deadline | [true,13] | [true,13] | PASS |
| TC07 | EVM at status date: PV, EV, AC, CPI, SPI | [3884000,3680000,4000000,0.92,0.947] | [3884000,3680000,4000000,0.92,0.947] | PASS |
| TC08 | CPI/SPI warnings at 0.95 threshold; OK after lowering to 0.90 | [["WARNING","WARNING"],["OK","OK"]] | [["WARNING","WARNING"],["OK","OK"]] | PASS |
| TC09 | Large overspend -> CPI critical and EAC > approved budget alert | ["CRITICAL",true] | ["CRITICAL",true] | PASS |
| TC10 | Planned % at day 5 of a 10-day activity | 0.5 | 0.5 | PASS |
| TC11 | WBS element linked to unapproved requirement R08 is rejected | ValidationError (rejected) | ValidationError: R08 is 'Proposed'. Only approved requirements can be included in the approved sc | PASS |
| TC12 | CR-sourced requirement cannot be approved directly | ValidationError (rejected) | ValidationError: R10 came from a change request; approve or reject the change request instead (ch | PASS |
| TC13 | Approve CR-002: budget +350k, deadline +9d, BAC +350k, finish +9d, req approved, T14 depends on new activity | [350000,9,350000,9,"Approved",true] | [350000,9,350000,9,"Approved",true] | PASS |
| TC14 | Approving an already-approved CR is rejected | ValidationError (rejected) | ValidationError: CR-001 is already Approved. | PASS |
| TC15 | Rejecting CR-002 leaves budget unchanged and rejects its requirement | [5450000,"Rejected"] | [5450000,"Rejected"] | PASS |
| TC16 | Approved requirement in WBS cannot be rejected without a CR | ValidationError (rejected) | ValidationError: R01 is part of the approved scope baseline and linked to 1 WBS element(s). Raise | PASS |
| TC17 | Impact preview forecast finish equals actual result after approval | "2026-12-26" | "2026-12-26" | PASS |
| TC18 | 100% complete without actual finish date | ValidationError (rejected) | ValidationError: Enter the actual finish date for a 100% complete activity. | PASS |
| TC19 | Actual start after status date | ValidationError (rejected) | ValidationError: Actual start (2026-01-20) cannot be after the status date (2026-01-10). | PASS |
| TC20 | Successor B started before predecessor A finished | ValidationError (rejected) | ValidationError: Predecessor T01 must finish before T02 starts (finish-to-start dependency). | PASS |
| TC21 | Invalid date format in charter | ValidationError (rejected) | ValidationError: Start date '2026-13-45' is not a valid date (use YYYY-MM-DD). | PASS |
| TC22 | Deadline before start date | ValidationError (rejected) | ValidationError: Deadline must be after the start date. | PASS |
| TC23 | Non-numeric activity cost | ValidationError (rejected) | ValidationError: Estimated cost (PKR) must be a number. | PASS |
| TC24 | Expense booked on an activity that has not started | ValidationError (rejected) | ValidationError: T01 has not started by 2026-01-05; costs can only be booked against started work | PASS |
| TC25 | Deleting a team member assigned to activities | ValidationError (rejected) | ValidationError: This member is assigned to activities, defects or risks. Reassign them first. | PASS |
| TC26 | Resolved defect without resolved date | ValidationError (rejected) | ValidationError: Enter the resolved date for a resolved/closed defect. | PASS |
| TC27 | Failed quality check automatically raises a linked defect | [8,true] | [8,true] | PASS |
| TC28 | Prioritization: equal score 20 -> higher impact first; levels | [["B",20,"High"],["A",20,"High"],["C",4,"Low"]] | [["B",20,"High"],["A",20,"High"],["C",4,"Low"]] | PASS |
| TC29 | Risk likelihood 7 (outside 1-5) | ValidationError (rejected) | ValidationError: Likelihood must be at most 5. | PASS |
| TC30 | PDPC contains every open risk with countermeasures | [8,true] | [8,true] | PASS |
| TC31 | Closing project with open activities / critical defects / pending CRs | ValidationError (rejected) | ValidationError: Project cannot be closed: | PASS |
| TC32 | Complete project closes; afterwards records are read-only | ["Closed",true] | ["Closed",true] | PASS |
| TC33 | Data persists in MongoDB after reconnecting (activities, CRs, defects) | [18,3,7] | [18,3,7] | PASS |
| TC34 | Consistency check flags approved requirement not covered by the WBS | true | true | PASS |
| TC35 | Dashboard counts (delayed, pending CRs, critical defects) and report generated | [5,1,2,true] | [5,1,2,true] | PASS |
| TC36 | GET /api/dashboard returns 200 with CPI/SPI | [200,"0.920","0.947"] | [200,"0.920","0.947"] | PASS |
| TC37 | POST /api/risks with invalid likelihood returns HTTP 400 + message | [400,true] | [400,true] | PASS |
| TC38 | POST /api/change-requests/:id/approve creates activity and updates baseline | [200,"T19",5800000,"2026-12-13"] | [200,"T19",5800000,"2026-12-13"] | PASS |
