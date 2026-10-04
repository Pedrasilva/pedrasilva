import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Clock, PieChart, Scale, TrendingUp } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { V2PermissionGate } from "@/components/PermissionGate";

export const Route = createFileRoute("/_app/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — PSA Hub" },
      { name: "description", content: "Studio reports: hours logged and more." },
      { property: "og:title", content: "Reports — PSA Hub" },
      { property: "og:description", content: "Studio reports: hours logged and more." },
    ],
  }),
  component: ReportsIndex,
});

const REPORTS = [
  { to: "/reports/hours", key: "hours", icon: Clock },
  { to: "/reports/business", key: "business", icon: TrendingUp },
  { to: "/reports/budget", key: "budget", icon: PieChart },
  { to: "/reports/billable", key: "billable", icon: Scale },
] as const;

function ReportsIndex() {
  const { t } = useTranslation("reports");
  return (
    <V2PermissionGate permission="reports.view" scope="all">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("index.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("index.subtitle")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <Link key={r.key} to={r.to} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors hover:bg-accent/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <r.icon className="h-4 w-4" aria-hidden="true" />
                    {t(`index.cards.${r.key}.title`)}
                  </CardTitle>
                  <CardDescription>{t(`index.cards.${r.key}.description`)}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </V2PermissionGate>
  );
}
