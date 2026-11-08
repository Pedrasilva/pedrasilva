// Server-only: forward an administrator's own B1 preview marker to caller-scoped reads.
// Non-admin callers: the marker is dropped here AND ignored by the database
// (pm_project_b1_header_preview requires has_role(admin) and a read-only
// transaction), so they always get the recorded B1 result and it never affects writes.
import { getRequest } from '@tanstack/react-start/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export const B1_PREVIEW_HEADER = 'x-psa-b1-preview';

/** Pure decision, shared with tests: forward only "on" from an admin with a bearer session. */
export function shouldForwardB1Preview(marker: string | null | undefined, auth: string | null | undefined, isAdmin: boolean): boolean {
  return marker === 'on' && !!auth?.startsWith('Bearer ') && isAdmin === true;
}

export async function withB1PreviewHeader(fallback: SupabaseClient<Database>, userId: string): Promise<SupabaseClient<Database>> {
  const request = getRequest();
  const marker = request?.headers.get(B1_PREVIEW_HEADER);
  const auth = request?.headers.get('authorization');
  if (marker !== 'on' || !auth?.startsWith('Bearer ')) return fallback;
  // Admin is verified server-side through the caller's own client, never from client input.
  const { data: isAdmin } = await fallback.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (!shouldForwardB1Preview(marker, auth, isAdmin === true)) return fallback;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: auth, [B1_PREVIEW_HEADER]: 'on' } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
