import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AdminOnly } from "@/components/AdminOnly";
import { AdminResetProjectsTool } from "@/components/admin/admin-reset-projects-tool";

export const Route = createFileRoute("/_app/admin/projects")({
  component: AdminProjectsPage,
});

function AdminProjectsPage() {
  const { t } = useTranslation("common");
  return (
    <AdminOnly>
      <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("admin.projectsTools.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("admin.projectsTools.subtitle")}
          </p>
        </div>
        <AdminResetProjectsTool />
      </div>
    </AdminOnly>
  );
}
