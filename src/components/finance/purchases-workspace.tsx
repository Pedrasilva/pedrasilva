/**
 * Purchases workspace — list of supplier invoices / credit notes (received docs).
 *
 * Source of truth: `financial_documents` filtered by direction='received'.
 * Opens `PurchaseEditorDialog` for create/edit.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, Loader2, FileText, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  useFinDocuments,
  useFinSuppliers,
  type FinDocStatus,
} from "@/lib/finance/use-documents";
import { PurchaseEditorDialog } from "./purchase-editor-dialog";
import { cn } from "@/lib/utils";

const STATUS_LIST: FinDocStatus[] = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);

export function PurchasesWorkspace() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FinDocStatus | "all">("all");
  const [supplierFilter, setSupplierFilter] = useState<string | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const suppliersQ = useFinSuppliers();
  const docsQ = useFinDocuments({
    direction: "received",
    status: statusFilter === "all" ? null : statusFilter,
    supplierId: supplierFilter === "all" ? null : supplierFilter,
    search: search.trim() || null,
  });

  const supplierName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliersQ.data ?? []) map.set(s.id, s.name);
    return map;
  }, [suppliersQ.data]);

  const summary = useMemo(() => {
    const rows = docsQ.data ?? [];
    let total = 0;
    let outstanding = 0;
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const r of rows) {
      if (r.status === "cancelled") continue;
      total += Number(r.total_inc_vat);
      outstanding += Number(r.outstanding_amount ?? 0);
      if (
        r.due_date &&
        r.due_date < today &&
        Number(r.outstanding_amount ?? 0) > 0
      ) {
        overdue += Number(r.outstanding_amount ?? 0);
      }
    }
    return { total, outstanding, overdue, count: rows.length };
  }, [docsQ.data]);

  function openEditor(id: string | null) {
    setEditingId(id);
    setEditorOpen(true);
  }
  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
  }

  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label={t("finance:purchases.kpi.count")}
          value={String(summary.count)}
        />
        <Kpi
          label={t("finance:purchases.kpi.total")}
          value={fmt(summary.total)}
        />
        <Kpi
          label={t("finance:purchases.kpi.outstanding")}
          value={fmt(summary.outstanding)}
        />
        <Kpi
          label={t("finance:purchases.kpi.overdue")}
          value={fmt(summary.overdue)}
          tone={summary.overdue > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t("finance:purchases.title")}</CardTitle>
            <CardDescription>
              {t("finance:purchases.subtitle")}
            </CardDescription>
          </div>
          <Button onClick={() => openEditor(null)} size="sm">
            <Plus className="size-4 mr-1" />
            {t("finance:purchases.new")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("finance:purchases.searchPlaceholder") as string}
                className="pl-8"
              />
            </div>
            <Select
              value={supplierFilter}
              onValueChange={(v) => setSupplierFilter(v as string)}
            >
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue
                  placeholder={t("finance:purchases.allSuppliers")}
                />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value="all">
                  {t("finance:purchases.allSuppliers")}
                </SelectItem>
                {(suppliersQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as FinDocStatus | "all")
              }
            >
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("finance:purchases.allStatuses")}
                </SelectItem>
                {STATUS_LIST.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`finance:purchases.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {docsQ.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin mr-1" />
              {t("common:loading")}
            </div>
          ) : (docsQ.data ?? []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground border rounded-md">
              <FileText className="size-6 mx-auto mb-2 opacity-50" />
              {t("finance:purchases.empty")}
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">
                      {t("finance:purchases.col.issueDate")}
                    </TableHead>
                    <TableHead>{t("finance:purchases.col.supplier")}</TableHead>
                    <TableHead>{t("finance:purchases.col.number")}</TableHead>
                    <TableHead className="w-[120px]">
                      {t("finance:purchases.col.due")}
                    </TableHead>
                    <TableHead className="text-right w-[130px]">
                      {t("finance:purchases.col.total")}
                    </TableHead>
                    <TableHead className="text-right w-[130px]">
                      {t("finance:purchases.col.outstanding")}
                    </TableHead>
                    <TableHead className="w-[130px]">
                      {t("finance:purchases.col.status")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(docsQ.data ?? []).map((d) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isOverdue =
                      d.due_date &&
                      d.due_date < today &&
                      Number(d.outstanding_amount ?? 0) > 0 &&
                      d.status !== "cancelled";
                    return (
                      <TableRow
                        key={d.id}
                        className="cursor-pointer"
                        onClick={() => openEditor(d.id)}
                      >
                        <TableCell className="text-sm tabular-nums">
                          {new Date(d.issue_date).toLocaleDateString(
                            dateLocale,
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {d.counterparty_supplier_id
                            ? supplierName.get(d.counterparty_supplier_id) ??
                              d.counterparty_name_snapshot ??
                              "—"
                            : d.counterparty_name_snapshot ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {d.document_number ?? "—"}
                          {d.external_reference ? (
                            <span className="ml-1 text-xs">
                              · {d.external_reference}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {d.due_date ? (
                            <span
                              className={cn(
                                isOverdue && "text-destructive font-medium",
                              )}
                            >
                              {new Date(d.due_date).toLocaleDateString(
                                dateLocale,
                              )}
                              {isOverdue && (
                                <AlertCircle className="inline size-3 ml-1" />
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(Number(d.total_inc_vat))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span
                            className={
                              Number(d.outstanding_amount ?? 0) > 0
                                ? "font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {fmt(Number(d.outstanding_amount ?? 0))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={d.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <PurchaseEditorDialog
        open={editorOpen}
        documentId={editingId}
        onClose={closeEditor}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "warning" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation(["finance"]);
  const map: Record<
    string,
    {
      variant: "default" | "secondary" | "outline" | "destructive";
      cls?: string;
    }
  > = {
    draft: { variant: "outline" },
    issued: { variant: "secondary" },
    partially_paid: {
      variant: "secondary",
      cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    },
    paid: {
      variant: "default",
      cls: "bg-emerald-600 hover:bg-emerald-600",
    },
    cancelled: { variant: "destructive" },
  };
  const cfg = map[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className={cfg.cls}>
      {t(`finance:purchases.status.${status}`)}
    </Badge>
  );
}
