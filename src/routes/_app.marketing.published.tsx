import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ModuleSubnav } from "@/components/shell/ModuleSubnav";
import { PipelineStrip, StepHint } from "@/components/marketing/pipeline-strip";
import { V2PermissionGate } from "@/components/PermissionGate";
import { useUnreadComments } from "@/components/shell/AppRail";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/marketing/published")({
  component: () => (
    <V2PermissionGate permission="marketing.view" scope="all">
      <PublishedLayout />
    </V2PermissionGate>
  ),
});

function PublishedLayout() {
  const { t } = useTranslation("marketing");
  const { pathname } = useLocation();
  const { data: unread = 0 } = useUnreadComments(true);
  const tabs = [
    { to: "/marketing/published", label: t("published.tabs.posts"), active: !/\/published\/(comments|insights)/.test(pathname) },
    { to: "/marketing/published/comments", label: t("published.tabs.comments"), active: pathname.includes("/published/comments"), badge: unread },
    { to: "/marketing/published/insights", label: t("published.tabs.insights"), active: pathname.includes("/published/insights") },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("published.title")}</h1>
        <StepHint step="published" />
      </div>
      <ModuleSubnav moduleId="marketing" />
      <PipelineStrip current="published" />
      <div role="tablist" className="flex flex-wrap gap-1">
        {tabs.map((x) => (
          <Link key={x.to} to={x.to as never} role="tab" aria-selected={x.active}
            className={cn("rounded-md px-3 py-1.5 text-sm", x.active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {x.label}
            {!!x.badge && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{x.badge}</span>}
          </Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
