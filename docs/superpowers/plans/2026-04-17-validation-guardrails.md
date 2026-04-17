# Validation And Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clearer UI validation and matching API guardrails for services, laptops, and cost records.

**Architecture:** Keep validation close to the existing forms and Pydantic schemas. Tighten router-side foreign-key checks where current behavior would otherwise devolve into integrity errors or silent coercion.

**Tech Stack:** FastAPI, Pydantic v2, React 19, TypeScript

---

### Task 1: Strengthen service validation

**Files:**
- Modify: `frontend/src/components/ServiceForm.tsx`
- Modify: `backend/app/schemas/service.py`
- Modify: `backend/app/routers/services.py`

- [ ] Add explicit client-side errors for blank required fields and invalid derived values.
- [ ] Mirror non-empty names, bounded reminder offsets, allowed billing schedule values, and other conservative integrity rules at the API level.
- [ ] Keep archived-service update rules intact.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 2: Strengthen laptop validation

**Files:**
- Modify: `frontend/src/components/LaptopForm.tsx`
- Modify: `backend/app/schemas/laptop.py`
- Modify: `backend/app/routers/laptops.py`

- [ ] Replace silent coercion of invalid purchase year and cost values with visible validation errors.
- [ ] Add friendly API errors for duplicate serial numbers and invalid assignee/status/location references.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 3: Strengthen cost-record validation

**Files:**
- Modify: `frontend/src/components/CostRecordForm.tsx`
- Modify: `backend/app/schemas/cost_record.py`
- Modify: `backend/app/routers/cost_records.py`
- Modify: `backend/app/routers/laptop_cost_records.py`

- [ ] Enforce `amount >= 0`, bounded `fiscal_year`, allowed `record_type`, and valid payment-method references on the API.
- [ ] Align service cost-record validation with the stricter laptop hardware-cost path.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 4: Add regression coverage

**Files:**
- Modify: `backend/tests/test_cost_record_schema.py`
- Create or modify: service/laptop validation test modules under `backend/tests/`

- [ ] Add tests for the new schema and router-level validation rules.
- [ ] Keep existing test style consistent with the repo’s `unittest` usage.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 5: Final verification

**Files:**
- No planned source changes

- [ ] Run: `uv run python -m unittest discover -s tests`
- [ ] Run: `npm run build`
