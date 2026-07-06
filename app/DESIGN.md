# Property Sync — Design System

**Version:** 1.0  
**Framework alignment:** [Material Design 3](https://m3.material.io/) (Google)  
**Product reference:** [`PROJECT-SPECIFICATIONS.MD`](../docs/PROJECT-SPECIFICATIONS.MD)  
**Implementation:** `src/index.css` (CSS custom properties + HeroUI theme tokens)

---

## 1. Purpose

Property Sync is a **real estate property aggregation and operations platform**. The interface serves two distinct audiences with one cohesive system:

| Audience | Primary jobs |
| -------- | ------------ |
| **Administrators** | Monitor scrapers, crawls, agencies, properties, AI generation runs, integrations, and notifications |
| **Users** | Track agencies, view personal property copies, read change history, manage integration credentials |

The design must communicate **trust, precision, and operational clarity** — not a generic SaaS dashboard. Data density is high; status must be scannable at a glance; property and pipeline metaphors should feel intentional.

---

## 2. Design principles

Aligned with Material Design 3 foundational principles, adapted for Property Sync:

### 2.1 Clarity over decoration

Every surface exists to answer an operational question: *Is this scraper healthy? Did this listing change? Which crawl detected it?* Decorative elements support context (subtle lattice background = data grid / property plots) but never compete with KPIs and timelines.

### 2.2 Status-first hierarchy

Scraper health (`Excellent` → `Broken`), crawl outcomes, and property lifecycle events (`CREATED`, `UPDATED`, `REMOVED`, `REAPPEARED`) drive color and iconography. Semantic status colors are reserved for meaning — never used for branding alone.

### 2.3 Tonal surfaces, not flat gray

Material 3 uses **surface containers** at multiple elevation tones instead of borders alone. Cards, sidebars, and nav bars sit on layered warm neutrals (light) or warm charcoals (dark) so long monitoring sessions remain comfortable.

### 2.4 Motion with purpose

Transitions are short (150–300 ms), ease-out, and limited to: navigation state, drawer/sidebar collapse, theme toggle, and list row hover. No gratuitous animation on data tables or KPI numbers.

### 2.5 Accessible by default

- WCAG 2.1 AA contrast for body text and status chips  
- Focus rings on all interactive elements (`--focus`)  
- Color is never the sole indicator of state (pair with label + icon)  
- Supports `prefers-reduced-motion`

---

## 3. Brand identity

### 3.1 Name & voice

- **Product name:** Property Sync  
- **Tagline (internal):** *Aggregate. Normalize. Track.*  
- **Tone:** Professional, direct, infrastructure-aware. Admin copy is operational; user copy is simpler.

### 3.2 Visual metaphor

**Foundation + listing:** Deep indigo-blue represents the aggregation pipeline (scrapers, crawls, jobs). Warm copper-gold represents individual listings and property value. Sage green represents healthy sync and successful operations.

### 3.3 Logo mark (placeholder)

Until a custom mark ships, use a geometric **sync node** icon (Lucide `Network` or custom SVG): three nodes connected — source agencies → normalized property → user copy.

---

## 4. Color system

Material Design 3 organizes color into **roles**. Property Sync maps MD3 roles to CSS variables in `index.css`.

### 4.1 Core palette

| Role | MD3 name | Token | Light | Dark | Usage |
| ---- | -------- | ----- | ----- | ---- | ----- |
| Primary | `primary` | `--accent` | Deep indigo | Bright periwinkle | Nav active state, primary buttons, links |
| On primary | `on-primary` | `--accent-foreground` | White | Near-white | Text on primary buttons |
| Primary container | `primary-container` | `--accent-bg` | Tinted indigo wash | Tinted indigo wash | Selected nav item, subtle highlights |
| Secondary | `secondary` | `--secondary` | Pipeline sage | Bright sage | Healthy/sync indicators, secondary actions |
| Tertiary | `tertiary` | `--tertiary` | Listing copper | Warm gold | Property KPI accents, listing highlights |
| Surface | `surface` | `--surface` | Warm white | Warm charcoal | Cards, sidebar, navbar |
| Surface dim | `surface-dim` | `--background` | Paper off-white | Deep background | App canvas |
| Surface container | `surface-container-high` | `--surface-secondary` | Elevated white | Elevated charcoal | Hover rows, inset areas |
| Outline | `outline` | `--border` | Warm gray line | Warm gray line | Dividers, card borders |
| On surface | `on-surface` | `--foreground` | Near-black | Near-white | Primary text |
| On surface variant | `on-surface-variant` | `--muted` | Medium gray | Muted gray | Secondary text, labels |

### 4.2 Semantic status colors

Mapped to domain enums in `PROJECT-SPECIFICATIONS.MD`:

| Domain | Values | Token | Color intent |
| ------ | ------ | ----- | ------------ |
| Scraper health | Excellent, Good, Warning, Critical, Broken | `--status-excellent` … `--status-broken` | Green → amber → orange → red progression |
| Crawl run status | Completed, Running, Failed, … | `--status-success`, `--status-info`, `--status-error` | Outcome semantics |
| Property history | CREATED, UPDATED, REMOVED, REAPPEARED | `--history-created`, `--history-updated`, `--history-removed`, `--history-reappeared` | Timeline event dots |
| Notification severity | info, warning, error | `--severity-info`, `--severity-warning`, `--severity-error` | Alert banners |

**Rule:** Status tokens are used only for their semantic meaning. Primary (`--accent`) is never reused as a success or error color.

### 4.3 Light vs dark theme

- **Default:** Dark — operators often run long monitoring sessions; dark reduces glare.  
- **Light:** Available via theme toggle for office/daytime use.  
- Theme is persisted in `localStorage` key `theme` and applied via `data-theme="light|dark"` on `<html>`.

### 4.4 Contrast requirements

| Pair | Minimum ratio |
| ---- | ------------- |
| `--foreground` on `--surface` | 4.5:1 |
| `--muted` on `--surface` | 3:1 (large text / labels only) |
| `--accent-foreground` on `--accent` | 4.5:1 |
| Status chip text on status background | 4.5:1 |

---

## 5. Typography

Material Design 3 type scale, implemented with Google Fonts:

| Role | Font | Token | Usage |
| ---- | ---- | ----- | ----- |
| UI & body | Roboto Flex | `--sans` | All interface text, forms, tables |
| Data & code | Roboto Mono | `--mono` | Crawl payloads, JSON, stack traces, external IDs |
| Display (optional) | Roboto Flex (weight 600–700) | — | Page titles, KPI values |

### 5.1 Type scale

| Name | Size | Weight | Line height | Letter spacing | Usage |
| ---- | ---- | ------ | ----------- | -------------- | ----- |
| Display small | 36px | 600 | 120% | -0.02em | Dashboard greeting |
| Headline small | 24px | 600 | 130% | -0.01em | Section headers |
| Title medium | 16px | 600 | 140% | 0 | Card titles, navbar |
| Title small | 13px | 600 | 140% | -0.005em | Sidebar labels |
| Body medium | 14px | 400 | 145% | 0.01em | Default body |
| Body small | 12px | 400 | 150% | 0.02em | Captions, timestamps |
| Label medium | 12px | 500 | 140% | 0.06em | KPI labels (uppercase) |

### 5.2 Numeric data

KPI values and counts use `--mono` or tabular figures when available. Prices align right in tables. Large numbers use `Headline small` weight 700.

---

## 6. Shape & elevation

### 6.1 Corner radius (MD3 shape scale)

| Token | Value | Usage |
| ----- | ----- | ----- |
| `--radius-xs` | 4px | Chips, badges |
| `--radius-sm` | 8px | Inputs, small buttons |
| `--radius-md` | 12px | Navbar, cards |
| `--radius-lg` | 16px | Sidebar, modals |
| `--radius-xl` | 28px | Auth cards (optional) |

Tailwind mapping: `rounded-lg` = 12px, `rounded-xl` = 16px, `rounded-2xl` = 16px (sidebar).

### 6.2 Elevation

Material 3 elevation is expressed through **surface tone + shadow**, not heavy drop shadows.

| Level | Token | Usage |
| ----- | ----- | ----- |
| 0 | none | Flat tables, inline rows |
| 1 | `--shadow-1` | Navbar, sidebar |
| 2 | `--shadow-2` | Popovers, dropdowns |
| 3 | `--shadow-3` | Modals, drawers |

Shadows use warm black (`oklch` low chroma) with a faint primary ring (`color-mix` with `--accent` at 6–8%).

---

## 7. Layout & navigation

### 7.1 App shell

```
┌─────────────────────────────────────────────────────────┐
│ [Sidebar 220px] │ [Navbar]                              │
│                 ├───────────────────────────────────────│
│  Nav groups     │                                       │
│                 │  Main content (scroll)                │
│                 │                                       │
│  User menu      │                                       │
└─────────────────────────────────────────────────────────┘
```

- **Sidebar:** Collapsible to 64px icon rail on `lg+`. Mobile uses HeroUI Drawer.  
- **Content padding:** 24px (`p-6`).  
- **Max content width:** None for admin tables (full bleed); user property detail may use `max-w-5xl` for readability.

### 7.2 Admin navigation groups

Mirrors `PROJECT-SPECIFICATIONS.MD` §4.2:

| Group | Items |
| ----- | ----- |
| **Overview** | Dashboard |
| **Sources** | Agencies, Scrapers |
| **Pipeline** | Crawl Runs, Generation Runs, Job Queue |
| **Data** | Properties |
| **Platform** | Integration Targets, Notifications, Users |

Use MD3 **navigation rail** pattern: icon + label, active item gets `--accent-bg` fill and `--accent` icon color.

### 7.3 User navigation

| Item | Route purpose |
| ---- | ------------- |
| Dashboard | Summary (future) |
| My Properties | `UserProperty` list |
| Tracked Agencies | `UserTrackedAgency` |
| Integrations | `UserIntegration` connect/manage |

---

## 8. Component patterns

### 8.1 KPI stat card

Used on Dashboard Home (§4.1):

```
┌──────────────────────────┐
│ LABEL (uppercase, muted) │
│ 1,284                    │  ← mono, headline weight
│ +12 today                │  ← optional delta, status color
└──────────────────────────┘
```

- Surface: `--surface` with `--border`  
- Radius: `--radius-md`  
- Property-related KPIs may use `--tertiary` for the value accent  
- Pipeline KPIs use default `--foreground`

**Dashboard KPIs (from spec):**

- Total / Active / Broken Scrapers  
- Total / Active Agencies  
- Running Crawls  
- Properties Imported / Updated / Removed Today  
- Failed Properties  
- Queue Status (waiting / running / failed)  
- Active Generation Runs  
- Active Integration Connections  
- Unread Notifications

### 8.2 Data table

- Sticky header row on `--surface-secondary`  
- Row hover: `--surface-secondary`  
- Selected row: `--accent-bg`  
- Status column: colored chip (see §8.3)  
- Actions: icon button group, right-aligned  
- Empty state: illustration + primary action (e.g. "Add agency")

### 8.3 Status chip

Pill shape, `--radius-xs`, padding `4px 8px`, `Label medium`:

| Health | Background | Text |
| ------ | ---------- | ---- |
| Excellent | `--status-excellent-bg` | `--status-excellent` |
| Good | `--status-good-bg` | `--status-good` |
| Warning | `--status-warning-bg` | `--status-warning` |
| Critical | `--status-critical-bg` | `--status-critical` |
| Broken | `--status-broken-bg` | `--status-broken` |

Always include text label; do not rely on color alone.

### 8.4 Property history timeline

Vertical timeline for `PropertyHistory` (§14):

- **CREATED** — sage dot, `--history-created`  
- **UPDATED / price** — copper dot, `--history-updated`  
- **REMOVED** — red dot, `--history-removed`  
- **REAPPEARED** — blue dot, `--history-reappeared`  

Each entry: timestamp (mono, muted), field name, old → new value diff, link to `CrawlRun`.

### 8.5 Computer-use session replay

Generation run detail (§4.2): step list with screenshot thumbnails, action type badge, expandable `model_reasoning`. Use `--surface-tertiary` for step cards; monospace for payloads.

### 8.6 Integration credential forms

- Mask secrets; show "configured" hint only  
- `auth_type` drives visible fields (API key, email/password, OAuth)  
- Destructive "Disconnect" uses `--status-error` outline button + `ConfirmationDialog` from `@/components/ui/confirmation-dialog`

### 8.7 Confirmation dialog

All destructive actions (delete agency, remove integration target, disconnect account) use the shared `ConfirmationDialog`:

```tsx
import { useOverlayState } from "@heroui/react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

const deleteState = useOverlayState();

<Button variant="danger" onPress={deleteState.open}>Delete</Button>
<ConfirmationDialog
  state={deleteState}
  title="Delete agency?"
  description="This action cannot be undone."
  confirmLabel="Delete"
  onConfirm={() => deleteAgency(id)}
  isPending={isDeleting}
/>
```

- Confirm button: `variant="danger"` via `ActionButtonWithPending`  
- Dialog stays open if `onConfirm` throws (mutation error)  
- Backdrop dismiss disabled while `isPending`

### 8.8 Notifications list

- Unread: `--accent-bg` left border (4px)  
- Severity icon + title + relative time  
- Deep link styled as `--link`

---

## 9. Iconography

- **Library:** Lucide React (16px nav, 20px inline, 24px empty states)  
- **Style:** Outlined, 1.5px stroke, consistent with Material Symbols outlined  
- **Domain mapping:**

| Concept | Icon |
| ------- | ---- |
| Agency | `Building2` |
| Scraper | `Bot` |
| Crawl run | `RefreshCw` |
| Property | `Home` |
| Generation / AI | `Sparkles` |
| Job queue | `Layers` |
| Integration | `Plug` |
| Notification | `Bell` |
| Health excellent | `CircleCheck` |
| Health broken | `CircleX` |

---

## 10. Motion

| Interaction | Duration | Easing |
| ----------- | -------- | ------ |
| Hover background | 150ms | ease-out |
| Sidebar collapse | 300ms | ease-in-out |
| Drawer open/close | 250ms | MD3 emphasized decelerate |
| Theme switch | 200ms | ease |
| Page transition | none (instant) | — |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. Background & atmosphere

The app canvas uses a **subtle lattice grid** (24px) at low opacity — evoking property plots and structured data without visual noise. An optional radial warm glow sits behind the sidebar in dark mode (copper/indigo mix at 3% opacity).

Auth pages use the same canvas; the form card sits on `--surface` elevation 2.

---

## 12. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| `< lg` | Sidebar hidden; hamburger opens Drawer |
| `lg+` | Persistent sidebar, collapsible |
| Tables | Horizontal scroll on small screens; priority columns first |
| KPI grid | 1 col → 2 col (`sm`) → 4 col (`lg`) |

---

## 13. Accessibility checklist

- [ ] All form fields have visible `<Label>`  
- [ ] Focus visible on keyboard navigation  
- [ ] Status chips include text  
- [ ] Images in generation replay have alt text describing step action  
- [ ] Theme toggle has `aria-label`  
- [ ] Drawer has focus trap and dismiss on backdrop click  
- [ ] Color contrast verified in both themes

---

## 14. Implementation reference

### 14.1 File map

| File | Responsibility |
| ---- | -------------- |
| `src/index.css` | All design tokens, theme blocks, lattice background |
| `src/hooks/use-theme.ts` | Light/dark toggle |
| `index.html` | FOUC prevention script for `data-theme` |
| `src/config/environments/index.ts` | `APP_NAME` = "Property Sync" |
| `src/components/ui/confirmation-dialog.tsx` | Reusable delete/disconnect confirmation |

### 14.2 Using tokens in components

Prefer semantic Tailwind classes backed by HeroUI:

```tsx
<div className="bg-surface border border-border rounded-xl p-6">
  <p className="text-muted text-xs uppercase tracking-wide">Active Scrapers</p>
  <p className="text-foreground text-3xl font-bold font-mono">42</p>
</div>
```

For status chips, use CSS variables directly:

```tsx
<span
  className="text-xs font-medium px-2 py-0.5 rounded"
  style={{
    color: 'var(--status-excellent)',
    background: 'var(--status-excellent-bg)',
  }}
>
  Excellent
</span>
```

### 14.3 Do not

- Hardcode `gray-*`, `white`, or hex colors in components  
- Use primary accent for error/success states  
- Use Inter, Arial, or system-ui as the primary brand font  
- Apply purple-gradient hero aesthetics  

### 14.4 Future tokens (when CMS sync ships)

Reserve `--sync-pending`, `--sync-success`, `--sync-failed` for `CmsSyncRun` status UI per [`CMS-SYNCHRONIZATION-SPECIFICATION.MD`](../docs/CMS-SYNCHRONIZATION-SPECIFICATION.MD).

---

## 15. Related documents

- [`PROJECT-SPECIFICATIONS.MD`](../docs/PROJECT-SPECIFICATIONS.MD) — Functional requirements  
- [`CMS-SYNCHRONIZATION-SPECIFICATION.MD`](../docs/CMS-SYNCHRONIZATION-SPECIFICATION.MD) — Future sync UI  
- [Material Design 3 — Color system](https://m3.material.io/styles/color/system/overview)  
- [Material Design 3 — Typography](https://m3.material.io/styles/typography/overview)  
- [Material Design 3 — Elevation](https://m3.material.io/styles/elevation/overview)
