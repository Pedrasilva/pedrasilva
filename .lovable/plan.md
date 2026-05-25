# Fix finance sidebar overlap with global rail

## Problem

The global `AppRail` (56px / `w-14`, sticky at the viewport's left edge) and the shadcn `<Sidebar>` inside `FinanceSidebar` are both anchored to `left: 0`. The shadcn primitive uses `position: fixed`, so it renders **underneath** the rail — every label in the screenshot is clipped on the left (`são geral`, `rnecedores`, `mpras`, …).

## Fix

Anchor the finance sidebar 56px from the left so it sits flush against the rail.

Scope: only the finance shell (`src/routes/_app.finance.tsx`). No changes to the shadcn `Sidebar` primitive (would affect other surfaces), no changes to `AppRail`.

## Technical details

Wrap the `<SidebarProvider>` subtree in a container that:

1. Adds left padding equal to the rail width so the *content* (`<SidebarInset>` / `<Outlet />`) clears the rail.
2. Overrides the fixed sidebar panel's `left` to `3.5rem` (= `w-14`) via a scoped CSS selector targeting the data attribute shadcn already emits (`[data-sidebar="sidebar"]` on the inner fixed panel) so the rail and the finance sidebar are visually adjacent.

Concretely in `src/routes/_app.finance.tsx`, around the existing `<SidebarProvider>`:

```text
<div className="finance-shell flex min-h-screen w-full">
  <SidebarProvider>
    <FinanceSidebar />
    <SidebarInset> … <Outlet /> … </SidebarInset>
  </SidebarProvider>
</div>
```

Add a small scoped style block (or one rule in `src/styles.css` under a `.finance-shell` selector) that offsets the fixed sidebar wrapper by `var(--app-rail-width, 3.5rem)` and adjusts the inset's left margin by the same amount. Define `--app-rail-width: 3.5rem` once at the layout root so the value stays in sync with `AppRail`'s `w-14`.

Mobile (`md:` and below): `AppRail` is already `hidden md:flex` and the finance sidebar switches to off-canvas, so the offset must only apply at `md` and up — gate the selector with `@media (min-width: 768px)`.

Collapsed state: the icon-collapsed sidebar (`group-data-[collapsible=icon]`) keeps the same `left` offset, so no extra handling is needed — it just becomes a 56px-wide strip next to the 56px rail.

## Verification

1. `/finance` at ≥768px: rail visible at the left edge, finance sidebar starts at x=56px, all group labels (`Geral`, `Documentos`, `Operação`, `Bancos`, `Relatórios`, `Dados`) and item labels render in full.
2. Toggle the finance sidebar collapsed: it shrinks to icons at x=56px; content reflows; no overlap.
3. Resize below `md`: rail hides, finance sidebar becomes the off-canvas sheet as before; no leftover left padding on content.
4. Navigate `/finance → /finance/documents/invoices → /finance/banks/reconciliation`: active state highlights correctly; no layout shift.
5. Navigate `/` (home) and `/projects`: unaffected — the override is scoped to `.finance-shell`.
