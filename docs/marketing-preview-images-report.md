# Whole-image Marketing previews — 24 October 2026

## Diagnosis and before/after measurements

Authenticated, read-only measurements on three real assets used by existing Planner drafts. Original bytes were not modified. Whole-image comparison used an EXIF-oriented, proportionally scaled original against the downloaded transform: mean channel error fell from 24.25/37.59/34.83 to 3.35/3.30/3.12 (0–255 scale), consistent with full-image lossy compression rather than a crop.

| Asset | Original px | EXIF | Planner before | Planner after | Inbox before → after | Original bytes | New thumbnail bytes |
|---|---|---|---|---|---|---|---|
| 1 — `85bf4bac-636f-4f19-a5e0-023ddc48c74a` | 4500×5625 | 1 (normal) | 400×5625, cropped strip | 400×500, full image | 600×750 → 600×750, full image | 12,337,195 | 54,256 |
| 2 — `97ca2f0c-41fc-449d-9a47-e9bae811adb7` | 4500×5625 | 1 (normal) | 400×5625, cropped strip | 400×500, full image | 600×750 → 600×750, full image | 10,830,972 | 43,316 |
| 3 — `4180e03b-7d6a-4395-a937-550ed8dceada` | 4500×5625 | 1 (normal) | 400×5625, cropped strip | 400×500, full image | 600×750 → 600×750, full image | 10,709,226 | 30,186 |

The actual faulty hosted width-only transform produced a 400×5625 strip, not a proportional scale-down. Explicit `resize: "contain"` produces 400×500. Existing Inbox files were already complete 600×750 scale-downs; their wide boxes intentionally crop centrally through CSS. Regenerated versioned files retain that full-image geometry.

## Limits and orientation

Published Storage transformation limits: 25MB source, 50 megapixels source, requested width/height 1–2500 px. These three originals are 25.3125MP and 10.7–12.3MB: none exceeds those limits, so limit fallback did not cause this bug. imgproxy auto-rotation is enabled by default; all three real examples have EXIF 1. A synthetic EXIF 6 regression verifies the maintenance encoder rotates before resizing and removes orientation metadata.

Sources: https://supabase.com/docs/guides/storage/image-transformations ; https://github.com/supabase/storage/pull/732 ; https://github.com/imgproxy/imgproxy/pull/465

## Fix and backfill

- Explicit contain on all preview transformations (other Marketing transforms already specified contain).
- `PREVIEW_VERSION = contain-v2` invalidates signed URL cache identity and Planner/Inbox query cache keys.
- Centred `object-cover` remains CSS-only; downloaded files preserve the whole photo.
- `backfillCaptureThumbnails(admin, { overwrite: true })`: 68 image rows from 9 captures scanned; 55 thumbnails regenerated in 7 captures; 13 failures in 2 captures because the originals no longer exist. Missing originals were not recreated or deleted.
- Private paths: `marketing-assets/{capture_id}/thumb-v2-{asset_id}.webp`; path/byte fields updated, no signed URLs stored. Old files preserved, new paths bypass old CDN/browser objects.
- Maintenance-only alternative `scripts/thumbnail-fallback.ts` uses an EXIF-aware native encoder outside the application runtime when a Storage transform rejects a large source. It is not imported by app/server code. No real asset needed it in this run. Automatic oversized ingestion in the hosted app still requires running this maintenance fallback; no native decoder is bundled into the edge app.

## Verification

Authenticated browser: Planner files 400×500, Inbox files 600×750 on the visible cards, object-cover centred; zero runtime errors. Screenshots inspected. Tests: preview transform parameters, publishing-original preservation, overwrite selection, versioned thumbnail identity, EXIF rotation and existing grid rules. No Finance changes or Instagram publication.

## Changed files

- src/lib/marketing/draft-images.ts
- src/lib/marketing/thumbnails.server.ts
- src/lib/marketing/AGENTS.md
- src/routes/_app.marketing.posts.tsx
- src/routes/_app.marketing.index.tsx
- scripts/backfill-capture-thumbnails.ts
- scripts/thumbnail-fallback.ts
- scripts/test-marketing-thumbnails.test.ts
- package.json and dependency lockfile
- roadmap.md and this report

No schema migration required.
