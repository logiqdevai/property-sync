# Project Progress Tracker

> **For AI coding agents:** Read this file at the start of every session.
> Use the **Current focus** section and feature checklists to decide what
> to implement next. Open the **References** paths for the active feature
> before writing code. Update this file when deliverables are verified.

**Last updated:** YYYY-MM-DD  
**Overall progress:** 0% (0 / N features complete)  
**Current focus:** Feature 01 — `<feature name>` → `tasks/feature-01-.../<next-task>.md`

---

## Session start checklist

- [ ] Read this file (`PROGRESS.md`)
- [ ] Read direction docs listed under **Current focus** feature
- [ ] Open the next incomplete task file in that feature group
- [ ] Implement until acceptance criteria pass
- [ ] Update checklists and percentages below
- [ ] Set **Current focus** to the next incomplete item

---

## Feature index

| # | Feature | Status | Progress | Task files |
|---|---------|--------|----------|------------|
| 01 | Example: Authentication | not started | 0% | 1–2 files |
| 02 | Example: Leads CRUD | not started | 0% | 1–3 files |
| … | … | … | … | … |

---

## Feature 01: Authentication

**Description:** Users can register, sign in, and access protected routes.

**Status:** not started  
**Progress:** 0%

### References (read before implementing)

| Doc | Path |
|-----|------|
| Product spec | `directions/01-product-spec.md` |
| System architecture | `directions/02-system-architecture.md` |
| Domain model | `directions/03-domain-model.md` |
| API design | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-01-auth/01-auth-backend.md` | not started |
| `tasks/feature-01-auth/02-auth-frontend.md` | not started |

### Implementation checklist

- [ ] Database schema / migrations for users (if applicable)
- [ ] Backend: register endpoint
- [ ] Backend: login endpoint + JWT/session
- [ ] Backend: auth guard on protected routes
- [ ] Frontend: sign-up page wired to API
- [ ] Frontend: sign-in page wired to API
- [ ] Frontend: token storage + axios interceptor
- [ ] Frontend: protected route redirect when unauthenticated
- [ ] Smoke test: new user can register, login, and reach a protected page

**Definition of done:** A new user can register, log in, and access at least one protected screen in the running app.

---

## Feature 02: Leads management

**Description:** Authenticated users can create, list, edit, and delete leads.

**Status:** not started  
**Progress:** 0%

### References (read before implementing)

| Doc | Path |
|-----|------|
| Product spec | `directions/01-product-spec.md` |
| Domain model | `directions/03-domain-model.md` |
| API design | `directions/04-api-design.md` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-02-leads/01-leads-api.md` | not started |
| `tasks/feature-02-leads/02-leads-ui-list-create.md` | not started |
| `tasks/feature-02-leads/03-leads-ui-edit-delete.md` | not started |

### Implementation checklist

- [ ] Backend: Lead model + CRUD endpoints
- [ ] Backend: scope leads to account/user
- [ ] Frontend: leads list page with real data
- [ ] Frontend: create lead form
- [ ] Frontend: edit lead
- [ ] Frontend: delete lead
- [ ] Smoke test: full CRUD flow while logged in

**Definition of done:** Logged-in user can perform full lead CRUD from the UI against the live API.

---

## Feature 03: `<name>`

**Description:** …

**Status:** not started  
**Progress:** 0%

### References (read before implementing)

| Doc | Path |
|-----|------|
| … | `directions/…` |

### Task files

| File | Status |
|------|--------|
| `tasks/feature-03-…/….md` | not started |

### Implementation checklist

- [ ] …

**Definition of done:** …

---

## Notes

- Percentages: count checklist items per feature; feature % = completed /
  total. Overall % = completed features / total features (or weighted by
  checklist if preferred — state method here).
- Do not mark planning/direction docs as implementation progress; only
  **features** in this file count toward project completion.
- Copy this template to `docs/plan/PROGRESS.md` when starting a new project
  plan; replace examples with real features from the implementation plan.
