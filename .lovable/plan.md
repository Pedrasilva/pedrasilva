# Portal Pedra Silva — renaming and visual refresh

## What changes

1. **New name.** "Pedra Silva · Studio Hub" / "PSA Hub" becomes **Portal Pedra Silva** everywhere it is shown: homepage wordmark, browser tab titles, page descriptions, and the EN/PT texts. Navigation labels, links and permissions stay exactly as they are.

2. **Typography.** The site already carries the Pedra Silva brand fonts (The Future, Signifier) but does not use them for headings and body text. The refresh puts them to work the way pedrasilva.com does:
   - Headings and greetings: Signifier (serif), light weight, generous line height.
   - Interface text, labels, buttons, tables: The Future, with wide letter-spacing on small capitalised labels (the "MÓDULOS", "VER EQUIPA" look in your reference).
   - Fraunces/Manrope stay loaded as fallback so nothing can break if a font file fails.

3. **Colour and surface.** Warmer, quieter palette pulled from the studio site — off-white paper background, soft stone borders, muted ink text, one restrained accent. Applied through the existing design tokens, so every page inherits it automatically without page-by-page edits.

4. **Module background images.** Generated abstract textures — plaster, stone, timber, terrazzo, linen, shadow-on-wall — one per module (HR, CRM, Projects, Finance, Inventory, Product Library, Portfolio, Settings). Each sits behind the module card at low contrast with the title and description staying fully readable. Served from the CDN, not committed as heavy files.

5. **Homepage.** Same blocks in the same order as today — only the typography, spacing, imagery and card treatment change.

## UX improvement suggestions

After the restyle I will prepare rendered visual examples of the improvements below so you can pick which to build (each is a separate, later step — nothing is built without your go-ahead):

- **Greeting header with a real image band**, as in your reference, replacing the current plain text block.
- **A "today" tile row** (team in studio / working remotely / on holiday / events today) using the availability and calendar data the hub already holds.
- **Quick actions** — log time, request leave, new opportunity — reachable from the homepage instead of three clicks in.
- **Recently visited** projects and companies, so daily work resumes in one click.
- **Denser module cards** so all modules fit above the fold on a laptop.

## Technical notes

- Font stack and palette change in `src/styles.css` tokens plus the root route head; no new packages.
- Name change touches `src/routes/__root.tsx` head metadata, homepage copy, and the `home` EN/PT translation files (both languages edited together, parity check run).
- Module textures generated as images, uploaded as CDN asset pointers, referenced from the module card component.
- No changes to routes, navigation structure, permissions, database, hooks or business logic.

## Verification

- Typecheck and i18n parity check.
- Homepage and one page from each module reviewed in the browser for contrast and readability, EN and PT.
- Confirm no navigation item, route or permission changed.
