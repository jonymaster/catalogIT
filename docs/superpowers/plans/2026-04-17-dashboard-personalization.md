# Dashboard Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-user dashboard and service-list preferences and align read/edit layouts for daily workflows.

**Architecture:** Add a single JSON preferences field to the user model, expose it through `/api/me/preferences`, then have the frontend read and write dashboard/service-list settings through that existing profile channel.

**Tech Stack:** Alembic, FastAPI, SQLAlchemy, React 19, TypeScript

---

### Task 1: Add user UI preferences storage

**Files:**
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/schemas/user.py`
- Modify: `backend/app/routers/me.py`
- Create: `backend/alembic/versions/041_add_user_ui_preferences.py`

- [ ] Add one JSON-backed field for UI preferences.
- [ ] Extend `UserPreferencesRead` and `UserPreferencesUpdate` to include dashboard and service-list prefs.
- [ ] Keep existing locale/timezone/theme behavior unchanged.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 2: Load and save dashboard personalization

**Files:**
- Modify: `frontend/src/types/models.ts`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

- [ ] Add a widget visibility model and apply it to the dashboard sections.
- [ ] Provide an in-page customization affordance that saves through `/api/me/preferences`.
- [ ] Verify with: `npm run build`

### Task 3: Persist service-list preferences per user

**Files:**
- Modify: `frontend/src/pages/Services.tsx`
- Modify: `frontend/src/hooks/useColumnPrefs.ts`
- Modify: `frontend/src/pages/PersonalSettings.tsx`

- [ ] Move service-list column visibility, sorting, and filters off pure localStorage and into the user preference payload, while preserving local fallback if the profile is unavailable.
- [ ] Ensure the list initializes from saved preferences on load.
- [ ] Verify with: `npm run build`

### Task 4: Harmonize Service read/edit views

**Files:**
- Modify: `frontend/src/pages/ServiceDetail.tsx`
- Modify: `frontend/src/pages/ServiceEdit.tsx`
- Modify: `frontend/src/components/ServiceForm.tsx`
- Modify: `frontend/src/pages/ServiceOverview.tsx`

- [ ] Make the edit shell mirror the same section order and visual hierarchy used by the read view.
- [ ] Keep the archive/unarchive affordance accessible.
- [ ] Verify with: `npm run build`

### Task 5: Harmonize Laptop read/edit views

**Files:**
- Modify: `frontend/src/pages/LaptopDetail.tsx`
- Modify: `frontend/src/pages/LaptopEdit.tsx`
- Modify: `frontend/src/components/LaptopForm.tsx`

- [ ] Align header treatment, field grouping, and section rhythm between Laptop read and edit modes.
- [ ] Avoid changing entity semantics while reducing mode-switch visual jumps.
- [ ] Verify with: `npm run build`

### Task 6: Final verification

**Files:**
- No planned source changes

- [ ] Run: `uv run python -m unittest discover -s tests`
- [ ] Run: `npm run build`
- [ ] Record whether any lint changes were introduced beyond the pre-existing baseline.
