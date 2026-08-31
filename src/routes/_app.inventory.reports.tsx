import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInventoryAssets, useInventoryCategories } from "@/lib/inventory/use-inventory";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";
import { buildReportRows, exportRows, type ReportKey } from "@/lib/inventory/exports";

export const Route = createFileRoute("/_app/inventory/reports")({
  component: ReportsPage,
});

const REPORTS: ReportKey[] = [
  "full",
  "insurance",
  "byCollaborator",
  "byLocation",
  "replacement",
  "retired",
];

function ReportsPage() {
  const { t } = useTranslation(["inventory"]);
  const { data: assets = [] } = useInventoryAssets();
  const { data: categories = [] } = useInventoryCategories();
  const { data: collaborators = [] } = useCollaboratorsList({ status: "all" });

  const ctx = useMemo(
    () => ({
      categories: new Map(categories.map((c) => [c.id, c])),
      collaborators: new Map(
        collaborators.map((c) => [c.id as string, (c as { nome: string }).nome]),
      ),
    }),
    [categories, collaborators],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{t("inventory:reports.title")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((key) => {
          const rows = buildReportRows(key, assets, ctx);
          const filename = `PSA-inventory-${key}-${new Date().toISOString().slice(0, 10)}`;
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t(`inventory:reports.${key}`)}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("inventory:reports.rows", { count: rows.length })}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rows.length === 0}
                    onClick={() => exportRows(rows, filename, "xlsx")}
                  >
                    {t("inventory:reports.downloadXlsx")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rows.length === 0}
                    onClick={() => exportRows(rows, filename, "csv")}
                  >
                    {t("inventory:reports.downloadCsv")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
