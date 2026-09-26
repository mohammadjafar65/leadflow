# LeadFlow — Design System & UX Specification

Built on **shadcn/ui** (Radix primitives + Tailwind) so components stay accessible and themeable out of the box. This doc defines the tokens and page-level flows that sit on top of the shadcn defaults.

## 1. Design Principles
1. **Data-dense but not overwhelming** — this is a working tool used for hours; prioritize scan-ability (tables, badges) over decorative UI.
2. **Trust and provenance are visible** — since data comes from scraping/enrichment, every uncertain field shows its source and confidence, never presented as ground truth.
3. **Undo over confirm-dialogs** — bulk actions (merge, delete, send) favor a toast with "Undo" rather than blocking modals, to keep operators fast.

## 2. Color Palette

Extends shadcn's CSS-variable theme (`--background`, `--foreground`, `--primary`, etc.) with domain-specific semantic tokens:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--primary` | `hsl(222 47% 11%)` (deep navy) | `hsl(210 40% 96%)` | primary actions, active nav |
| `--accent` | `hsl(199 89% 48%)` (signal blue) | `hsl(199 89% 60%)` | links, focus rings, chart accents |
| `--success` | `hsl(142 71% 33%)` | `hsl(142 71% 45%)` | Qualified stage, opened/replied events |
| `--warning` | `hsl(38 92% 50%)` | `hsl(38 92% 55%)` | crawl_blocked, low-confidence data |
| `--destructive` | `hsl(0 72% 51%)` | `hsl(0 72% 60%)` | bounced, unsubscribed, delete |
| `--muted` | `hsl(210 20% 96%)` | `hsl(217 19% 18%)` | table zebra, disabled states |

Pipeline-stage colors (badges/kanban columns): New Lead `slate`, Contacted `blue`, Responded `violet`, Qualified `emerald`, Closed `zinc`, Archived `neutral` — kept desaturated so they read calmly at high density.

## 3. Typography

- **Font:** Inter (UI), JetBrains Mono (for scraped raw data / logs / code blocks in the sequence builder's condition editor).
- Scale (Tailwind classes): `text-xs` (12px, metadata/timestamps) → `text-sm` (14px, table body/default UI) → `text-base` (16px, form inputs, body copy) → `text-lg`/`text-xl` (section headers) → `text-2xl` (page titles).
- Table body defaults to `text-sm` to maximize density without hurting legibility.

## 4. Spacing & Layout

- Base unit 4px (Tailwind default scale). Page content max-width `1440px` with a fixed 240px left nav on desktop, collapsing to icon rail at `lg` breakpoint, and a slide-over drawer under `md`.
- Card padding `p-4` (dense contexts like kanban cards) to `p-6` (detail panels).
- Table row height 44px default, with a "compact" density toggle at 32px for power users.

## 5. Breakpoints (Tailwind defaults, used as-is)

- `sm` 640px — not primary target; forms stack, kanban becomes single-column vertical list.
- `md` 768px — tablet: list/kanban usable two-up, filters move to a sheet/drawer instead of an inline sidebar.
- `lg` 1024px+ — primary target: full 3-pane layouts (nav / list / detail).
- `xl`/`2xl` — table gains additional columns (e.g., score breakdown, tags) that are hidden below `xl`.

## 6. Dark Mode

- Implemented via shadcn's `class` strategy (`dark:` variants + CSS variables), toggle persisted per-user.
- Map view: Google Maps styled with a custom dark JSON style array to match the app shell (default Google styling looks jarring against a dark UI).
- Charts (A/B test results, deliverability trend): use the `--accent`/`--success`/`--destructive` tokens so they auto-adapt with theme.

## 7. Component Inventory (shadcn base + custom composites)

**From shadcn/ui directly:** Button, Input, Select, Combobox (Command+Popover), Dialog, Sheet, Tabs, Table, Badge, Avatar, Dropdown Menu, Toast (Sonner), Tooltip, Card, Checkbox, Switch, Calendar/DatePicker, Progress, Separator, Skeleton.

**Custom composites built on top:**
- `LeadCard` — Kanban card: business name, category badge, score ring, last-activity relative time, avatar of assignee.
- `ScoreRing` — circular progress (SVG) showing 0–100 lead score with a hover breakdown tooltip of the 4 weighted components.
- `ProvenanceBadge` — small colored dot + tooltip showing field source (`Places API` / `Site scrape` / `Manual`) and last-updated timestamp.
- `SequenceNode` — node-based builder block (delay / condition / branch) — built on a lightweight canvas (React Flow), styled to match Card tokens.
- `DeliverabilityGauge` — SPF/DKIM/DMARC three-segment status strip (pass/warn/fail per segment).
- `MapClusterView` — Google Maps wrapper with marker clustering, colored by pipeline stage, popover-on-click using the `Popover` primitive.
- `VariablePicker` — inline `{{variable}}` autocomplete for the template editor (Combobox filtered by lead schema fields).

## 8. Page-by-Page Flows

### 8.1 Discovery (Maps Search)
Split view: left panel = search controls (region picker, category multiselect, radius slider), right panel = live map with pins appearing as results stream in. A results-count chip and "Extract N leads" primary CTA sits above the map. Clicking a pin opens a lightweight preview `Popover` before committing to full extraction.

### 8.2 Lead Pipeline (default landing page after search)
Top bar: view switch (Kanban / List / Map), filter bar (chips + "More filters" sheet), search input, bulk-action toolbar (appears once ≥1 row selected). Kanban columns are horizontally scrollable with sticky headers showing per-column count and total score-weighted value.

### 8.3 Lead Detail (drawer, opens over the pipeline rather than full navigation)
Tabs: **Overview** (contact fields with `ProvenanceBadge`s), **Activity** (timeline), **Emails** (thread view), **Notes**. A persistent right-edge "Personalization Brief" panel summarizes scraped website observations used for outreach.

### 8.4 Outreach — Template Editor
Two-pane: rich-text/Handlebars editor on the left, live preview rendered against a real selected lead on the right, so personalization tokens are checked against actual data rather than dummy text.

### 8.5 Sequences — Visual Builder
Full-canvas node editor (React Flow) with a left component palette (Delay, Condition, Send Email, Branch) and a right inspector panel for the selected node's config. Zoom/pan minimap in the bottom-right corner per React Flow defaults.

### 8.6 Deliverability / Sender Settings
Card grid, one card per sender identity, each showing the `DeliverabilityGauge`, daily-send progress bar, and a warmup-schedule sparkline for domains under 90 days old.

## 9. Animation & Micro-interactions

- Kanban card drag: shadcn/Radix-compatible drag library (`@dnd-kit`), 150ms ease-out drop settle, subtle scale(1.02) + shadow while dragging.
- Toasts: slide-in from bottom-right, 4s auto-dismiss except destructive/undo toasts (8s).
- Score ring: animates from 0 to value on first mount only (`prefers-reduced-motion` respected — snaps instantly if set).
- Sequence builder: edge-drawing between nodes uses a 100ms fade-in; no bouncy/elastic easing anywhere in the data-heavy views — motion stays quick and utilitarian per Principle 1.
