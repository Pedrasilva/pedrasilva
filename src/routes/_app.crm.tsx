import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CrmShell } from "@/components/crm/crm-shell";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
import { useTranslation } from "react-i18next";

const CRM_KEYS: PermissionKey[] = ["crm.companies", "crm.contacts", "crm.pipeline"];

export const Route = createFileRoute("/_app/crm")({
  component: CRMLayout,
});

function CRMLayout() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const { permissions, loading: permsLoading } = useMyPermissions();
  const [checked, setChecked] = useState(false);

  const loading = authLoading || permsLoading;
  const allowed = isAdmin || CRM_KEYS.some((k) => permissions.has(k));

  useEffect(() => {
    if (loading) {
      setChecked(false);
      return;
    }
    setChecked(true);
    if (!allowed) navigate({ to: "/" });
  }, [loading, allowed, navigate]);

  if (loading || !checked || !allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {t("loading")}
      </div>
    );
  }

  return (
    <CrmShell>
      <Outlet />
    </CrmShell>
  );
}
