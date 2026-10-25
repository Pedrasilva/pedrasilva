import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AdminOnly } from "@/components/AdminOnly";
import { AdminResetProjectsTool } from "@/components/admin/admin-reset-projects-tool";

export const Route = createFileRoute("/_app/admin/projects")({
  head: () => ({ meta: [{ title: "Ferramentas de projetos | PSA Hub" }, { name: "description", content: "PSA Hub — ferramentas de projetos do atelier." }, { property: "og:title", content: "Ferramentas de projetos | PSA Hub" }, { property: "og:description", content: "PSA Hub — ferramentas de projetos do atelier." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
