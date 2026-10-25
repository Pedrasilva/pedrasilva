import { isReelVideoPath } from './reel-retention';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Called only behind the existing server-only scheduled-job secret. No Meta calls. */
export async function cleanupPublishedReelVideos(db?: SupabaseClient<Database>) {
  const sb = db ?? (await import('@/integrations/supabase/client.server')).supabaseAdmin;
  // DB serializes the daily gate, claims eligible files and captures their exact stored size.
  const { data: claims, error } = await sb.rpc('marketing_claim_reel_cleanup');
  if (error) throw new Error('Reel cleanup claim unavailable');
  let purged = 0, failed = 0, bytes = 0;
  for (const c of claims ?? []) {
    try {
      if (!isReelVideoPath(c.upload_id, c.video_path)) throw new Error('unsafePath');
      const { data: eligible, error: checkError } = await sb.rpc('marketing_reel_purge_eligible', { _upload: c.upload_id });
      if (checkError || eligible !== true) throw new Error('notEligible');
      // One exact video path only. Storage API removes both bytes and object metadata.
      const { error: removeError } = await sb.storage.from('marketing-assets').remove([c.video_path]);
      if (removeError) throw new Error('storageRemovalFailed');
      const { data: done, error: doneError } = await sb.rpc('marketing_complete_reel_purge', { _upload: c.upload_id, _claim: c.claim_id });
      if (doneError || done !== true) throw new Error('purgeRecordingFailed');
      purged++; bytes += c.purged_bytes;
    } catch (e) {
      failed++;
      // Do not log provider responses, URLs or secrets. Claims remain durable for next-day retry.
      const reason = e instanceof Error && ['unsafePath', 'notEligible', 'storageRemovalFailed', 'purgeRecordingFailed'].includes(e.message) ? e.message : 'cleanupUnavailable';
      const { data: drafts } = await sb.from('marketing_post_drafts').select('id').contains('asset_ids', [c.upload_id]);
      if (drafts?.length) {
        const { error: logError } = await sb.from('marketing_publish_log').insert(drafts.map(d => ({ draft_id: d.id, step: 'video_purge_failed', success: false, meta_error_code: reason, meta_error_message: 'Full-size reel video cleanup did not complete; retry next daily run.' })));
        if (logError) console.error('marketing.reelCleanup.logUnavailable');
      }
    }
  }
  const result = { candidates: claims?.length ?? 0, purged, failed, bytes };
  if (result.candidates) console.info('marketing.reelCleanup', result);
  return result;
}