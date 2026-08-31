import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  useCreateAssetsFromInvoice,
  useInventoryCategories,
  useInvoiceForInventory,
  useSetLineSkipped,
  type InvoiceLine,
  type LineAssetPlan,
} from "@/lib/inventory/use-inventory";
import { TRACKING_LEVELS, suggestCategoryCode, type TrackingLevel } from "@/lib/inventory/types";

type LineDraft = {
  create: boolean;
  name: string;
  categoryId: string;
  trackingLevel: TrackingLevel;
  count: number;
  depreciationYears: number;
  replacementYears: number;
};

const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

/**
 * Finance → Inventory review step.
 *
 * Reads the invoice lines already captured by Finance and lets the user decide,
 * line by line, which of them become physical assets. No expense is ever
 * created here; the invoice remains the single financial record.
 */
export function InvoiceInventoryDialog({
  documentId,
  open,
  onOpenChange,
}: {
  documentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["inventory", "common"]);
  const { data: invoice, isLoading } = useInvoiceForInventory(open ? documentId : undefined);
  const { data: categories = [] } = useInventoryCategories();
  const createAssets = useCreateAssetsFromInvoice();
  const setSkipped = useSetLineSkipped();
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});

  const catByCode = useMemo(() => new Map(categories.map((c) => [c.code, c])), [categories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const remainingFor = (line: InvoiceLine) => {
    const p = invoice?.processing[line.id];
    const total = Number(p?.quantity_total ?? line.quantity ?? 1);
    const done = Number(p?.quantity_processed ?? 0);
    return { total, done, remaining: Math.max(0, total - done), next: (p?.max_unit_index ?? 0) + 1 };
  };

  useEffect(() => {
    if (!open || !invoice || categories.length === 0) return;
    const next: Record<string, LineDraft> = {};
    for (const line of invoice.lines) {
      const cat = catByCode.get(suggestCategoryCode(line.description ?? "")) ?? catByCode.get("OTH");
      const { remaining } = remainingFor(line);
      next[line.id] = {
        create: remaining > 0,
        name: (line.description ?? "").trim().slice(0, 120) || "Asset",
        categoryId: cat?.id ?? categories[0].id,
        trackingLevel: cat?.default_tracking_level ?? "standard",
        count: remaining,
        depreciationYears: cat?.default_depreciation_years ?? 4,
        replacementYears: cat?.default_replacement_years ?? 5,
      };
    }
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice, categories]);

  const patch = (id: string, p: Partial<LineDraft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }));

  const onCategory = (id: string, categoryId: string) => {
    const c = catById.get(categoryId);
    patch(id, {
      categoryId,
      trackingLevel: c?.default_tracking_level ?? "standard",
      depreciationYears: c?.default_depreciation_years ?? 4,
      replacementYears: c?.default_replacement_years ?? 5,
    });
  };

  const totalToCreate = useMemo(
    () => Object.values(drafts).reduce((s, d) => s + (d?.create ? d.count : 0), 0),
    [drafts],
  );

  const confirm = async () => {
    if (!invoice) return;
    const plans: LineAssetPlan[] = [];
    for (const line of invoice.lines) {
      const d = drafts[line.id];
      if (!d?.create || d.count <= 0) continue;
      const { remaining, next } = remainingFor(line);
      const count = Math.min(d.count, remaining);
      if (count <= 0) continue;
      const cat = catById.get(d.categoryId);
      plans.push({
        line,
        count,
        startIndex: next,
        name: d.name.trim() || (line.description ?? "Asset"),
        categoryId: d.categoryId,
        categoryCode: cat?.code ?? "OTH",
        trackingLevel: d.trackingLevel,
        depreciationYears: d.depreciationYears,
        replacementYears: d.replacementYears,
      });
    }
    try {
      const created = await createAssets.mutateAsync({ invoice, plans });
      toast.success(t("inventory:invoice.created", { count: created.length }));
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("inventory:invoice.reviewTitle")}</DialogTitle>
          <DialogDescription>{t("inventory:invoice.reviewIntro")}</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">{t("common:loading")}</p>}
        {!isLoading && invoice && invoice.lines.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("inventory:invoice.noLines")}</p>
        )}

        {invoice && invoice.lines.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{t("inventory:invoice.description")}</TableHead>
                <TableHead className="w-16 text-right">{t("inventory:invoice.qty")}</TableHead>
                <TableHead className="w-28 text-right">
                  {t("inventory:invoice.unitPrice")}
                </TableHead>
                <TableHead className="w-56">{t("inventory:asset.category")}</TableHead>
                <TableHead className="w-44">{t("inventory:asset.trackingLevel")}</TableHead>
                <TableHead className="w-24 text-right">{t("inventory:invoice.toCreate")}</TableHead>
                <TableHead className="w-36">{t("inventory:invoice.skipColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => {
                const d = drafts[line.id];
                const { total, done, remaining } = remainingFor(line);
                if (!d) return null;
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Checkbox
                        checked={d.create && !invoice.skipped[line.id]}
                        disabled={remaining <= 0 || !!invoice.skipped[line.id]}
                        onCheckedChange={(v) => patch(line.id, { create: !!v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={d.name}
                        onChange={(e) => patch(line.id, { name: e.target.value })}
                        className="h-8"
                      />
                      {done > 0 && (
                        <Badge variant="secondary" className="mt-1 text-[11px]">
                          {remaining === 0
                            ? t("inventory:invoice.allProcessed")
                            : t("inventory:invoice.processed", { done, total })}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{total}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {eur(line.unit_price_ex_vat)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={d.categoryId}
                        onValueChange={(v) => onCategory(line.id, v)}
                        disabled={!d.create}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code} · {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={d.trackingLevel}
                        onValueChange={(v) =>
                          patch(line.id, { trackingLevel: v as TrackingLevel })
                        }
                        disabled={!d.create}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRACKING_LEVELS.map((l) => (
                            <SelectItem key={l} value={l}>
                              {t(`inventory:tracking.${l}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={remaining}
                        value={d.count}
                        disabled={!d.create || remaining <= 0}
                        onChange={(e) =>
                          patch(line.id, {
                            count: Math.max(0, Math.min(remaining, Number(e.target.value) || 0)),
                          })
                        }
                        className="h-8 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={!!invoice.skipped[line.id]}
                          disabled={setSkipped.isPending}
                          onCheckedChange={(v) => {
                            const skip = !!v;
                            if (skip) patch(line.id, { create: false });
                            setSkipped.mutate({
                              documentId: invoice.id,
                              lineId: line.id,
                              skipped: skip,
                            });
                          }}
                        />
                        {invoice.skipped[line.id]
                          ? t("inventory:invoice.skippedBadge")
                          : t("inventory:invoice.skipAction")}
                      </label>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button onClick={confirm} disabled={createAssets.isPending || totalToCreate === 0}>
            {t("inventory:invoice.confirm")} ({totalToCreate})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
