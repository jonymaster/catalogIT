# Navigation And User Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated user page and make relationship navigation consistent across services, users, and assets.

**Architecture:** Introduce a read-only user detail API safe for any authenticated user, then build a tabbed frontend route modeled after service detail pages. Inline user links must coexist with existing row-click tables.

**Tech Stack:** FastAPI, SQLAlchemy, React Router, React 19, TypeScript

---

### Task 1: Add a viewer-safe user detail payload

**Files:**
- Create: `backend/app/schemas/user_profile.py`
- Modify: `backend/app/routers/user_directory.py`
- Modify: `backend/app/main.py`

- [ ] Add an endpoint that returns the user plus owned services, assigned services, and assigned laptops.
- [ ] Keep admin CRUD endpoints separate.
- [ ] Verify with: `uv run python -m unittest discover -s tests`

### Task 2: Add the user detail route shell

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/UserDetail.tsx`
- Create: `frontend/src/pages/UserOverview.tsx`
- Create: `frontend/src/pages/UserOwnedServices.tsx`
- Create: `frontend/src/pages/UserAssignedResources.tsx`
- Create: `frontend/src/types/userProfile.ts`

- [ ] Create a tabbed user page with Overview, Owned services, and Assigned resources sections.
- [ ] Keep the page visually consistent with the existing service detail shell.
- [ ] Verify with: `npm run build`

### Task 3: Link owners and assignees throughout the app

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`
- Modify: `frontend/src/pages/Services.tsx`
- Modify: `frontend/src/pages/ServiceOverview.tsx`
- Modify: `frontend/src/pages/ServiceAssignments.tsx`
- Modify: `frontend/src/pages/Hardware.tsx`
- Modify: `frontend/src/pages/LaptopDetail.tsx`

- [ ] Convert plain-text owner/assignee references into links to the new user page.
- [ ] Ensure inline links do not trigger row-level navigation accidentally.
- [ ] Verify with: `npm run build`

### Task 4: Tighten cyclical navigation

**Files:**
- Modify: `frontend/src/pages/UserOwnedServices.tsx`
- Modify: `frontend/src/pages/UserAssignedResources.tsx`
- Modify: any created user detail components as needed

- [ ] Make owned services link to service read views.
- [ ] Make assigned laptops link to laptop read views.
- [ ] Keep the user page useful as the “hub” between people, services, and assets.
- [ ] Verify with: `npm run build`

### Task 5: Final verification

**Files:**
- No planned source changes

- [ ] Run: `uv run python -m unittest discover -s tests`
- [ ] Run: `npm run build`
