# Clarified Requirement Packet — Admin Google Calendar Integration

- Requestor: PabloJVelez (Owner)
- Decision Maker: PabloJVelez (Owner)
- Date: 2026-04-23
- Mode: Task Clarification
- Status: Complete
- Related Task Hub: `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/`
- Notes: Session started with inferred context due empty invocation input.

## Task Overview

### Context
- **Task name/slug:** `2026-04-23_admin-google-calendar-integration`
- **Business context:** Add Google Calendar integration so app events sync to the chef's connected Google account calendar.
- **Stakeholders:** PabloJVelez (requestor, decision maker).
- **Prior work:** 
  - `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/AGENTS.md`
  - `.devagent/workspace/tasks/active/2026-04-23_admin-google-calendar-integration/research/2026-04-23_google-calendar-integration-mvp.md`
  - `/Users/pablo/Downloads/deep-research-report (1).md`

### Clarification Sessions
- Session 1: 2026-04-23 — Started interactive clarification from inferred context.
- Session 2: 2026-04-23 — Completed requirements decisions and finalized planning inputs.

## Clarified Requirements

### Scope & End Goal

**What needs to be done?**
- Implement Google Calendar integration for one chef/admin account only.

**What's the end goal architecture or state?**
- Medusa admin-side integration with connect flow, sync pipeline, and verification paths.
- MVP sync direction is linked-event bidirectional: app-linked events can sync from app to Google and from Google back to app.

**In-scope (must-have):**
- Single connected Google account support.
- Chef event synchronization with linked-event bidirectional behavior.
- Explicit timezone support in schema before sync launch.

**Out-of-scope (won't-have):**
- Multi-admin or multi-chef account routing in MVP.
- Full Google-native event import that is not linked from app records.

**Nice-to-have (could be deferred):**
- Full bidirectional sync behavior if not required for initial release.

### Technical Constraints & Requirements
- Must follow existing Medusa + TypeScript patterns and current admin integration style.
- Must preserve existing app behavior when no Google account is connected.
- OAuth scope choice for MVP is `calendar.events`.
- Google sync should be silent (no attendee notification side-effects) in MVP.

### Dependencies & Blockers
- OAuth consent configuration and production scope approval.
- [Resolved] Conflict resolution behavior: last-write-wins by timestamp.
- Research baseline adoption is deferred to planning discussion (`create-plan`).

### Implementation Approach
- Mirror existing Stripe Connect widget and admin route patterns.

### Acceptance Criteria & Verification
- Linked-event bidirectional sync supports app and Google updates for all mapped editable fields.
- App lifecycle triggers for Google updates include create, update, cancel, and completion status updates.
- Sync writes are silent (`sendUpdates=none`) in MVP.
- Conflict resolution follows last-write-wins by timestamp.
- App cancellation maps to Google event `status=cancelled` (history preserved).
- MVP done threshold is manual QA checklist only.

## Assumptions Log

| Assumption | Owner | Validation Required | Validation Method | Due Date | Status |
| --- | --- | --- | --- | --- | --- |
| MVP is single-chef/single-admin account only | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| Task should proceed from existing research packet recommendations | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Pending |
| Clarification scope is full task validation (not gap-fill only) | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| MVP sync direction is linked-event bidirectional for app-linked events | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| OAuth scope for MVP is `calendar.events` | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| Explicit timezone support is required before sync launch | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| Google-to-app sync supports all mapped editable fields for linked events | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| App lifecycle triggers include create, update, cancel, and completion status changes | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| Google sync is silent (`sendUpdates=none`) in MVP | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| Conflict policy for overlapping app/Google edits is last-write-wins | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| App cancellation should map to Google `status=cancelled` | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |
| MVP verification threshold is manual QA checklist only | PabloJVelez | Yes | Clarification session confirmation | 2026-04-23 | Validated |

## Gaps Requiring Research

### For #ResearchAgent
- No additional research gaps identified yet beyond existing research packet; pending clarification outcomes.

## Clarification Session Log

### Session 1: 2026-04-23
**Participants:** PabloJVelez (Owner)

**Questions Asked:**
1. For MVP behavior, what should sync direction be? → **B. Linked-event bidirectional** (PabloJVelez)
2. Which OAuth scope policy do you want for MVP? → **B. `calendar.events`** (PabloJVelez)
3. Should timezone be treated as required schema work in MVP? → **A. Yes, required** (PabloJVelez)
4. Which Google-side edits should write back into app events? → **D. Any editable mapped field** (PabloJVelez)
5. Which app lifecycle events trigger Google updates in MVP? → **C. Create + update + cancel + completion status updates** (PabloJVelez)
6. How should outbound Google notifications be handled? → **A. Silent sync only** (PabloJVelez)
7. Conflict policy for overlapping app/Google edits? → **D. Last-write-wins** (PabloJVelez)
8. On app cancellation, how should Google be handled? → **A. Set `status=cancelled`** (PabloJVelez)
9. MVP done threshold? → **A. Manual QA checklist only** (PabloJVelez)
10. Treat existing research packet as accepted baseline for planning? → **D. Defer to planning** (PabloJVelez)
11. Clarification scope mode? → **A. Full task clarification** (PabloJVelez)

**Unresolved Items:**
- [⏭️ deferred] Decide in `create-plan` how strongly to bind to research packet recommendations vs clarification decisions.

## Next Steps

### Spec Readiness Assessment
**Status:** ⬜ Ready for Spec | ⬜ Research Needed | ✅ More Clarification Needed

**Rationale:**
- More clarification needed before plan creation.

### Recommended Actions
- Run `devagent create-plan` using this clarification packet as primary requirements source.
- In planning, explicitly resolve the deferred baseline question for research packet usage.
