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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("workspace.external.title")}</CardTitle>
            <div className="text-sm text-muted-foreground">
              {t("workspace.external.totals", {
                cost: formatEUR(totals.cost),
                revenue: formatEUR(totals.revenue),
              })}
            </div>
          </div>
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
                <TableHead className="text-right">{t("workspace.external.salePrice")}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.description}</TableCell>
                  <TableCell>{resolveSupplierLabel(s.supplier, null)}</TableCell>
                  <TableCell>
                    {s.stage_id ? stages.find((st) => st.id === s.stage_id)?.name ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-right">{s.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatEUR(Number(s.purchase_price))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEUR(Number(s.sale_price))}
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
              ))}
              {services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
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
