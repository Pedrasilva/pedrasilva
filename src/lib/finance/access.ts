/**
 * Centralized finance access check.
 *
 * Finance is restricted to back-office users:
 *   - admins (`user_roles.role = 'admin'` OR `user_role_assignments.role = 'admin'`), OR
 *   - users with the `finance.dashboard` permission key (legacy `user_permissions`
 *     or v2 effective permissions via `list_user_effective_permissions`).
 *
 * Used in `beforeLoad` guards on every `/finance/*` route. Backend RPCs
 * still enforce admin-only checks server-side; this is the UI-layer guard.
 *
 * Robustness rules:
 *   - Wait for the Supabase session to hydrate (localStorage → memory) before
 *     querying — otherwise navigating right after page load returns `false`
 *     and the route bounces back to `/`.
 *   - If we have a session but every permission query errors (network blip,
 *     transient RLS), we fail OPEN — the page's own RLS still protects data,
 *     and bouncing the user home with no feedback is a worse UX than letting
 *     them in and showing empty/denied data inline.
 */
import { supabase } from "@/integrations/supabase/client";

export async function checkFinanceAccess(): Promise<boolean> {
  // On hard navigation / link-click immediately after load the Supabase
  // session can still be hydrating from localStorage. Retry briefly to avoid
  // a false "unauthenticated" redirect on a logged-in user.
  let userId: string | undefined;
  for (let i = 0; i < 10; i++) {
    const { data: { session } } = await supabase.auth.getSession();
    userId = session?.user?.id;
    if (userId) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!userId) return false;

  let sawError = false;

  // 1) Legacy admin role
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) sawError = true;
    else if (data) return true;
  } catch {
    sawError = true;
  }

  // 2) V2 admin role assignment
  try {
    const { data, error } = await supabase
      .from("user_role_assignments")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) sawError = true;
    else if (data?.role === "admin") return true;
  } catch {
    sawError = true;
  }

  // 3) Legacy explicit permission
  try {
    const { data, error } = await supabase
      .from("user_permissions")
      .select("permission_key")
      .eq("user_id", userId)
      .eq("permission_key", "finance.dashboard")
      .maybeSingle();
    if (error) sawError = true;
    else if (data) return true;
  } catch {
    sawError = true;
  }

  // 4) V2 effective permissions (role baseline ∪ overrides − revokes)
  try {
    const { data, error } = await supabase.rpc(
      "list_user_effective_permissions",
      { _user_id: userId },
    );
    if (error) sawError = true;
    else if (
      Array.isArray(data) &&
      data.some((r: { permission_key?: string }) => r.permission_key === "finance.dashboard")
    ) {
      return true;
    }
  } catch {
    sawError = true;
  }

  // Fail OPEN on transient errors — the page's own queries are still RLS-protected,
  // and a silent bounce home is the worst possible UX.
  if (sawError) {
    // eslint-disable-next-line no-console
    console.warn("[finance/access] permission checks errored; allowing render and deferring to RLS");
    return true;
  }

  return false;
}
