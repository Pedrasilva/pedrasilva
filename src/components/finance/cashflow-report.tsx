import { useMemo, useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  useCashFlowReport,
  CASHFLOW_YEAR,
  type MonthCell,
  type ReceivableRow,
  type VatMode,
} from "@/lib/finance/use-cashflow-report";

const DASH = "—";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);

const cell = (v: number) => (Math.abs(v) < 0.5 ? DASH : fmt(v));

type Segment = "all" | "received" | "issued" | "future";

const SEGMENT_COLOR: Record<"received" | "issued" | "future", string> = {
  received: "bg-emerald-600",
  issued: "bg-amber-500",
  future: "bg-sky-500",
};

const SEGMENT_TEXT: Record<"received" | "issued" | "future", string> = {
  received: "text-emerald-700",
  issued: "text-amber-600",
  future: "text-sky-600",
};

function segmentValue(m: MonthCell, seg: Segment) {
  if (seg === "all") return m.received + m.issued + m.future;
  return m[seg];
}

function SegmentBar({ m }: { m: MonthCell }) {
  const total = m.received + m.issued + m.future;
  if (total <= 0) return null;
  return (
    <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-full bg-muted">
      {(["received", "issued", "future"] as const).map((s) =>
        m[s] > 0 ? (
          <div
            key={s}
            className={SEGMENT_COLOR[s]}
            style={{ width: `${(m[s] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function MonthValueCell({
  m,
  seg,
  isFuture,
  labels,
}: {
  m: MonthCell;
  seg: Segment;
  isFuture: boolean;
  labels: Record<"received" | "issued" | "future", string>;
}) {
  const value = segmentValue(m, seg);
  const body = (
    <div className="min-w-[72px]">
      <div
        className={cn(
          "text-right tabular-nums",
          isFuture && "italic text-muted-foreground",
          seg !== "all" && !isFuture && SEGMENT_TEXT[seg],
        )}
      >
        {cell(value)}
      </div>
      {seg === "all" ? <SegmentBar m={m} /> : null}
    </div>
  );
  if (value <= 0) return body;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{body}</div>
      </TooltipTrigger>
      <TooltipContent className="space-y-0.5 text-xs">
        {(["received", "issued", "future"] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", SEGMENT_COLOR[s])} />
            <span className="w-28">{labels[s]}</span>
            <span className="tabular-nums">{fmt(m[s])}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

export function CashFlowReport({ vatMode }: { vatMode: VatMode }) {
  const { t } = useTranslation(["finance", "common"]);
  const qc = useQueryClient();
  const { report, isLoading } = useCashFlowReport(vatMode);
  const [seg, setSeg] = useState<Segment>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [catDialog, setCatDialog] = useState<{
    open: boolean;
    id: string | null;
    name: string;
  }>({ open: false, id: null, name: "" });

  const labels = useMemo(
    () => ({
      received: t("finance:cashFlow.segment.received"),
      issued: t("finance:cashFlow.segment.issued"),
      future: t("finance:cashFlow.segment.future"),
    }),
    [t],
  );

  const saveCategory = useMutation({
    mutationFn: async ({ id, name }: { id: string | null; name: string }) => {
      if (id) {
        const { error } = await supabase
          .from("cost_categories")
          .update({ name })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cost_categories")
          .insert({ name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "cashflow-report-raw"] });
      qc.invalidateQueries({ queryKey: ["finance", "cost-categories"] });
      setCatDialog({ open: false, id: null, name: "" });
      toast.success(t("common:saved", { defaultValue: "Saved" }));
    },
    onError: (e: unknown) => toast.error(String((e as Error).message ?? e)),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cost_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "cashflow-report-raw"] });
      qc.invalidateQueries({ queryKey: ["finance", "cost-categories"] });
    },
    onError: (e: unknown) => toast.error(String((e as Error).message ?? e)),
  });

  if (isLoading || !report) {
    return (
      <div className="text-sm text-muted-foreground">{t("common:loading")}</div>
    );
  }

  const { months } = report;
  const rowTotal = (cells: MonthCell[]) =>
    cells.reduce((s, m) => s + segmentValue(m, seg), 0);
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

  const renderReceivableRow = (
    row: ReceivableRow,
    depth: number,
  ): JSX.Element => {
    const isOpen = expanded[row.key];
    const hasChildren = (row.children?.length ?? 0) > 0;
    return (
      <>
        <tr key={row.key} className="border-b hover:bg-muted/40">
          <td
            className="sticky left-0 z-10 bg-background px-2 py-1.5"
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <div className="flex items-center gap-1.5">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((p) => ({ ...p, [row.key]: !p[row.key] }))
                  }
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={row.label}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-3.5" />
              )}
              <span
                className={cn(
                  "truncate text-sm",
                  depth === 0 ? "font-medium" : "text-muted-foreground",
                )}
                title={row.label}
              >
                {row.label || t("finance:cashFlow.unassignedClient")}
              </span>
              {row.outstanding > 0.5 ? (
                <Badge
                  variant="outline"
                  className="border-rose-300 text-[10px] text-rose-600"
                >
                  {t("finance:cashFlow.outstandingBadge", {
                    amount: fmt(row.outstanding),
                  })}
                </Badge>
              ) : null}
            </div>
          </td>
          {row.months.map((m, i) => (
            <td key={i} className="px-2 py-1.5 text-right text-xs">
              <MonthValueCell
                m={m}
                seg={seg}
                isFuture={months[i].isFuture}
                labels={labels}
              />
            </td>
          ))}
          <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">
            {cell(rowTotal(row.months))}
          </td>
        </tr>
        {isOpen
          ? row.children?.map((c) => renderReceivableRow(c, depth + 1))
          : null}
      </>
    );
  };

  const headerCells = (
    <tr className="border-b bg-muted/50">
      <th className="sticky left-0 z-10 bg-muted/50 px-2 py-2 text-left text-xs font-medium">
        {t("finance:cashFlow.col.client")}
      </th>
      {months.map((m) => (
        <th
          key={m.month}
          className={cn(
            "px-2 py-2 text-right text-xs font-medium capitalize",
            m.isFuture && "text-muted-foreground",
          )}
        >
          {m.label}
        </th>
      ))}
      <th className="px-2 py-2 text-right text-xs font-medium">
        {t("finance:cashFlow.footer.totals")}
      </th>
    </tr>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        {/* Receivables ------------------------------------------------ */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="font-display text-lg">
                {t("finance:cashFlow.receivablesTitle")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("finance:cashFlow.receivablesSubtitle", {
                  year: CASHFLOW_YEAR,
                })}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                {(["received", "issued", "future"] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn("h-2 w-2 rounded-full", SEGMENT_COLOR[s])}
                    />
                    {labels[s]}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(["all", "received", "issued", "future"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={seg === s ? "secondary" : "ghost"}
                  onClick={() => setSeg(s)}
                >
                  {s === "all" ? t("finance:cashFlow.segment.all") : labels[s]}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>{headerCells}</thead>
              <tbody>
                {report.clients.length === 0 ? (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-2 py-6 text-center text-sm text-muted-foreground"
                    >
                      {t("finance:cashFlow.noReceivables")}
                    </td>
                  </tr>
                ) : (
                  report.clients.map((r) => renderReceivableRow(r, 0))
                )}
              </tbody>
              <tfoot>
                {(["received", "issued", "future"] as const).map((s) => (
                  <tr key={s} className="border-t">
                    <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            SEGMENT_COLOR[s],
                          )}
                        />
                        {labels[s]}
                      </span>
                    </td>
                    {report.segmentTotals[s].map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-2 py-1.5 text-right text-xs tabular-nums",
                          s === "future" && "italic",
                        )}
                      >
                        {cell(v)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">
                      {cell(sum(report.segmentTotals[s]))}
                    </td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {/* Costs ------------------------------------------------------ */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="font-display text-lg">
                {t("finance:cashFlow.costsTitle")}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("finance:cashFlow.costsSubtitle")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCatDialog({ open: true, id: null, name: "" })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("finance:cashFlow.addCategory")}
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-2 py-2 text-left text-xs font-medium">
                    {t("finance:cashFlow.col.category")}
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.month}
                      className={cn(
                        "px-2 py-2 text-right text-xs font-medium capitalize",
                        m.isFuture && "text-muted-foreground",
                      )}
                    >
                      {m.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right text-xs font-medium">
                    {t("finance:cashFlow.footer.totals")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.costs.map((row) => {
                  const values = months.map((m, i) =>
                    m.isFuture ? row.forecast[i] : row.actual[i],
                  );
                  return (
                    <tr key={row.key} className="border-b hover:bg-muted/40">
                      <td className="sticky left-0 z-10 bg-background px-2 py-1.5">
                        <div className="group flex items-center gap-1.5">
                          <span className="text-sm">{row.label}</span>
                          <button
                            type="button"
                            className="text-muted-foreground opacity-0 transition group-hover:opacity-100"
                            aria-label={t("finance:cashFlow.renameCategory")}
                            onClick={() =>
                              setCatDialog({
                                open: true,
                                id: row.categoryId,
                                name: row.label,
                              })
                            }
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {!row.isDefault && row.categoryId ? (
                            <button
                              type="button"
                              className="text-muted-foreground opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                              aria-label={t("finance:cashFlow.deleteCategory")}
                              onClick={() =>
                                deleteCategory.mutate(row.categoryId!)
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      {values.map((v, i) => (
                        <td
                          key={i}
                          className={cn(
                            "px-2 py-1.5 text-right text-xs tabular-nums",
                            months[i].isFuture
                              ? "italic text-muted-foreground"
                              : "text-rose-700",
                          )}
                        >
                          {cell(v)}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">
                        {cell(sum(values))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="sticky left-0 z-10 bg-muted/30 px-2 py-1.5 text-xs font-medium">
                    {t("finance:cashFlow.totalCosts")}
                  </td>
                  {report.costTotals.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-2 py-1.5 text-right text-xs font-medium tabular-nums",
                        months[i].isFuture && "italic",
                      )}
                    >
                      {cell(v)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right text-xs font-semibold tabular-nums">
                    {cell(sum(report.costTotals))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {/* Net -------------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">
              {t("finance:cashFlow.netTitle")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("finance:cashFlow.netNote")}
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="sticky left-0 z-10 bg-muted/50 px-2 py-2 text-left text-xs font-medium">
                    {t("finance:cashFlow.col.month")}
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.month}
                      className={cn(
                        "px-2 py-2 text-right text-xs font-medium capitalize",
                        m.isFuture && "text-muted-foreground",
                      )}
                    >
                      {m.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right text-xs font-medium">
                    {t("finance:cashFlow.footer.totals")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["opening", report.opening],
                    ["net", report.net],
                    ["closing", report.closing],
                  ] as const
                ).map(([key, arr]) => (
                  <tr key={key} className="border-b">
                    <td className="sticky left-0 z-10 bg-background px-2 py-1.5 text-xs font-medium">
                      {t(`finance:cashFlow.col.${key}`)}
                    </td>
                    {arr.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-2 py-1.5 text-right text-xs tabular-nums",
                          months[i].isFuture && "italic text-muted-foreground",
                          key === "net" &&
                            !months[i].isFuture &&
                            (v >= 0 ? "text-emerald-700" : "text-rose-700"),
                        )}
                      >
                        {cell(v)}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right text-xs font-medium tabular-nums">
                      {key === "net" ? cell(sum(report.net)) : DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.totalOutstanding > 0.5 ? (
              <p className="mt-3 text-xs text-rose-600">
                {t("finance:cashFlow.outstandingNote", {
                  amount: fmt(report.totalOutstanding),
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Dialog
          open={catDialog.open}
          onOpenChange={(o) => setCatDialog((p) => ({ ...p, open: o }))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {catDialog.id
                  ? t("finance:cashFlow.renameCategory")
                  : t("finance:cashFlow.addCategory")}
              </DialogTitle>
            </DialogHeader>
            <Input
              value={catDialog.name}
              onChange={(e) =>
                setCatDialog((p) => ({ ...p, name: e.target.value }))
              }
              placeholder={t("finance:cashFlow.categoryNamePlaceholder")}
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setCatDialog({ open: false, id: null, name: "" })}
              >
                {t("common:cancel")}
              </Button>
              <Button
                disabled={!catDialog.name.trim() || saveCategory.isPending}
                onClick={() =>
                  saveCategory.mutate({
                    id: catDialog.id,
                    name: catDialog.name.trim(),
                  })
                }
              >
                {t("common:save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
