# Header navigation: module tabs + reclaimed vertical space

## What changes

**1. Module tabs in the top bar**

Next to the logo, add a row of module tabs: **CRM · Projects · Finance · HR**. The active one is highlighted, so you always know which section you're in. Clicking any of them jumps straight there, no trip through the homepage. The logo keeps its current behaviour: it goes to the Hub/home.

**2. Time / Tasks / Schedule become project-only**

Those three hubs (and the `+` quick-create) currently show everywhere. They will only render on Home and Projects routes. In CRM, Finance and HR the top-right shows just the account avatar (plus the collaborator-mode chip when active).

**3. Reclaim the wasted space at the top of module pages**

The CRM page currently repeats what the header now says: a "← Hub" link, a large "CRM" title with icon, and a subtitle — roughly 120px of prime space before the real tabs. Since the header carries the module identity, the CRM shell drops the back-link, title and subtitle, leaving the section tabs (Overview / Opportunities / Companies / Contacts) directly under the header. Page padding is tightened from `py-6` to `py-4`. The same trim is applied to Finance's shell header so the two modules stay consistent.

Net effect on your screenshot: the quote workspace ("Alba y Ruben", stepper, tabs) moves up by roughly the height of the removed block.

## Technical notes

- `src/components/ModuleTopNav.tsx` already exists but is unused — it becomes the route-aware right-side slot in `src/routes/_app.tsx`, replacing the direct `GlobalTopNav` render. It returns `GlobalTopNav` only for `/`, `/projects`, and `/hr` timesheet-ish routes; `null` for `crm` / `finance` / `admin`.
- New `src/components/shell/ModuleTabs.tsx`: reads `RAIL_ITEMS` from `src/components/shell/nav-config.ts` for CRM / Projects / Finance / HR (labels via `common:shell.rail.*`, permission-gated the same way the rail is). Rendered in `_app.tsx` right after the logo, active state from the item's `matches` prefixes. Hidden below `md` (the mobile sheet already lists the modules).
- `src/components/crm/crm-shell.tsx`: remove the back-link + title/subtitle block, keep the `<nav>` tabs. Same trim in the Finance shell header (`src/components/finance/finance-shell-*`/`finance-top-nav.tsx` — whichever renders the title block).
- `_app.tsx` main wrapper: `py-6` → `py-4`.
- No i18n keys added; existing `shell.rail.*` labels are reused. No backend or data changes.
