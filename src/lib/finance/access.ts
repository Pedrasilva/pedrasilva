/**
 * Centralized finance access check.
 *
 * Finance is restricted to back-office users:
 *   - admins (`user_roles.role = 'admin'`), OR
 *   - users with the `finance.dashboard` permission key.
 *
 * Used in `beforeLoad` guards on every `/finance/*` route. Backend RPCs
 * still enforce admin-only checks server-side; this is the UI-layer guard.
 *
 * If we later introduce a true `back_office` role, change the rule here
 * and every finance route picks it up automatically.
 */
import { supabase } from "@/integrations/supabase/client";

export async function checkFinanceAccess(): Promise<boolean> {
  // On hard navigation the Supabase session can still be hydrating from
  // localStorage when beforeLoad runs. Retry briefly to avoid a false
  // "unauthenticated" redirect on a logged-in user.
  let userId: string | undefined;
  for (let i = 0; i < 5; i++) {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id;
    if (userId) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!userId) return false;

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return true;

  const { data: permRow } = await supabase
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId)
    .eq("permission_key", "finance.dashboard")
    .maybeSingle();
  return !!permRow;
}
