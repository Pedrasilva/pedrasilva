import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInventoryAssets, useInventoryCategories } from "@/lib/inventory/use-inventory";
import { isActive } from "@/lib/inventory/types";

/**
 * Equipment currently in a collaborator's custody. Read-only summary; custody
 * changes happen in the Inventory module so history stays canonical.
 */
export function CollaboratorAssetsCard({ collaboratorId }: { collaboratorId: string }) {
  const { t } = useTranslation(["inventory"]);
  const { data: assets = [] } = useInventoryAssets();
  const { data: categories = [] } = useInventoryCategories();

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const mine = useMemo(
    () =>
      assets.filter(
        (a) => a.assigned_collaborator_id === collaboratorId && a.custody_mode === "person" && isActive(a),
      ),
    [assets, collaboratorId],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{t("inventory:hr.cardTitle")}</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/inventory/assets">{t("inventory:hr.manage")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {mine.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("inventory:hr.empty")}</p>
        )}
        {mine.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <Link
              to="/inventory/assets/$assetId"
              params={{ assetId: a.id }}
              className="min-w-0 truncate hover:underline"
            >
              <span className="font-mono text-xs text-muted-foreground">{a.asset_code}</span>{" "}
              {a.name}
            </Link>
            <Badge variant="secondary">{catById.get(a.category_id)?.code ?? "—"}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
