## Goal

Replace the finance left sidebar with a horizontal secondary nav under the finance header, so the full viewport width is available for tables and reports.

## Layout change

Before:
```
┌──┬─────────┬───────────────────────┐
│  │ Finance │  Header (VAT toggle)  │
│Ra│ Sidebar ├───────────────────────┤
│il│ (groups)│  Content              │
└──┴─────────┴───────────────────────┘
```

After:
```
┌──┬──────────────────────────────────┐
│  │  Header: title • VAT toggle      │
│Ra├──────────────────────────────────┤
│il│  Tabs: Documentos · Faturação ·  │
│  │        Pagamentos · Bancos ·     │
│  │        Relatórios · Dados · Admin│
│  ├──────────────────────────────────┤
│  │  Sub-items (pills, contextual)   │
│  ├──────────────────────────────────┤
│  │  Content (full width)            │
└──┴──────────────────────────────────┘
```

## Nav pattern

Two-row horizontal nav:
- **Row 1 — Groups** as tabs (Documentos, Faturação, Pagamentos, Bancos, Relatórios, Dados, Admin). Active tab = current group derived from pathname.
- **Row 2 — Items** of the active group as pills (e.g. under Faturação: Faturas, Recibos, Clientes, Entradas). The active item is highlighted.

Both rows are sticky under the global top nav and horizontally scrollable on narrow viewports. Icons stay (small, left of label) so scanning matches today's sidebar.

## Files to change

1. **New `src/components/finance/finance-top-nav.tsx`** — renders the two rows from the same group/item config currently in `finance-sidebar.tsx`. Reads active route via `useRouterState` and `Link` from `@tanstack/react-router`. Uses existing shadcn `Tabs` for row 1 and styled `Link` pills for row 2 (or a single component with two visual tiers).
2. **`src/components/finance/finance-sidebar.tsx`** — extract the nav config (groups + items + icons + i18n keys) into a sibling `finance-nav-config.ts` so both sidebar and top-nav share it. Keep the sidebar file for now but unused (delete in a follow-up once the top-nav ships cleanly).
3. **`src/routes/_app.finance.tsx`** — remove `SidebarProvider` / `FinanceSidebar` / `SidebarInset` / `SidebarTrigger`. Replace with a plain flex column: `<FinanceHeader />` + `<FinanceTopNav />` + `<main>`. Keep `FinanceShellProvider` and the VAT toggle in the header.
4. **`src/styles.css`** — remove the `.finance-shell` sidebar offset rule added in the previous fix (no longer needed).
5. **i18n** — reuse existing `finance:nav.*` keys; no new strings unless we shorten any group label that's too long for a tab (verify in PT-PT). Any new key added in EN + PT in the same edit.

## Behavior

- Active group/item resolved from `location.pathname` against the shared config.
- Keyboard: tabs navigable with arrow keys (shadcn `Tabs` default).
- Mobile (<768px): both rows become horizontally scrollable strips with snap; no off-canvas drawer needed.
- VAT toggle stays in the sticky header (row above the tabs), unchanged behavior.

## Out of scope

- No changes to finance pages themselves.
- No change to the global `AppRail`.
- Sidebar component file kept on disk this turn; removal in a follow-up to keep the diff focused and reversible.

## Verification

- `/finance/invoicing/invoices` (current route) shows the invoices table at full width with "Faturação" tab active and "Faturas" pill active.
- Clicking each tab updates row 2 and navigates to the group's index/first item.
- VAT toggle still works.
- No leftover sidebar artifacts or CSS offset.
