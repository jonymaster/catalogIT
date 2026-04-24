# Backlog Finish Design

> Autonomous design artifact for completing `BACKLOG.md` without a review pause. The implementation assumes the user pre-approved reasonable design decisions and decomposition.

## Goal

Deliver the full backlog in four isolated workstreams, then merge them into one verified integration branch and PR.

## Constraints

- All development happens in isolated git worktrees.
- Closely related features share a worktree.
- The repo already has passing backend unit tests via `python -m unittest`, a passing frontend production build, and pre-existing frontend lint failures unrelated to this backlog.
- Avoid broad schema invention unless the backlog clearly requires it.

## Workstream Split

### 1. Reporting

Scope:
- Improve the IT Financial Report interactions.
- Add drill-down from aggregates to detail rows.
- Expand category analysis with deeper breakdowns using the existing taxonomy data already exposed on records.
- Add non-time report modes where the X-axis is a category dimension such as category, cost center, classification, vendor, or source.

Primary files:
- `frontend/src/pages/CostsReport.tsx`
- `frontend/src/types/dashboardCost.ts`
- `frontend/src/utils/dashboardCostAggregates.ts`
- `backend/app/routers/dashboard.py`

Key design choice:
- Reuse the current dashboard payload and extend it with additional dimensions rather than introducing a new reporting subsystem.

### 2. Personalization

Scope:
- Let users hide/show dashboard widgets.
- Persist dashboard and service-list preferences per user.
- Load/save these preferences through the existing `/api/me/preferences` profile flow.
- Harmonize Service and Laptop read/edit layouts so the mode switch does not force re-orientation.

Primary files:
- `backend/app/models/user.py`
- `backend/app/schemas/user.py`
- `backend/app/routers/me.py`
- `backend/alembic/versions/041_add_user_ui_preferences.py`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Services.tsx`
- `frontend/src/hooks/useColumnPrefs.ts`
- `frontend/src/pages/PersonalSettings.tsx`

Key design choice:
- Store UI preferences in a single JSON user-profile field instead of scattering new per-feature columns.

### 3. Navigation

Scope:
- Add a dedicated user detail page with tabs.
- Surface owned services, assigned services, and assigned laptops/assets.
- Make owner and assignee references clickable across service and hardware screens.
- Preserve row-click behavior while allowing inline links.

Primary files:
- `frontend/src/App.tsx`
- `frontend/src/components/DataTable.tsx`
- `frontend/src/pages/Services.tsx`
- `frontend/src/pages/ServiceOverview.tsx`
- `frontend/src/pages/ServiceAssignments.tsx`
- `frontend/src/pages/Hardware.tsx`
- `frontend/src/pages/LaptopDetail.tsx`
- new `frontend/src/pages/UserDetail*.tsx`
- `backend/app/routers/user_directory.py` or a new viewer-safe router
- new `backend/app/schemas/user_profile.py`
- `backend/app/main.py`

Key design choice:
- Add a viewer-safe read-only user detail API instead of reusing the admin CRUD user endpoints.
- Because the repo has no explicit service-to-service relation model, “related links” are implemented through existing ownership, assignment, and asset relationships rather than inventing a new domain concept in this pass.

### 4. Validation

Scope:
- Add clearer UI validation messages on create/edit forms.
- Mirror the same rules at API level.
- Normalize required-field and numeric/date constraints for services, laptops, and cost records.

Primary files:
- `frontend/src/components/ServiceForm.tsx`
- `frontend/src/components/LaptopForm.tsx`
- `frontend/src/components/CostRecordForm.tsx`
- optional `frontend/src/utils/validation.ts`
- `backend/app/schemas/service.py`
- `backend/app/schemas/laptop.py`
- `backend/app/schemas/cost_record.py`
- `backend/app/routers/services.py`
- `backend/app/routers/laptops.py`
- `backend/app/routers/cost_records.py`

Key design choice:
- Treat “critical required fields” conservatively: enforce the fields the current UX already depends on, plus obvious integrity rules like non-empty names, valid enum-like values, non-negative amounts, and bounded years.

## Cross-Workstream Rules

- Reporting does not own dashboard widget personalization.
- Personalization owns user preference persistence.
- Navigation owns user-detail routes and inline relationship links.
- Validation owns form/API guardrails but should not redesign page structure outside what is required for error display.

## Integration Strategy

1. Implement each workstream in its own worktree branch.
2. Verify each branch locally.
3. Merge all four branches into `backlog/integration`.
4. Re-run backend tests and frontend build on the integrated result.
5. Run frontend lint on the integrated result and distinguish backlog-caused issues from pre-existing repo issues.

## Verification Baseline Captured Before Work

- Frontend build: `npm run build` from `frontend/` passes.
- Backend unit tests: `uv run python -m unittest discover -s tests` from `backend/` passes (`42` tests).
- Frontend lint: `npm run lint` from `frontend/` fails before backlog work because of existing issues in `ColumnHeaderMenu.tsx`, `SidebarContext.tsx`, `useDashboardCostData.ts`, `Dashboard.tsx`, `Hardware.tsx`, `LaptopDetail.tsx`, `ServiceDetail.tsx`, and `Services.tsx`.
