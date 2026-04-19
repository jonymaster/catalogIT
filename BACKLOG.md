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

## 4) Data Validation and Guardrails

### Goal
Prevent invalid or extreme inputs from entering the system while keeping data-entry UX clear and predictable.

### Work items
- Introduce phased validation rules across the stack:
  - Start with UI-level validation for immediate feedback on create/edit forms.
  - Mark critical fields as required based on entity type.
  - Enforce numeric/date constraints (e.g., non-negative amounts, allowed min/max ranges).
  - Expand and mirror the same rules at API level to guarantee server-side data integrity.

---

## 5) Relationship Graph and Blast Radius Intelligence

### Goal
Turn CatalogIT into a living map of how services, people, hardware, vendors, contracts, and identities depend on one another.

### Work items
- Build a graph view across core entities:
  - Render relationships between services, owners, assignees, laptops, vendors, contracts, cost centers, and future identity sources.
  - Let users pivot from any node into an interactive relationship canvas instead of a flat detail page.
- Add blast-radius and path analysis:
  - Answer questions like "If this service fails, who is affected?" and "Which systems depend on this vendor or identity provider?"
  - Highlight single points of failure, high-centrality services, and orphaned critical nodes.
- Introduce dependency modeling:
  - Support explicit service-to-service, service-to-vendor, and service-to-auth-provider edges.
  - Track edge confidence/source so users can distinguish imported facts from manual assumptions.
- Surface relationship health signals:
  - Flag missing owners, missing backup owners, broken dependency chains, and concentration risk around one person, team, or vendor.

---

## 6) Identity, Access, and License Governance

### Goal
Make CatalogIT the place where IT can understand who has access to what, whether that access is still justified, and how much waste sits in unused entitlements.

### Work items
- Bring identity and entitlement data into the catalog:
  - Add connectors for Okta, Microsoft Entra, Google Workspace, GitHub, and major SaaS admin APIs.
  - Model direct assignments, group-based access, admin roles, and service-specific entitlements.
- Reconcile seats, users, and spend:
  - Compare billed seats, provisioned accounts, active users, and CatalogIT assignments.
  - Detect shelfware, zombie accounts, overprovisioned plans, and duplicate tool overlap across teams.
- Add access review and offboarding workflows:
  - Run periodic certification campaigns for app owners and managers.
  - Show offboarding completeness across SaaS, hardware, and tokens from a single person-centric view.
- Expose high-risk access paths:
  - Highlight privileged access, toxic combinations, contractor exposure, and accounts connected to critical systems without clear ownership.

---

## 7) Autonomous Discovery and Data Federation

### Goal
Reduce manual data entry by continuously discovering services, assets, costs, and relationships from the systems companies already use.

### Work items
- Build a connector and ingestion platform:
  - Ingest data from finance/ERP tools, cloud billing exports, MDM systems, identity providers, procurement tools, and email-based invoice sources.
  - Support scheduled syncs, webhook-driven updates, and human review queues for uncertain matches.
- Add shadow IT and drift detection:
  - Detect newly purchased tools, unmanaged vendors, and untracked production services before they become invisible spend.
  - Flag when imported ownership, status, or renewal data drifts from what is recorded in CatalogIT.
- Introduce entity resolution and deduplication:
  - Merge records across different source systems into one canonical service, vendor, or user identity.
  - Preserve provenance so every field can be traced back to a source of truth.
- Expand import confidence tooling:
  - Let operators review suggested merges, inferred dependencies, and low-confidence matches in a dedicated triage workspace.

---

## 8) Vendor, Contract, and Procurement Command Center

### Goal
Move beyond passive record-keeping and give teams a system for managing renewals, negotiating vendors, and reducing external dependency risk.

### Work items
- Create a renewal workspace:
  - Combine contract dates, spend history, service owners, usage signals, and renewal reminders in one negotiation cockpit.
  - Track negotiation status, target savings, fallback options, and decision deadlines.
