/**
 * Financial Dashboard — Display Rules (internal spec)
 * ----------------------------------------------------
 * This file is a living specification. It documents the display conventions
 * used across the Financial Dashboard (`/finance`) and the Home financial
 * block. Keep this in sync with `src/routes/_app.finance.tsx` and the home
 * block in `src/routes/_app.index.tsx`.
 *
 * Do not import this file for runtime logic — formatting helpers live next to
 * the components that use them. This module exists to preserve the rules for
 * future finance work.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 1. Currency
 * ──────────────────────────────────────────────────────────────────────────
 *  - EUR everywhere. No other currency is rendered.
 *  - KPI cards, summary stats and cash-flow rollups use ROUNDED EUR
 *    (`fmtEUR`, 0 decimals).
 *  - Ledger / detail rows and table footers use EUR with 2 DECIMALS
 *    (`fmtEUR2`).
 *  - Numeric amount columns are right-aligned and use tabular figures
 *    (`text-right tabular-nums`) so digits line up across rows.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 2. Dates
 * ──────────────────────────────────────────────────────────────────────────
 *  - Date-only values: pt-PT `dd/mm/yyyy` (`fmtDate`).
 *  - Date-time values: pt-PT `dd/mm/yyyy hh:mm` (`fmtDateTime`).
 *  - Empty / null / unparseable values render as the EM DASH `—` (DASH
 *    constant). Never render empty strings, "null", "N/A" or raw ISO.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 3. VAT
 * ──────────────────────────────────────────────────────────────────────────
 *  - Default dashboard mode is INCLUDING VAT (`vatMode = "inc"`).
 *  - The VAT toggle affects: Overview, Cash Flow, Income, Expenses, Materials.
 *  - The Home financial block always uses INCLUDING VAT — it has no toggle.
 *  - Debts are VAT-agnostic: they ignore the toggle and use raw amounts.
 *  - Invariant: in any tab, `paid + outstanding = total` must hold for both
 *    "inc" and "ex" VAT modes. Use the same `pickAmount(...)` helper for all
 *    three values; do not mix `amount_inc_vat` with `amount_ex_vat` derived
 *    elsewhere.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 4. Status labels
 * ──────────────────────────────────────────────────────────────────────────
 *  - Never show raw DB enum values to the user (no `confirmed`, `paid`,
 *    `scheduled`, etc. as visible text).
 *  - Always render via i18n: `t("finance:<group>Status.<value>")` with
 *    matching keys in EN and PT-PT.
 *  - Status badges use translated labels and a consistent variant per state
 *    (paid/positive = success, pending/scheduled = neutral, overdue = warn).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 5. Checksums (Import Logs)
 * ──────────────────────────────────────────────────────────────────────────
 *  - Display shortened form `xxxxxxxx...xxxx` inside a selectable `<code>`.
 *  - Full checksum stays available via the `title` attribute and is
 *    selectable for copy.
 *  - Never truncate without preserving the full value somewhere accessible.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Permissions (reminder)
 * ──────────────────────────────────────────────────────────────────────────
 *  - `/finance` is gated at the route level (`beforeLoad`) by admin OR
 *    `finance.dashboard`. Component-level checks remain as a fallback.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * i18n parity (reminder)
 * ──────────────────────────────────────────────────────────────────────────
 *  - Every key added to `en/finance.json` must exist in `pt-PT/finance.json`
 *    in the same edit. CI runs `scripts/check-i18n-parity.mjs`.
 */

export {};
