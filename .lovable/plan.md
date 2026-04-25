## Goal
Make the proposal Preview **and** the printed PDF visually match the reference Pedra Silva fee proposal:
- Top-left **PEDR A SILV A ARCHITECTS** logo on every page
- Top-right `www.pedrasilva.com` (or firm site)
- Bottom-left **address block** (italic, small) repeating on every page
- Bottom-right **RIBA + Ordem dos Arquitectos** accreditation marks
- Page numbers in the outer margin
- Serif body font (the reference uses a transitional serif — we'll use a free Google equivalent, **EB Garamond / "Source Serif 4"**), bold sans for headings
- Generous 1" margins, justified body, the same overall rhythm

The reference is built around a fixed **page frame** (logo + footer block on every page). In CSS print, the only reliable way to get a true "every page" frame is to use `position: fixed` with `@page` margins — that's the core technique we'll apply.

## Files to change

### 1. `src/assets/logo-psa.png`
Already exists — confirmed it's the **PEDR A SILV A ARCHITECTS** mark. We'll reuse it.
Optionally add `src/assets/riba.png` and `src/assets/oa.png` for the footer accreditation marks. If the user doesn't have them yet, we'll render text fallbacks (`RIBA` + `ORDEM DOS ARQUITECTOS`) styled to match, and ask the user to upload the real PNGs after.

### 2. `src/components/quotes/quote-proposal-tab.tsx` — `ProposalPrintDocument`
Restructure the article so it has three layers:
- **`.proposal-page-header`** (fixed): logo (left) + website (right)
- **`.proposal-page-footer`** (fixed): address block (left) + accreditation marks (right)
- **`.proposal-page-body`**: scrollable/flowing content — title block, sections, generated tables

Header/footer are `position: fixed` so the browser print engine repeats them on every printed page. In Preview (screen) we make them `position: absolute` per "page" wrapper so the user sees the same chrome.

Add a centered cover/title block at the top of the body with:
- Project code + name (e.g. `P2502 | UX HQ Offices`)
- Subtitle line (e.g. `INTERIOR ARCHITECTURE DESIGN FEE PROPOSAL`)
- Issue date

Wire branding from existing `useFirmBranding()` (already returns `company_name`, `company_address`, `company_email`, `company_phone`). Add `company_website` to the select if available; otherwise fall back to `pedrasilva.com` derived from email domain or hard-coded firm site string.

Remove the inline header/footer that currently render only once at the top/bottom of the document (lines 1645–1667 and 1703–1717) and move them into the fixed frame.

### 3. `src/styles.css` — print + preview chrome
Add:
```css
@page {
  size: A4;
  margin: 28mm 22mm 32mm 22mm; /* room for fixed header + footer */
}

.proposal-print-document {
  font-family: "Source Serif 4", "EB Garamond", Georgia, "Times New Roman", serif;
  font-size: 11pt;
  line-height: 1.55;
  color: #111;
}

.proposal-print-heading,
.proposal-page-header .brand {
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
}

.proposal-page-header,
.proposal-page-footer {
  position: fixed;
  left: 22mm;
  right: 22mm;
}
.proposal-page-header { top: 10mm; }
.proposal-page-footer { bottom: 12mm; }

@media screen {
  /* Simulate paper in Preview */
  .proposal-print-document {
    width: 210mm;
    min-height: 297mm;
    margin: 24px auto;
    padding: 28mm 22mm 32mm 22mm;
    background: white;
    box-shadow: 0 8px 30px rgba(0,0,0,0.08);
    position: relative;
  }
  .proposal-page-header,
  .proposal-page-footer { position: absolute; }
}

@media print {
  .proposal-print-document { box-shadow: none; margin: 0; padding: 0; }
  .proposal-print-table thead { display: table-header-group; }
  .proposal-avoid-break { break-inside: avoid; }
}
```
Plus: page number using `counter(page)` in the footer's right side (CSS-only, prints correctly), table styling kept from previous fix.

### 4. Google Font import
Add `@import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&display=swap");` at the top of `src/styles.css`. This is the closest free analogue to the reference's transitional serif and renders cleanly in print.

### 5. `src/i18n/locales/{en,pt-PT}/crm.json`
Add new keys (EN + PT in same edit):
- `workspace.proposal.coverSubtitle` → "Fee Proposal" / "Proposta de Honorários"
- `workspace.proposal.footerAddressFallback` → "Lisboa\nTravessa do Corpo Santo 10 – 1ºD\n1200-131 Lisboa"
- `workspace.proposal.accreditationRiba` / `accreditationOA` (alt text)

### 6. `supabase/migrations/<timestamp>_add_pm_invoice_settings_website.sql`
Optional, only if `pm_invoice_settings` doesn't already have `company_website`. We'll check first and skip if present. Add `company_logo_url text` too so the firm can later override the logo.

## What this fixes vs current PDF
- **Logo only on first page** → logo on every page
- **No footer accreditation** → RIBA + OA marks on every page, bottom-right
- **Sans serif everywhere** → serif body matching the reference, sans-serif headings
- **Address shown once** → address repeats bottom-left on every page
- **No page numbers** → small page number in the outer margin
- **Preview ≠ PDF** → both use the same fixed frame so they look identical

## Validation after implementation
1. Visual: open Preview, confirm logo top-left + footer marks bottom-right.
2. Print → PDF: confirm the same frame repeats on pages 2, 3, 4…
3. Confirm justified body text and serif font in PDF.
4. `bunx tsc --noEmit`
5. `node scripts/check-i18n-parity.mjs`

## Open questions / assumptions
- I'll use the existing `src/assets/logo-psa.png` as-is.
- For the RIBA / Ordem dos Arquitectos marks I'll render styled text fallbacks first (`RIBA` in serif, `ORDEM DOS ARQUITECTOS` in bold sans) and ask you to drop in the real logo PNGs after — those marks are trademark-controlled, so I shouldn't fabricate them.
- Body font will be **Source Serif 4** (Google Fonts, free, very close to the reference).
- Address defaults to the Pedra Silva Lisbon address if `company_address` is empty in branding settings.
