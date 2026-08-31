import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { AssetFormDialog } from "@/components/inventory/asset-form-dialog";
import { useInventoryAssets, useInventoryCategories } from "@/lib/inventory/use-inventory";
import { useCollaboratorsList } from "@/lib/hr/use-collaborators";
import { ASSET_STATUSES, indicativeDepreciatedValue } from "@/lib/inventory/types";

export const Route = createFileRoute("/_app/inventory/assets/")({
  component: AssetRegister,
});

const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

function AssetRegister() {
  const { t } = useTranslation(["inventory", "common"]);
  const { data: assets = [], isLoading } = useInventoryAssets();
  const { data: categories = [] } = useInventoryCategories();
  const { data: collaborators = [] } = useCollaboratorsList({ status: "all" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const nameById = useMemo(
    () => new Map(collaborators.map((c) => [c.id as string, (c as { nome: string }).nome])),
    [collaborators],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (category !== "all" && a.category_id !== category) return false;
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      return [a.asset_code, a.name, a.serial_number, a.brand, a.model]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [assets, search, category, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("inventory:register.search")}
          className="h-9 w-full sm:w-64"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("inventory:register.allCategories")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} · {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("inventory:register.allStatuses")}</SelectItem>
            {ASSET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`inventory:status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("inventory:register.count", { count: rows.length })}
          </span>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t("inventory:register.newAsset")}
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("inventory:asset.code")}</TableHead>
              <TableHead>{t("inventory:asset.name")}</TableHead>
              <TableHead>{t("inventory:asset.category")}</TableHead>
              <TableHead>{t("inventory:asset.status")}</TableHead>
              <TableHead>{t("inventory:asset.assignedTo")}</TableHead>
              <TableHead className="text-right">{t("inventory:asset.purchasePriceEx")}</TableHead>
              <TableHead className="text-right">
                {t("inventory:asset.depreciatedValue")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  {t("inventory:register.empty")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">
                  <Link
                    to="/inventory/assets/$assetId"
                    params={{ assetId: a.id }}
                    className="hover:underline"
                  >
                    {a.asset_code}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    to="/inventory/assets/$assetId"
                    params={{ assetId: a.id }}
                    className="hover:underline"
                  >
                    {a.name}
                  </Link>
                  {a.serial_number && (
                    <span className="ml-2 text-xs text-muted-foreground">{a.serial_number}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{catById.get(a.category_id)?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{t(`inventory:status.${a.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {a.custody_mode === "person"
                    ? (a.assigned_collaborator_id && nameById.get(a.assigned_collaborator_id)) || "—"
                    : a.location || t(`inventory:custody.${a.custody_mode}`)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {eur(a.purchase_price_ex_vat)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {eur(indicativeDepreciatedValue(a))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AssetFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
