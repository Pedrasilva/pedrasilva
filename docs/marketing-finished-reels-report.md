# Finished reels — 25 October 2026

## Implemented
- Planner: **Add finished reel** next to Generate ideas; required project profile, private resumable/chunked upload with progress and pause/resume, editable caption/hashtags, manual caption suggestion and optional voice note.
- Shared browser/publisher checks: MP4/MOV H.264/HEVC, AAC ≤48 kHz mono/stereo, 3–900 seconds, 23–60 fps, width ≤1920, bitrate ≤25 Mbps, maximum 1 GiB. Landscape/square is rejected; non-9:16 portrait is an explicit warning, consistently accepted by both paths.
- Metadata must be available in the first 32 MiB (fast-start export). No Worker decoding/native libraries.
- Cover: frame scrubber or supplied JPEG; browser creates a whole-image 1080×1920 JPEG. Previews use the cover, never the full video. Calendar quick preview and Instagram grid open the video.
- Draft: Instagram reel, project language, existing clearance warnings and named-client confirmation. Cover path/feed choice are included in the canonical reel hash; ordinary hashes, approval records, claims and pre-send/duplicate protection remain unchanged.
- Publisher passes `cover_url` and `share_to_feed` on REELS creation. Meta documentation confirms both fields: [Facebook Login content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing). No actual Meta publish was attempted.

## Database / storage
- `0184_marketing_finished_reels`: adds reel format, `reel_cover_path`, `reel_share_to_feed`, private upload registry `marketing_reel_uploads`, caller-scoped permissions, hash extension and `marketing_finish_reel`.
- `0185_marketing_reel_finalize_lock`: serializes finalization with an advisory transaction lock; avoids requiring UPDATE access on immutable upload evidence and remains idempotent.
- `0186_marketing_reel_evidence_delete_guard`: explicitly qualifies the upload ID in unused-session deletion protection.
- All three applied changes have byte-identical SQL mirrors in `supabase/migrations/20261025011500_*`, `20261025014200_*`, `20261025014800_*`.
- Private `marketing-assets/reels/{upload_id}/video.mp4` (or `.mov`) and `cover.jpg`; only paths are stored. Signed URLs are produced for display/publication. Bucket remains private and accepts 1 GiB.

## Files
- `src/components/marketing/finished-reel-dialog.tsx`
- `src/lib/marketing/finished-reels-browser.ts`, `finished-reels.functions.ts`, `video-validation.ts`, `mp4-metadata.ts`
- `src/lib/marketing/draft-images.ts`, `instagram-media.server.ts`, `instagram-publish.ts`, `instagram-publish.server.ts`
- `src/routes/_app.marketing.posts.tsx`, `_app.marketing.calendar.tsx`
- `src/components/marketing/instagram-grid.tsx`
- EN/PT-PT `src/i18n/locales/*/marketing.json`
- `src/lib/marketing/AGENTS.md`, `roadmap.md`
- Migration pairs, generated database types, `scripts/test-finished-reels.test.ts`, `scripts/finished-reels-vitest.config.mjs`

Server functions: `finishReelUpload`, `suggestReelCaption`; database finalization: `marketing_finish_reel`.

## Verification and limits
- Authenticated browser: synthetic 360×640, 4-second, 30 fps H.264/AAC video and synthetic JPEG cover uploaded successfully; draft read back as `suggested`, `reel`, `pt-PT`, linked to the disposable project, with stored cover and feed choice. Cover loaded in Planner, and the project/name clearance warning was visible alongside normal approval controls.
- Screenshots inspected: `/tmp/browser/finished-reels/upload.png`, `/tmp/browser/finished-reels/planner.png` (shown in chat).
- Deleted only test-created draft/request/project/profile and all four test upload sessions plus their files. Confirmed zero remaining fixture drafts. No real draft edited, approved, deleted, rescheduled or published.
- 9 reel tests, 19 Instagram mocked checks and 7 mocked pipeline scenarios passed; EN/PT parity passed. Build log: OK.
- This sandbox's Chromium cannot decode H.264. JPEG cover upload is verified, but playback/frame scrubbing is not verified end-to-end here. A codec failure has an explicit browser message and JPEG alternative.
- AI caption generation and voice transcription were not called; manual-only wiring is present. Full-size 1 GiB upload, pause/reconnect recovery, live Meta cover/feed outcome, and Calendar drag of the fixture were not exercised. No publication and no Finance changes.