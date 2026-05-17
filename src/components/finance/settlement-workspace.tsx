/**
 * Settlement workspace — shared UI for supplier payments (outflows) and
 * client receipts (inflows). Both flows operate on the same canonical model:
 * `financial_documents` ↔ `financial_document_payments`.
 *
 * Direction switches:
 *   - "received" => supplier payments (outflows)
 *   - "issued"   => client receipts (inflows)
 *
 * The DB trigger `trg_findoc_pay_recalc` recomputes `paid_amount` and the
 * document `status` (issued / partially_paid / paid). We never write those
 * fields directly here.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Loader2,
  FileText,
  AlertCircle,
  Wallet,
  ArrowRight,
} from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  useFinClients,
  type FinDoc,
} from "@/lib/finance/use-documents";
import { SettlementDialog } from "./settlement-dialog";
import { SettlementHistory } from "./settlement-history";
import { cn } from "@/lib/utils";

export type SettlementDirection = "received" | "issued";

type Props = {
  direction: SettlementDirection;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);

const todayIso = () => new Date().toISOString().slice(0, 10);

export function SettlementWorkspace({ direction }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const ns = direction === "received" ? "outflows" : "receipts";

  const [search, setSearch] = useState("");
  const [counterpartyFilter, setCounterpartyFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const suppliersQ = useFinSuppliers();
  const clientsQ = useFinClients();

  // Pull issued + partially_paid; we discard paid/cancelled/draft locally
  // (driven by outstanding_amount > 0 which is the canonical signal).
  const docsQ = useFinDocuments({
    direction,
    search: search.trim() || null,
    supplierId:
      direction === "received" && counterpartyFilter !== "all"
        ? counterpartyFilter
        : null,
    clientId:
      direction === "issued" && counterpartyFilter !== "all"
        ? counterpartyFilter
        : null,
  });

  const counterpartyName = useMemo(() => {
    const map = new Map<string, string>();
    const src = direction === "received" ? suppliersQ.data : clientsQ.data;
    for (const c of src ?? []) map.set(c.id, c.name);
    return map;
  }, [direction, suppliersQ.data, clientsQ.data]);

  const rows = useMemo(() => {
    const today = todayIso();
    return (docsQ.data ?? [])
      .filter(
        (d) =>
          d.status !== "cancelled" &&
          d.status !== "draft" &&
          Number(d.outstanding_amount ?? 0) > 0,
      )
      .filter((d) => {
        if (!overdueOnly) return true;
        return d.due_date && d.due_date < today;
      });
  }, [docsQ.data, overdueOnly]);

  const summary = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let selectedTotal = 0;
    const today = todayIso();
    for (const r of rows) {
      const out = Number(r.outstanding_amount ?? 0);
      outstanding += out;
      if (r.due_date && r.due_date < today) overdue += out;
      if (selected[r.id]) selectedTotal += out;
    }
    return {
      count: rows.length,
      outstanding,
      overdue,
      selectedCount: Object.values(selected).filter(Boolean).length,
      selectedTotal,
    };
  }, [rows, selected]);

  const allSelected =
    rows.length > 0 && rows.every((r) => selected[r.id]);

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const r of rows) next[r.id] = true;
    setSelected(next);
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [id]: checked }));
  }

  const selectedDocs = useMemo(
    () => rows.filter((r) => selected[r.id]),
    [rows, selected],
  );

  function openSettle() {
    if (selectedDocs.length === 0) return;
    setDialogOpen(true);
  }

  function onSettled() {
    setDialogOpen(false);
    setSelected({});
  }

  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label={t(`finance:settlement.${ns}.kpi.count`)}
          value={String(summary.count)}
        />
        <Kpi
          label={t(`finance:settlement.${ns}.kpi.outstanding`)}
          value={fmt(summary.outstanding)}
        />
        <Kpi
          label={t(`finance:settlement.${ns}.kpi.overdue`)}
          value={fmt(summary.overdue)}
          tone={summary.overdue > 0 ? "warning" : "neutral"}
        />
        <Kpi
          label={t(`finance:settlement.${ns}.kpi.selected`)}
          value={`${summary.selectedCount} · ${fmt(summary.selectedTotal)}`}
          tone={summary.selectedCount > 0 ? "accent" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t(`finance:settlement.${ns}.title`)}</CardTitle>
            <CardDescription>
              {t(`finance:settlement.${ns}.subtitle`)}
            </CardDescription>
          </div>
          <Button
            onClick={openSettle}
            size="sm"
            disabled={summary.selectedCount === 0}
          >
            <Wallet className="size-4 mr-1" />
            {t(`finance:settlement.${ns}.settleSelected`, {
              count: summary.selectedCount,
            })}
            <ArrowRight className="size-4 ml-1" />
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
                placeholder={
                  t(`finance:settlement.${ns}.searchPlaceholder`) as string
                }
                className="pl-8"
              />
            </div>
            <Select
              value={counterpartyFilter}
              onValueChange={(v) => setCounterpartyFilter(v)}
            >
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue
                  placeholder={t(`finance:settlement.${ns}.allCounterparties`)}
                />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                <SelectItem value="all">
                  {t(`finance:settlement.${ns}.allCounterparties`)}
                </SelectItem>
                {(direction === "received"
                  ? suppliersQ.data
                  : clientsQ.data
                )?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={overdueOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setOverdueOnly((v) => !v)}
            >
              <AlertCircle className="size-4 mr-1" />
              {t("finance:settlement.common.overdueOnly")}
            </Button>
          </div>

          {/* Table */}
          {docsQ.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="inline size-4 animate-spin mr-1" />
              {t("common:loading")}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground border rounded-md">
              <FileText className="size-6 mx-auto mb-2 opacity-50" />
              {t(`finance:settlement.${ns}.empty`)}
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => toggleAll(Boolean(v))}
                        aria-label={t("finance:settlement.common.selectAll")}
                      />
                    </TableHead>
                    <TableHead className="w-[110px]">
                      {t("finance:settlement.common.col.issueDate")}
                    </TableHead>
                    <TableHead>
                      {direction === "received"
                        ? t("finance:settlement.common.col.supplier")
                        : t("finance:settlement.common.col.client")}
                    </TableHead>
                    <TableHead>
                      {t("finance:settlement.common.col.number")}
                    </TableHead>
                    <TableHead className="w-[120px]">
                      {t("finance:settlement.common.col.due")}
                    </TableHead>
                    <TableHead className="text-right w-[130px]">
                      {t("finance:settlement.common.col.total")}
                    </TableHead>
                    <TableHead className="text-right w-[130px]">
                      {t("finance:settlement.common.col.outstanding")}
                    </TableHead>
                    <TableHead className="w-[130px]">
                      {t("finance:settlement.common.col.status")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <DocRow
                      key={d.id}
                      doc={d}
                      checked={!!selected[d.id]}
                      onToggle={(v) => toggleRow(d.id, v)}
                      counterpartyName={
                        (direction === "received"
                          ? d.counterparty_supplier_id
                          : d.counterparty_client_id) &&
                        counterpartyName.get(
                          (direction === "received"
                            ? d.counterparty_supplier_id
                            : d.counterparty_client_id) as string,
                        )
                      }
                      dateLocale={dateLocale}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SettlementDialog
        open={dialogOpen}
        direction={direction}
        documents={selectedDocs}
        onClose={() => setDialogOpen(false)}
        onSettled={onSettled}
      />
    </div>
  );
}

