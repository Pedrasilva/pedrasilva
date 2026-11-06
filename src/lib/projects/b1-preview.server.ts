// Server-only: forward the caller's own B1 preview marker to caller-scoped reads.
// The database decides (pm_project_b1_header_preview) whether the marker counts;
// the recorded, audited gate is never changed by it.
import { getRequest } from '@tanstack/react-start/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const B1_PREVIEW_HEADER = 'x-psa-b1-preview';

export function withB1PreviewHeader(fallback: SupabaseClient<Database>): SupabaseClient<Database> {
  const request = getRequest();
  const marker = request?.headers.get(B1_PREVIEW_HEADER);
  const auth = request?.headers.get('authorization');
  if (marker !== 'on' || !auth?.startsWith('Bearer ')) return fallback;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: auth, [B1_PREVIEW_HEADER]: 'on' } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
