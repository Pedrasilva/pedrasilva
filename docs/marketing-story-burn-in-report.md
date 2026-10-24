# Instagram Story burn-in — 24 October 2026

## Delivered
- Browser Canvas renderer creates 1080×1920 JPEGs, quality .92, with EXIF-aware browser image decoding, centred cover photos, theme Signifier/The Future fonts loaded before drawing, long-word wrapping and adaptive sizing. Text stays below 250px and above the bottom 340px.
- Sticker policy is saved in final_story_frames (therefore in the existing canonical approval hash): omit means drop the sticker and its text; manual or unresolved blocks automatic publication. Generating a preview does not choose for the curator.
- Explicit preview, save edit, direct approval and colleague request/decision prepare the current frame set. No page-load rendering or AI calls. Approval/publishing/claim/checkpoint/send RPC semantics remain unchanged.
- Private write-once JPEGs live at marketing-assets/{draft_id}/story-render/{canonical_content_hash}/{one_based_frame}.jpg. Server functions authorize the caller before privileged upload, validate JPEG geometry/size, record SHA-256 byte digests and save via a row-lock compare-and-set RPC. No native image libraries run in the Worker.
- The manifest is cleared on canonical content edits. Planner and Calendar use ordered rendered files; publisher requires a complete automatic manifest matching the approved hash, in addition to the existing current-content approval blocker. Old/manual renders fail before Graph calls.

## Real failed Story: preview only
Draft ced8fb1c-c950-4d75-9e83-0d787a522e9c, scheduled 24 October at 21:30 Lisbon (20:30 UTC).
- Rendered two frames in the authenticated Planner through its preview button and read them back in the Calendar quick preview.
- Both JPEG originals measure 1080×1920; displayed reduced files preserve the whole frame.
- Hash before/after: dd6e143c744833a27d2a7cbd5fc4ee44. Status remains failed; scheduled_at unchanged; publish_attempts remains 1; publish_retry_at and publish_sent_at remain NULL; ig_container_ids remains [].
- Question sticker remains unresolved, manifest automatic=false. No consent was inferred, no editorial decision changed, and no publish, retry or reschedule was invoked.
- Browser reported no page errors. Screenshots: /tmp/browser/story/frame-1.png, frame-2.png, calendar-preview.png, planner.png.

## Migrations
- drizzle/migrations/0178_marketing_story_renders.sql, byte-identical supabase/migrations/20261024221500_marketing_story_renders.sql: nullable manifest, protected validation/storage RPC and private reader policy.
- drizzle/migrations/0179_marketing_story_render_invalidation.sql, byte-identical supabase/migrations/20261024221800_marketing_story_render_invalidation.sql: clear manifests after canonical content edits.
- RPC: marketing_store_story_render; functions: getStoryRenderContext, storeStoryRenderFrame; browser orchestration: prepareStoryRender.

## Files
- src/lib/marketing/story-render.ts (new)
- src/lib/marketing/story-render.functions.ts (new)
- src/lib/marketing/render-story-browser.ts (new)
- src/lib/marketing/instagram-publish.server.ts
- src/components/marketing/post-approval-controls.tsx
- src/routes/_app.marketing.posts.tsx
- src/routes/_app.marketing.calendar.tsx
- src/i18n/locales/en/marketing.json, src/i18n/locales/pt-PT/marketing.json
- src/lib/marketing/AGENTS.md
- scripts/test-story-render.test.ts (new), scripts/test-instagram-pipeline.mjs
- roadmap.md, this report, and migration-generated src/integrations/supabase/types.ts.

## Validation and limits
- 7 Story helper rules + 15 Calendar/grid tests pass; 7 mocked publication pipelines pass; 19 Instagram publishing/media checks pass; EN/PT parity passes; latest preview build OK.
- Real approval and real publication deliberately not exercised. No disposable draft needed for the explicitly authorized render-only real test.
- This renderer handles photo and text frames, not burning overlays into video. A video frame fails preparation explicitly, rather than publishing incorrect media.
- The chosen dark ink brand card and typography are the app theme; the active Bible gives tone/positioning, not separate numeric colour/font overrides.
- Pending Finance source and records were not touched.