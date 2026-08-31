# Homepage restructure

Reorder the hub so the daily-useful information is immediately visible and the
image gallery stops dominating the page.

## New page order

```text
1. Hero            greeting, date, tagline, today's celebration banner
2. Today strip     Off today · Upcoming holidays · Upcoming celebrations (3 compact cards)
3. My actions      unchanged (reminders / things to do)
4. Finance snapshot (admins / finance permission) — unchanged
5. Modules grid    with a new "Signature Projects" entry point
6. Quote of the day
```

Everything above the modules grid is short and scannable; nothing below is
required to start the day.

## Today strip

Replace the current bottom "Studio diary" three-column block with one compact
row of three equal cards placed right under the hero:

- Off today — avatar + name + absence type, max 4 rows, "+N more" line
- Upcoming holidays — next 3, name + date + relative label
- Upcoming celebrations — next 4, birthday/anniversary, name + date

Same data hooks as today (`useWhoIsOff`, `useUpcomingHolidays`,
`useUpcomingCelebrations`), same empty states, just denser rows and no large
section header. On mobile the three cards stack.

## Signature Projects moves off the homepage

The gallery becomes its own page instead of an always-open section:

- New route `/portfolio` rendering the existing
  `SignatureProjectsSection` (category tabs, upload for admins, lightbox) —
  the component itself is reused as-is.
- On the homepage it is represented by a single module tile ("Signature
  Projects", number 07, image icon) in the existing modules grid, visible to
  every authenticated user like the Inventory tile.
- The tile shows a small preview: the 3 most recent library thumbnails as a
  strip inside the card, so the page still feels alive without taking a full
  screen of height.

## Quote of the day

Keep it, but as the closing band after the modules grid (it already is the
last element — only its position relative to the widgets changes).

## Technical notes

- `src/routes/_app.index.tsx`: reorder sections, extract the three widgets
  into a `TodayStrip` component (new file
  `src/components/home/today-strip.tsx`), remove the "Studio diary" header
  block, add the portfolio module entry.
- New route file `src/routes/_app.portfolio.tsx` wrapping
  `SignatureProjectsSection` with a page heading; `isAdmin` from `useAuth`.
- New i18n keys in `home.json` (EN + PT-PT, same edit): `today.title`,
  `off.more`, `signature.moduleTitle`, `signature.moduleSubtitle`,
  `signature.moduleDescription`. Existing `studio.*` keys are dropped.
- No data, RLS, or query changes — presentation only.
