import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CrmShell } from "@/components/crm/crm-shell";

export const Route = createFileRoute("/_app/crm")({
  component: CRMLayout,
});

function CRMLayout() {
  return (
    <CrmShell>
      <Outlet />
    </CrmShell>
  );
}
