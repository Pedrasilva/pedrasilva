import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useInventoryAssets,
  useInventoryCategories,
  usePendingInventoryInvoices,
} from "@/lib/inventory/use-inventory";
import {
  indicativeDepreciatedValue,
  isActive,
  isDueForReplacement,
  warrantyExpiringWithin,
} from "@/lib/inventory/types";

export const Route = createFileRoute("/_app/inventory/")({
  component: InventoryDashboard,
});

const eur = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v || 0);

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function InventoryDashboard() {
  const { t } = useTranslation(["inventory", "common"]);
  const { data: assets = [] } = useInventoryAssets();
  const { data: categories = [] } = useInventoryCategories();
  const { data: pendingInvoices = [] } = usePendingInventoryInvoices();

  const stats = useMemo(() => {
    const active = assets.filter(isActive);
    return {
      active: active.length,
      purchase: active.reduce((s, a) => s + (a.purchase_price_ex_vat ?? 0), 0),
      current: active.reduce((s, a) => s + indicativeDepreciatedValue(a), 0),
      inUse: active.filter((a) => a.status === "in_use").length,
      availableSpare: active.filter((a) => a.status === "available" || a.status === "spare").length,
      people: active.filter((a) => a.custody_mode === "person" && a.assigned_collaborator_id).length,
      shared: active.filter((a) => a.custody_mode !== "person").length,
      repair: active.filter((a) => a.status === "repair").length,
      due: active.filter((a) => isDueForReplacement(a)).length,
      warranty: active.filter((a) => warrantyExpiringWithin(a, 90)).length,
    };
  }, [assets]);

  const byCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets.filter(isActive))
      counts.set(a.category_id, (counts.get(a.category_id) ?? 0) + 1);
    return categories
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [assets, categories]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label={t("inventory:dashboard.totalAssets")} value={stats.active} />
        <Kpi label={t("inventory:dashboard.purchaseValue")} value={eur(stats.purchase)} />
        <Kpi label={t("inventory:dashboard.currentValue")} value={eur(stats.current)} />
        <Kpi label={t("inventory:dashboard.inUse")} value={stats.inUse} />
        <Kpi label={t("inventory:dashboard.availableSpare")} value={stats.availableSpare} />
        <Kpi label={t("inventory:dashboard.assignedToPeople")} value={stats.people} />
        <Kpi label={t("inventory:dashboard.shared")} value={stats.shared} />
        <Kpi label={t("inventory:dashboard.inRepair")} value={stats.repair} />
        <Kpi label={t("inventory:dashboard.dueReplacement")} value={stats.due} />
        <Kpi label={t("inventory:dashboard.warrantyExpiring")} value={stats.warranty} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inventory:dashboard.byCategory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {byCategory.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("inventory:register.empty")}</p>
            )}
            {byCategory.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.name}
                </span>
                <Badge variant="secondary">{c.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("inventory:dashboard.pendingInvoices")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("inventory:dashboard.noPendingInvoices")}
              </p>
            )}
            {pendingInvoices.map((d) => (
              <div key={d.id as string} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {(d.counterparty_name_snapshot as string) ?? "—"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {(d.document_number as string) ?? "—"} ·{" "}
                    {d.inventory_status === "partially_processed"
                      ? t("inventory:invoice.statusPartial")
                      : t("inventory:invoice.statusPending")}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/finance/documents/$documentId"
                    params={{ documentId: d.id as string }}
                  >
                    {t("inventory:dashboard.review")}
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
