import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useReceivablesPayables,
  type AgingBucketKey,
} from "@/lib/finance/use-receivables-payables";
import type { VatMode } from "@/lib/finance/use-cashflow-report";

const DASH = "—";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);

const fmtDate = (v: string | null) => {
  if (!v) return DASH;
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleDateString("pt-PT", { timeZone: "UTC" });
};

const BUCKET_ORDER: AgingBucketKey[] = ["d0_30", "d31_60", "d61_90", "d90p"];

const BUCKET_TONE: Record<AgingBucketKey, string> = {
  d0_30: "text-emerald-700",
  d31_60: "text-amber-600",
  d61_90: "text-orange-600",
  d90p: "text-destructive",
};

export function ReceivablesPayablesReport({ vatMode }: { vatMode: VatMode }) {
  const { t } = useTranslation(["finance", "common"]);
  const { report, isLoading } = useReceivablesPayables(vatMode);

  const [clientFilter, setClientFilter] = useState<string>("all");
  const [overdueFilter, setOverdueFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openBucket, setOpenBucket] = useState<Record<string, boolean>>({});

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of report?.outstanding ?? []) {
      map.set(inv.clientId ?? inv.clientName, inv.clientName || DASH);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [report]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (report?.outstanding ?? []).filter((inv) => {
      if (clientFilter !== "all" && (inv.clientId ?? inv.clientName) !== clientFilter)
        return false;
      if (overdueFilter === "overdue" && inv.daysOverdue <= 0) return false;
      if (overdueFilter === "current" && inv.daysOverdue > 0) return false;
      if (!q) return true;
      return [inv.clientName, inv.projectName, inv.documentNumber]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [report, clientFilter, overdueFilter, search]);

  const filteredTotal = rows.reduce((s, r) => s + r.amount, 0);

  if (isLoading || !report) {
    return (
      <div className="px-3 text-sm text-muted-foreground">
        {t("common:loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return (
    <div className="space-y-8 px-3">
      {/* ---------------- Receivables ---------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            {t("finance:receivablesPayables.receivables.title")}
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {t("finance:receivablesPayables.totalOutstanding")}{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {fmt(report.outstandingTotal)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {t("finance:receivablesPayables.overdue")}{" "}
              <span className="font-semibold tabular-nums text-destructive">
                {fmt(report.overdueTotal)}
              </span>
            </span>
          </div>
        </div>

        {/* Outstanding invoices */}
        <Card>
          <CardHeader className="gap-3 pb-3">
            <CardTitle className="text-sm">
              {t("finance:receivablesPayables.outstanding.title")}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("finance:receivablesPayables.searchPlaceholder")}
                className="h-8 w-[220px]"
              />
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("finance:receivablesPayables.filter.allClients")}
                  </SelectItem>
                  {clients.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={overdueFilter} onValueChange={setOverdueFilter}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("finance:receivablesPayables.filter.allStatuses")}
                  </SelectItem>
                  <SelectItem value="overdue">
                    {t("finance:receivablesPayables.filter.overdueOnly")}
                  </SelectItem>
                  <SelectItem value="current">
                    {t("finance:receivablesPayables.filter.notOverdue")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-muted-foreground">
                {t("finance:receivablesPayables.rowsTotal", {
                  count: rows.length,
                })}{" "}
                · <span className="tabular-nums">{fmt(filteredTotal)}</span>
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.client")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.project")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.invoiceNumber")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.amount")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.issued")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.due")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.daysOverdue")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        {t("finance:receivablesPayables.empty")}
                      </td>
                    </tr>
                  ) : (
                    rows.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{inv.clientName || DASH}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {inv.projectName || DASH}
                        </td>
                        <td className="px-3 py-2">{inv.documentNumber || DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(inv.amount)}
                        </td>
                        <td className="px-3 py-2">{fmtDate(inv.issueDate)}</td>
                        <td className="px-3 py-2">{fmtDate(inv.dueDate)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            inv.daysOverdue > 0
                              ? "font-medium text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {inv.daysOverdue > 0 ? inv.daysOverdue : DASH}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Aging */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {t("finance:receivablesPayables.aging.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {BUCKET_ORDER.map((key) => {
                const b = report.aging.find((x) => x.key === key)!;
                return (
                  <div key={key} className="rounded-lg border p-3">
                    <div className="text-xs uppercase text-muted-foreground">
                      {t(`finance:receivablesPayables.aging.bucket.${key}`)}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-xl font-semibold tabular-nums",
                        BUCKET_TONE[key],
                      )}
                    >
                      {fmt(b.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("finance:receivablesPayables.aging.invoiceCount", {
                        count: b.count,
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divide-y rounded-lg border">
              {BUCKET_ORDER.map((key) => {
                const b = report.aging.find((x) => x.key === key)!;
                const open = !!openBucket[key];
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenBucket((p) => ({ ...p, [key]: !p[key] }))
                      }
                      disabled={b.clients.length === 0}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-60"
                    >
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <span className="font-medium">
                        {t(`finance:receivablesPayables.aging.bucket.${key}`)}
                      </span>
                      <span className="ml-auto tabular-nums">{fmt(b.amount)}</span>
                    </button>
                    {open &&
                      b.clients.map((c) => (
                        <div
                          key={c.clientId}
                          className="flex items-center gap-2 border-t bg-muted/20 px-3 py-1.5 pl-9 text-sm"
                        >
                          <span>{c.clientName || DASH}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("finance:receivablesPayables.aging.invoiceCount", {
                              count: c.count,
                            })}
                          </span>
                          <span className="ml-auto tabular-nums">
                            {fmt(c.amount)}
                          </span>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Time to pay */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {t("finance:receivablesPayables.timeToPay.title")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("finance:receivablesPayables.timeToPay.subtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.client")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.timeToPay.avg")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.timeToPay.median")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.timeToPay.invoices")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.timeToPay.paidTotal")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.behaviour.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        {t("finance:receivablesPayables.empty")}
                      </td>
                    </tr>
                  ) : (
                    report.behaviour.map((c) => (
                      <tr key={c.clientId} className="border-b last:border-0">
                        <td className="px-3 py-2">{c.clientName || DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Math.round(c.avgDaysToPay)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Math.round(c.medianDaysToPay)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {c.invoiceCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(c.totalPaid)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---------------- Payables ---------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            {t("finance:receivablesPayables.payables.title")}
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {t("finance:receivablesPayables.totalOwed")}{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {fmt(report.payablesTotal)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {t("finance:receivablesPayables.overdue")}{" "}
              <span className="font-semibold tabular-nums text-destructive">
                {fmt(report.payablesOverdue)}
              </span>
            </span>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {t("finance:receivablesPayables.purchases.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.vendor")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.category")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.invoiceNumber")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.amount")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.due")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.daysOverdue")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.payables.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        {t("finance:receivablesPayables.empty")}
                      </td>
                    </tr>
                  ) : (
                    report.payables.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{p.vendorName || DASH}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.categoryName || DASH}
                        </td>
                        <td className="px-3 py-2">{p.documentNumber || DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(p.amount)}
                        </td>
                        <td className="px-3 py-2">{fmtDate(p.dueDate)}</td>
                        <td className="px-3 py-2 text-right">
                          {p.daysOverdue > 0 ? (
                            <Badge variant="destructive" className="tabular-nums">
                              {t("finance:receivablesPayables.overdueDays", {
                                count: p.daysOverdue,
                              })}
                            </Badge>
                          ) : (
                            <span className="tabular-nums text-muted-foreground">
                              {DASH}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {t("finance:receivablesPayables.byVendor.title")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("finance:receivablesPayables.byVendor.subtitle")}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.vendor")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.amount")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.overdueAmount")}
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      {t("finance:receivablesPayables.col.documents")}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t("finance:receivablesPayables.col.share")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.vendors.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-muted-foreground"
                      >
                        {t("finance:receivablesPayables.empty")}
                      </td>
                    </tr>
                  ) : (
                    report.vendors.map((v) => (
                      <Fragment key={v.vendorId}>
                        <tr className="border-b last:border-0">
                          <td className="px-3 py-2">{v.vendorName || DASH}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmt(v.amount)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right tabular-nums",
                              v.overdue > 0 ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {v.overdue > 0 ? fmt(v.overdue) : DASH}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {v.count}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-primary"
                                  style={{ width: `${Math.round(v.share * 100)}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-xs text-muted-foreground">
                                {Math.round(v.share * 100)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
