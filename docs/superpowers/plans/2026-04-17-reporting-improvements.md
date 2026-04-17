# Reporting Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the IT Financial Report with richer dimensions, drill-down interactions, and faster filtering.

**Architecture:** Extend the existing `/api/dashboard` payload with the extra dimensions the report needs, then keep aggregation and drill-down logic in the report page and dashboard cost utility layer. Do not create a separate reporting backend.

**Tech Stack:** FastAPI, SQLAlchemy, React 19, TypeScript, Vite

---

### Task 1: Extend report dimensions

**Files:**
- Modify: `backend/app/routers/dashboard.py`
- Modify: `frontend/src/types/dashboardCost.ts`
- Modify: `frontend/src/hooks/useDashboardCostData.ts`

- [ ] Add any missing record dimensions needed for non-time grouping, especially vendor and a stable display label for grouped analysis.
- [ ] Keep the response backward-compatible for existing dashboard consumers.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 2: Add reusable grouping helpers

**Files:**
- Modify: `frontend/src/utils/dashboardCostAggregates.ts`

- [ ] Add helpers that group cost records by a selected dimension and optional secondary breakdown.
- [ ] Keep time-based aggregations intact.
- [ ] Verify with: `npm run build`

### Task 3: Add report-mode and drill-down state

**Files:**
- Modify: `frontend/src/pages/CostsReport.tsx`

- [ ] Introduce a report mode switch between time-axis analysis and dimension-axis analysis.
- [ ] Add state for active drill-down so aggregate clicks narrow the detail table to the underlying records.
- [ ] Verify with: `npm run build`

### Task 4: Add quick filter interactions

**Files:**
- Modify: `frontend/src/pages/CostsReport.tsx`

- [ ] Make filterable cells and aggregate labels actionable for source, category, classification, cost center, vendor, and record type.
- [ ] Ensure inline actions do not feel destructive; provide a visible “clear drill-down / clear quick filters” control.
- [ ] Verify with: `npm run build`

### Task 5: Expand spend-by-category analysis

**Files:**
- Modify: `frontend/src/pages/CostsReport.tsx`
- Modify: `frontend/src/utils/dashboardCostAggregates.ts`

- [ ] Add a secondary breakdown control so spend by category can be viewed through sub-dimensions such as classification, cost center, vendor, or source.
- [ ] Reuse the existing taxonomy fields rather than introducing a hierarchical category schema in this pass.
- [ ] Verify with: `npm run build`

### Task 6: Final verification

**Files:**
- No planned source changes

- [ ] Run: `uv run python -m unittest discover -s tests`
- [ ] Run: `npm run build`
- [ ] Summarize any lint impact relative to the captured baseline before handing off.
