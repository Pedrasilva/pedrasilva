import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getStoryRenderContext = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ draftId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: draft, error } = await context.supabase.from('marketing_post_drafts').select('*').eq('id', data.draftId).single();
    if (error || !draft || draft.format !== 'story') throw new Error('Story not found');
    const { data: review, error: e } = await context.supabase.rpc('marketing_review_draft_warnings', { _draft: data.draftId, _patch: {} });
    if (e || !review || typeof review !== 'object' || Array.isArray(review) || typeof review.hash !== 'string') throw new Error('Story hash unavailable');
    const { resolveDraftImages, signPaths } = await import('./draft-images');
    const images = await resolveDraftImages(context.supabase, draft.asset_ids);
    const manifest = draft.story_render_manifest as unknown as import('./story-render').StoryManifest | null;
    const urls = manifest?.content_hash === review.hash ? await signPaths(context.supabase, manifest.paths.map(path => ({ path }))) : new Map<string,string>();
    return { hash: review.hash, frames: (draft.final_story_frames ?? draft.ai_story_frames) as unknown as import('./story-render').StoryFrame[], images, manifest: manifest?.content_hash === review.hash ? manifest : null, urls: Object.fromEntries(urls) };
  });

/** Validates bytes, caller permission and the current canonical hash before any privileged write. No publishing. */
export const storeStoryRenderFrame = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ draftId: z.string().uuid(), hash: z.string().regex(/^[a-f0-9]{32}$/), index: z.number().int().min(1).max(30), jpeg: z.string().max(11000000), finish: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: permitted } = await context.supabase.rpc('has_module_permission', { _user_id: context.userId, _key: 'marketing.curate', _required_scope: 'all' });
    const { data: pending } = await context.supabase.from('marketing_post_approvals').select('id').eq('draft_id', data.draftId).eq('approver_id', context.userId).eq('decision', 'pending').is('voided_at', null).limit(1);
    if (!permitted && !pending?.length) throw new Error('Not allowed');
    const { data: draft, error } = await context.supabase.from('marketing_post_drafts').select('*').eq('id', data.draftId).single();
    if (error || !draft || draft.format !== 'story' || ['publishing','published'].includes(draft.status) || draft.publish_sent_at || (Array.isArray(draft.ig_container_ids) && draft.ig_container_ids.length)) throw new Error('Story rendering is locked');
    const { data: review } = await context.supabase.rpc('marketing_review_draft_warnings', { _draft: data.draftId, _patch: {} });
    if (!review || typeof review !== 'object' || Array.isArray(review) || review.hash !== data.hash) throw new Error('Story content changed; render again');
    const frames = (draft.final_story_frames ?? draft.ai_story_frames) as unknown as import('./story-render').StoryFrame[];
    if (!Array.isArray(frames) || data.index > frames.length || data.finish !== (data.index === frames.length)) throw new Error('Story frame order invalid');
    const bytes = Uint8Array.from(atob(data.jpeg), c => c.charCodeAt(0));
    const { jpegDimensions } = await import('./instagram-media.server');
    const dims = jpegDimensions(bytes);
    if (!dims || dims.width !== 1080 || dims.height !== 1920 || bytes.length >= 8*1024*1024) throw new Error('Story JPEG must be 1080×1920 and smaller than 8 MiB');
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const path = `${data.draftId}/story-render/${data.hash}/${data.index}.jpg`;
    // Write once: even concurrent rendering can never replace previously approved pixel evidence.
    const { error: upload } = await db.storage.from('marketing-assets').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (upload && !/already exists|duplicate/i.test(upload.message)) throw new Error('Story frame upload failed');
    if (data.finish) {
      const { automaticStory } = await import('./story-render');
      const paths = frames.map((_, i) => `${data.draftId}/story-render/${data.hash}/${i+1}.jpg`);
      const sha256: string[] = [];
      for (const p of paths) { const { data: file, error: e } = await db.storage.from('marketing-assets').download(p); if (e || !file) throw new Error('Story frame missing'); const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); sha256.push(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')); }
      const manifest = { content_hash: data.hash, paths, automatic: automaticStory(frames), sha256 };
      const { error: saved } = await db.rpc('marketing_store_story_render', { _id: data.draftId, _hash: data.hash, _manifest: manifest });
      if (saved) throw new Error(saved.message);
    }
    return { path };
  });