- Add contract intelligence:
  - Extract notice periods, auto-renew terms, liability clauses, data residency terms, and price escalators from uploaded documents.
  - Make contract obligations queryable and visible on service and vendor records.
- Introduce vendor portfolio analysis:
  - Show total spend, service count, criticality, and concentration risk per vendor across the company.
  - Highlight consolidation opportunities where multiple tools solve the same job.
- Support intake and procurement lifecycle:
  - Capture business case, security review, legal review, procurement status, and implementation owner from request through go-live.

---

## 9) Workflow Automation and Policy Engine

### Goal
Turn CatalogIT into an operational system that does work, not just one that stores records.

### Work items
- Add no-code automation building blocks:
  - Trigger workflows from renewals, ownership gaps, contract milestones, access review deadlines, and status changes.
  - Route approvals and tasks to Slack, email, webhooks, and future ticketing integrations.
- Build policy-as-data guardrails:
  - Define policies such as "critical services require two owners", "every paid service needs a cost center", or "production tools need a recovery plan".
  - Continuously evaluate policies and surface violations in dashboards and entity pages.
- Introduce lifecycle playbooks:
  - Standardize onboarding, software requests, service adoption, deprecation, vendor offboarding, and employee offboarding.
  - Keep every workflow tied to the underlying catalog entities and audit trail.
- Add internal service request flows:
  - Let employees request software, hardware, or access from the catalog itself with approval chains and fulfillment states.

---

## 10) Risk, Resilience, and Compliance Intelligence

### Goal
Help organizations understand operational risk, prepare for incidents, and prove controls using the same data model that powers inventory and access.

### Work items
- Add incident and outage readiness views:
  - For any service, show owners, dependents, backup systems, critical users, vendor contacts, and recent changes in one screen.
  - Provide an incident mode that optimizes for fast impact assessment and communication.
- Model resilience and continuity posture:
  - Track recovery expectations, alternate vendors, region dependence, and business criticality tiers.
  - Surface continuity gaps such as no fallback vendor, no backup owner, or concentrated hardware/location exposure.
- Build compliance evidence paths:
  - Map services and assets to control frameworks, review cadences, and evidence artifacts.
  - Reuse audit logs, attachments, approvals, and policy checks as living evidence instead of one-off spreadsheets.
- Add risk scoring:
  - Combine spend, criticality, access exposure, vendor concentration, and data completeness into a risk score with explainable drivers.

---

## 11) AI Copilot and Scenario Planning

### Goal
Give IT, finance, and security teams a fast way to ask complex questions, explore what-if scenarios, and act on recommendations grounded in the catalog.

### Work items
- Add natural-language exploration:
  - Support questions like "Which contractors still have access to critical services?", "What renewals can we renegotiate this quarter?", or "Which laptops and SaaS tools belong to this department?"
  - Return answers with linked evidence, not just generated prose.
- Introduce AI-assisted catalog hygiene:
  - Suggest missing owners, duplicate vendors, stale services, inferred dependencies, and classification mismatches.
  - Generate cleanup queues with confidence scores and human approval steps.
- Build scenario planning tools:
  - Simulate layoffs, M&A integrations, region exits, vendor consolidation, or an identity-provider outage to estimate cost, ownership, and operational impact.
  - Let teams compare future-state options before they commit to changes.
- Generate executive briefings:
  - Summarize renewal risk, shadow IT growth, access exposure, spend trends, and continuity posture for leadership on a recurring basis.

---

## Notes

- Near-term work can still focus on UX, reporting, and navigation polish, but the larger opportunity is to evolve CatalogIT into an IT operating system.
- The highest-leverage expansion path is: relationship graph -> identity/access governance -> discovery/connectors -> workflow automation -> AI/scenario planning.
- The biggest differentiator is combining CMDB, ITAM, SaaS governance, procurement, FinOps, and operational risk in one connected model rather than splitting them across separate tools.
