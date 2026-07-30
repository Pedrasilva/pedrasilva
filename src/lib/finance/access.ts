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
 *   - Fail CLOSED: any query error, exception, timeout or unexpected state
 *     denies access. Only an explicit, successful positive check grants it.
 */
import { supabase } from "@/integrations/supabase/client";

export async function checkFinanceAccess(): Promise<boolean> {
  // On hard navigation / link-click immediately after load the Supabase
  // session can still be hydrating from localStorage. Retry briefly to avoid
  // a false "unauthenticated" redirect on a logged-in user.
  let userId: string | undefined;
  try {
    for (let i = 0; i < 10; i++) {
      const { data, error } = await supabase.auth.getSession();
      if (error) break;
      userId = data?.session?.user?.id;
      if (userId) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    return false;
  }
  if (!userId) return false;

  // 1) Legacy admin role
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!error && data) return true;
  } catch {
    // fail closed: continue to next check, never grant on error
  }

  // 2) V2 admin role assignment
  try {
    const { data, error } = await supabase
      .from("user_role_assignments")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data?.role === "admin") return true;
  } catch {
    // fail closed
  }

  // 3) Legacy explicit permission
  try {
    const { data, error } = await supabase
      .from("user_permissions")
      .select("permission_key")
      .eq("user_id", userId)
      .eq("permission_key", "finance.dashboard")
      .maybeSingle();
    if (!error && data) return true;
  } catch {
    // fail closed
  }

  // 4) V2 effective permissions (role baseline ∪ overrides − revokes)
  try {
    const { data, error } = await supabase.rpc(
      "list_user_effective_permissions",
      { _user_id: userId },
    );
    if (
      !error &&
      Array.isArray(data) &&
      data.some((r: { permission_key?: string }) => r.permission_key === "finance.dashboard")
    ) {
      return true;
    }
  } catch {
    // fail closed
  }

  // No successful positive check → deny.
  return false;
}

  return false;
}