function DocRow({
  doc,
  checked,
  onToggle,
  counterpartyName,
  dateLocale,
}: {
  doc: FinDoc;
  checked: boolean;
  onToggle: (v: boolean) => void;
  counterpartyName: string | null | undefined;
  dateLocale: string;
}) {
  const today = todayIso();
  const isOverdue =
    !!doc.due_date &&
    doc.due_date < today &&
    Number(doc.outstanding_amount ?? 0) > 0;
  return (
    <TableRow
      className={cn("cursor-pointer", checked && "bg-accent/40")}
      onClick={() => onToggle(!checked)}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggle(Boolean(v))}
        />
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {new Date(doc.issue_date).toLocaleDateString(dateLocale)}
      </TableCell>
      <TableCell className="font-medium">
        {counterpartyName ?? doc.counterparty_name_snapshot ?? "—"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground font-mono">
        {doc.document_number ?? "—"}
        {doc.external_reference ? (
          <span className="ml-1 text-xs">· {doc.external_reference}</span>
        ) : null}
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {doc.due_date ? (
          <span className={cn(isOverdue && "text-destructive font-medium")}>
            {new Date(doc.due_date).toLocaleDateString(dateLocale)}
            {isOverdue && <AlertCircle className="inline size-3 ml-1" />}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {fmt(Number(doc.total_inc_vat))}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmt(Number(doc.outstanding_amount ?? 0))}
      </TableCell>
      <TableCell>
        <StatusBadge status={doc.status} />
      </TableCell>
    </TableRow>
  );
}

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "accent";
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
          tone === "accent" && "text-primary",
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
    issued: { variant: "secondary" },
    partially_paid: {
      variant: "secondary",
      cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    },
    paid: { variant: "default", cls: "bg-emerald-600 hover:bg-emerald-600" },
  };
  const cfg = map[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className={cfg.cls}>
      {t(`finance:settlement.common.status.${status}`)}
    </Badge>
  );
}
