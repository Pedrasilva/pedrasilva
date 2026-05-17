import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CrmShell } from "@/components/crm/crm-shell";
import { supabase } from "@/integrations/supabase/client";

const CRM_KEYS = ["crm.companies", "crm.contacts", "crm.pipeline"] as const;

async function checkCrmAccess(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return false;

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) return true;

  const { data: perms } = await supabase
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId)
    .in("permission_key", CRM_KEYS as unknown as string[]);
  return (perms?.length ?? 0) > 0;
}

export const Route = createFileRoute("/_app/crm")({
  beforeLoad: async () => {
    const ok = await checkCrmAccess();
    if (!ok) throw redirect({ to: "/" });
  },
  component: CRMLayout,
});

function CRMLayout() {
  return (
    <CrmShell>
      <Outlet />
    </CrmShell>
  );
}
