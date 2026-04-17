# Internal Backlog

This backlog is organized by product area with clear outcomes and concrete work items.

---

## 1) Cost Reporting and Analysis

### Goal
Make the Cost Financial Report easier to explore and more useful for decision-making.

### Work items
- Improve report table interactions:
  - Allow users to isolate a column value (quick filter from cell/column).
  - Allow drill-down from aggregate values to underlying records.
- Expand "Spend by Category":
  - Support additional classification levels/subcategories.
  - Ensure categories are consistent with existing cost taxonomy.
- Add non-time-based analysis views:
  - Introduce a report mode where the X-axis is a category dimension (not time).
  - Examples: spend by team, spend by environment, spend by vendor.

---

## 2) UX and Dashboard Personalization

### Goal
Improve daily usability and make key screens adaptable to user preferences.

### Work items
- Landing page personalization:
  - Let users customize visible widgets/sections.
  - Save and load personalization from the user's current settings/profile.
- Service list customization:
  - Increase configurability of columns and default sorting/filtering.
  - Persist per-user list preferences.
- Harmonize Edit and Read views (Service and Laptop):
  - Align layout and information hierarchy between Read and Edit modes.
  - Reduce visual jumps when switching modes.
  - Keep field placement consistent so users do not need to re-orient.

---

## 3) Navigation, Linking, and User-Centric Views

### Goal
Enable seamless cross-navigation between related entities through contextual links.

### Work items
- Create a dedicated User page:
  - Structure similar to Service page with tabbed sections.
  - Include "Owned services" and "Assigned services" tabs.
- Strengthen entity linking across the app:
  - In Service list/read views, `Owner` should link to the corresponding User page.
  - In Service views, related service references should link to that service's read view.
- Improve navigability:
  - Prioritize clickable relationships across list and detail pages.
  - Support quick cyclical navigation between users, services, and assigned assets.

---

## Notes

- Main effort is UX/navigation polish; core data appears mostly available.
- Prefer iterative delivery by area (reporting -> dashboard -> navigation) to keep scope manageable.

