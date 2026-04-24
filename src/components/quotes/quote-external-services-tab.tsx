/**
 * Quote External Services tab.
 * Reuses SupplierPicker. Inline form (lighter than the project-side dialog
 * because quote line items are usually edited in bulk).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SupplierPicker } from "@/components/projects/supplier-picker";
import { resolveSupplierLabel } from "@/lib/projects/use-suppliers";
import {
  useQuoteExternalServices,
  useUpsertQuoteExternalService,
  useDeleteQuoteExternalService,
} from "@/lib/quotes/use-quote-external-services";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import {
  QUOTE_EXTERNAL_SERVICE_STATUSES,
  type QuoteMarkupType,
  type QuoteExternalServiceStatus,
} from "@/lib/quotes/types";
import { formatEUR } from "@/lib/crm/types";
import { externalServiceLine } from "@/lib/projects/financial-rollups";

export function QuoteExternalServicesTab({ quoteId }: { quoteId: string }) {
  const { t } = useTranslation("crm");
  const servicesQ = useQuoteExternalServices(quoteId);
  const stagesQ = useQuoteStages(quoteId);
  const upsert = useUpsertQuoteExternalService(quoteId);
  const remove = useDeleteQuoteExternalService(quoteId);
  const stages = stagesQ.data ?? [];
  const services = servicesQ.data ?? [];

  const [draft, setDraft] = useState({
    description: "",
    supplier_id: null as string | null,
    stage_id: "" as string,
    quantity: "1",
    unit_cost: "0",
    markup_type: "percent" as QuoteMarkupType,
    markup_value: "0",
    sale_price: "0",
    sale_price_manual: false,
    status: "draft" as QuoteExternalServiceStatus,
  });

  const previewSale = useMemo(() => {
    const cost = Number(draft.unit_cost) || 0;
    const qty = Number(draft.quantity) || 1;
    const totalCost = cost * qty;
    const mv = Number(draft.markup_value) || 0;
    if (draft.sale_price_manual) return Number(draft.sale_price) || 0;
    if (qty <= 0) return 0;
    return draft.markup_type === "percent"
      ? (totalCost * (1 + mv / 100)) / qty
      : (totalCost + mv) / qty;
  }, [draft]);

  const handleAdd = async () => {
    if (!draft.description.trim()) return toast.error(t("workspace.external.errorDesc"));
    try {
      await upsert.mutateAsync({
        quote_id: quoteId,
        description: draft.description.trim(),
        supplier_id: draft.supplier_id,
        stage_id: draft.stage_id || null,
        quantity: Number(draft.quantity) || 1,
        unit_cost: Number(draft.unit_cost) || 0,
        markup_type: draft.markup_type,
        markup_value: Number(draft.markup_value) || 0,
        sale_price: draft.sale_price_manual ? Number(draft.sale_price) || 0 : 0,
        sale_price_manual: draft.sale_price_manual,
        status: draft.status,
      });
      setDraft({
        description: "", supplier_id: null, stage_id: "", quantity: "1",
        unit_cost: "0", markup_type: "percent", markup_value: "0",
        sale_price: "0", sale_price_manual: false, status: "draft",
      });
      toast.success(t("workspace.external.created"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const totals = services.reduce(
    (acc, s) => {
      const line = externalServiceLine(s);
      acc.cost += line.cost;
      acc.revenue += line.revenue;
      return acc;
    },
    { cost: 0, revenue: 0 },
  );

  const totalProfit = totals.revenue - totals.cost;
  const totalMargin = totals.revenue > 0 ? totalProfit / totals.revenue : 0;

  return (
    <div className="space-y-6">
      {/* Totals strip — make cost vs sale vs profit unmistakable */}
      <Card>
        <CardContent className="grid gap-6 py-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("workspace.external.totalCost")}
            </span>
            <span className="text-xl font-semibold text-muted-foreground">
              {formatEUR(totals.cost)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("workspace.external.totalRevenue")}
            </span>
            <span className="text-xl font-semibold">{formatEUR(totals.revenue)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("workspace.external.totalProfit")}
            </span>
            <span
              className={`text-xl font-semibold ${
                totalProfit > 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : totalProfit < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground"
              }`}
            >
              {formatEUR(totalProfit)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("workspace.external.totalMargin")}
            </span>
            <span
              className={`text-xl font-semibold ${
                totalMargin >= 0.25
                  ? "text-emerald-600 dark:text-emerald-400"
                  : totalMargin >= 0.1
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {totals.revenue > 0 ? `${(totalMargin * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.external.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspace.external.description")}</TableHead>
                <TableHead>{t("workspace.external.supplier")}</TableHead>
                <TableHead>{t("common.stage")}</TableHead>
                <TableHead className="text-right">{t("workspace.external.qty")}</TableHead>
                <TableHead className="text-right">{t("workspace.external.unitCost")}</TableHead>
                <TableHead className="text-right">{t("workspace.external.markup")}</TableHead>
                <TableHead className="text-right">{t("workspace.external.salePrice")}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => {
                const purchase = Number(s.purchase_price);
                const sale = Number(s.sale_price);
                // Show how the sale price was reached: percent over cost, or
                // a flat per-unit fixed adder, plus a "manual" badge when the
                // user overrode the calculator.
                const markupLabel =
                  s.sale_price_manual
                    ? t("workspace.external.markupManual")
                    : s.markup_type === "percent"
                      ? `+${Number(s.markup_value).toFixed(0)}%`
                      : `+${formatEUR(Number(s.markup_value))}`;
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.description}</TableCell>
                    <TableCell>
                      {s.supplier_id || s.supplier?.name
                        ? resolveSupplierLabel(s.supplier, null)
                        : (
                          <span className="text-amber-600 dark:text-amber-400">
                            {t("workspace.external.noSupplier")}
                          </span>
                        )}
                    </TableCell>
                    <TableCell>
                      {s.stage_id ? stages.find((st) => st.id === s.stage_id)?.name ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="text-right">{s.quantity}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatEUR(purchase)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {markupLabel}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(sale)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(t("workspace.external.deleteConfirm"))) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    {t("workspace.external.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add new */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("workspace.external.addTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>{t("workspace.external.description")}</Label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              placeholder={t("workspace.external.descPlaceholder")}
            />
          </div>
          <div>
            <Label>{t("workspace.external.supplier")}</Label>
            <SupplierPicker
              value={draft.supplier_id}
              onChange={(id) => setDraft((p) => ({ ...p, supplier_id: id }))}
            />
          </div>
          <div>
            <Label>{t("common.stage")}</Label>
            <Select
              value={draft.stage_id || "none"}
              onValueChange={(v) => setDraft((p) => ({ ...p, stage_id: v === "none" ? "" : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("workspace.external.qty")}</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.quantity}
              onChange={(e) => setDraft((p) => ({ ...p, quantity: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("workspace.external.unitCost")}</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.unit_cost}
              onChange={(e) => setDraft((p) => ({ ...p, unit_cost: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t("workspace.external.markupType")}</Label>
            <Select
              value={draft.markup_type}
              onValueChange={(v) => setDraft((p) => ({ ...p, markup_type: v as QuoteMarkupType }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">{t("workspace.external.markupPercent")}</SelectItem>
                <SelectItem value="fixed">{t("workspace.external.markupFixed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("workspace.external.markupValue")}</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.markup_value}
              onChange={(e) => setDraft((p) => ({ ...p, markup_value: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Switch
              checked={draft.sale_price_manual}
              onCheckedChange={(v) => setDraft((p) => ({ ...p, sale_price_manual: v }))}
            />
            <Label className="!mb-0">{t("workspace.external.manualOverride")}</Label>
          </div>
          {draft.sale_price_manual && (
            <div>
              <Label>{t("workspace.external.salePrice")}</Label>
              <Input
                type="number"
                step="0.01"
                value={draft.sale_price}
                onChange={(e) => setDraft((p) => ({ ...p, sale_price: e.target.value }))}
              />
            </div>
          )}
          <div>
            <Label>{t("common.status")}</Label>
            <Select
              value={draft.status}
              onValueChange={(v) => setDraft((p) => ({ ...p, status: v as QuoteExternalServiceStatus }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUOTE_EXTERNAL_SERVICE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-center justify-between border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {t("workspace.external.previewSale", { value: formatEUR(previewSale) })}
            </div>
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> {t("common.create")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
