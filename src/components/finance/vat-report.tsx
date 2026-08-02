/**
 * Reports → VAT.
 *
 * Internal reconciliation view only: it shows output VAT (issued documents)
 * vs input VAT (received documents) for a manually selected reporting window,
 * plus the net amount. It does NOT determine filing frequency and does not
 * export any government-format return.
 *
 * Reverse-charge candidates (zero-rated documents with a foreign counterparty
 * VAT number, e.g. EU B2B services) are deliberately kept OUT of the main
 * totals and listed separately for manual review — no self-assessed VAT is
 * computed, because the extraction never captured one.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type Mode = "monthly" | "quarterly";

type Doc = {
  id: string;
  document_number: string | null;
  doc_type: string;
  direction: "issued" | "received";
  status: string;
  issue_date: string;
  counterparty_name_snapshot: string | null;
  counterparty_supplier_id: string | null;
  counterparty_client_id: string | null;
  subtotal_ex_vat: number;
  vat_amount: number;
  total_inc_vat: number;
};

const EXCLUDED_STATUSES = ["cancelled", "draft"];

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

const pad = (n: number) => String(n).padStart(2, "0");

function periodRange(mode: Mode, year: number, index: number) {
  // index = month 0-11 (monthly) or quarter 0-3 (quarterly)
  const startMonth = mode === "monthly" ? index : index * 3;
  const endMonth = mode === "monthly" ? index : index * 3 + 2;
  const start = `${year}-${pad(startMonth + 1)}-01`;
  const endDate = new Date(Date.UTC(year, endMonth + 1, 0));
  const end = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(
    endDate.getUTCDate(),
  )}`;
  return { start, end };
}

/** A Portuguese NIF is 9 digits. Anything else (VAT id with a country prefix,
 *  different length) is treated as a foreign counterparty. */
function isForeignVatId(nif: string | null | undefined) {
  if (!nif) return false;
  const raw = nif.trim().toUpperCase();
  if (/^PT?\d{9}$/.test(raw.replace(/\s/g, ""))) return false;
  if (/^\d{9}$/.test(raw.replace(/\D/g, "")) && !/[A-Z]/.test(raw)) return false;
  return true;
}

export function VatReportSection() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const locale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const now = new Date();
  const [mode, setMode] = useState<Mode>("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [index, setIndex] = useState(now.getMonth());

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setIndex((prev) => (next === "quarterly" ? Math.floor(prev / 3) : prev * 3));
    setMode(next);
  };

  const step = (delta: number) => {
    const size = mode === "monthly" ? 12 : 4;
    const total = index + delta;
    if (total < 0) {
      setYear((y) => y - 1);
      setIndex(size - 1);
    } else if (total >= size) {
      setYear((y) => y + 1);
      setIndex(0);
    } else {
      setIndex(total);
    }
  };

  const { start, end } = periodRange(mode, year, index);

  const periodLabel =
    mode === "monthly"
      ? new Date(Date.UTC(year, index, 1)).toLocaleDateString(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        })
      : `Q${index + 1} ${year}`;

  const { data, isLoading } = useQuery({
    queryKey: ["vat-report", start, end],
    queryFn: async () => {
      const { data: docs, error } = await supabase
        .from("financial_documents")
        .select(
          "id, document_number, doc_type, direction, status, issue_date, counterparty_name_snapshot, counterparty_supplier_id, counterparty_client_id, subtotal_ex_vat, vat_amount, total_inc_vat",
        )
        .gte("issue_date", start)
        .lte("issue_date", end)
        .order("issue_date", { ascending: true });
      if (error) throw error;

      const rows = ((docs ?? []) as Doc[]).filter(
        (d) => !EXCLUDED_STATUSES.includes(d.status),
      );

      const companyIds = Array.from(
        new Set(
          rows
            .flatMap((d) => [d.counterparty_supplier_id, d.counterparty_client_id])
            .filter((v): v is string => Boolean(v)),
        ),
      );

      let nifById = new Map<string, string | null>();
      if (companyIds.length) {
        const { data: companies } = await supabase
          .from("companies")
          .select("id, nif")
          .in("id", companyIds);
        nifById = new Map((companies ?? []).map((c) => [c.id, c.nif]));
      }

      return rows.map((d) => {
        const cpId = d.counterparty_supplier_id ?? d.counterparty_client_id;
        const nif = cpId ? (nifById.get(cpId) ?? null) : null;
        const reverseCharge =
          Number(d.vat_amount) === 0 &&
          Number(d.subtotal_ex_vat) > 0 &&
          isForeignVatId(nif);
        return { ...d, nif, reverseCharge };
      });
    },
  });

  const rows = useMemo(() => data ?? [], [data]);

  const reverseCharge = rows.filter((r) => r.reverseCharge);
  const normal = rows.filter((r) => !r.reverseCharge);
  const output = normal.filter((r) => r.direction === "issued");
  const input = normal.filter((r) => r.direction === "received");

  const sumVat = (list: typeof rows) =>
    list.reduce((acc, r) => acc + Number(r.vat_amount || 0), 0);

  const payable = sumVat(output);
  const deductible = sumVat(input);
  const net = payable - deductible;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(locale);

  const renderRows = (list: typeof rows) =>
    list.map((r) => (
      <TableRow key={r.id}>
        <TableCell className="whitespace-nowrap">{fmtDate(r.issue_date)}</TableCell>
        <TableCell className="whitespace-nowrap">{r.document_number || "—"}</TableCell>
        <TableCell>{r.counterparty_name_snapshot || "—"}</TableCell>
        <TableCell>
          <Badge variant={r.direction === "issued" ? "default" : "secondary"}>
            {t(`finance:vatReport.direction.${r.direction}`)}
          </Badge>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {fmtEUR(Number(r.subtotal_ex_vat))}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {fmtEUR(Number(r.vat_amount))}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {fmtEUR(Number(r.total_inc_vat))}
        </TableCell>
      </TableRow>
    ));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{t("finance:vatReport.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="monthly">
                  {t("finance:vatReport.monthly")}
                </TabsTrigger>
                <TabsTrigger value="quarterly">
                  {t("finance:vatReport.quarterly")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => step(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[10rem] text-center text-sm font-medium capitalize">
                {periodLabel}
              </div>
              <Button variant="outline" size="icon" onClick={() => step(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("finance:vatReport.frequencyNote")}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finance:vatReport.payable")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{fmtEUR(payable)}</div>
            <p className="text-xs text-muted-foreground">
              {t("finance:vatReport.docCount", { count: output.length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finance:vatReport.deductible")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {fmtEUR(deductible)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("finance:vatReport.docCount", { count: input.length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("finance:vatReport.net")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{fmtEUR(net)}</div>
            <p className="text-xs text-muted-foreground">
              {net >= 0
                ? t("finance:vatReport.netDue")
                : t("finance:vatReport.netCredit")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("finance:vatReport.reverseCharge.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("finance:vatReport.reverseCharge.note")}
          </p>
          {reverseCharge.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("finance:vatReport.reverseCharge.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:vatReport.col.date")}</TableHead>
                  <TableHead>{t("finance:vatReport.col.number")}</TableHead>
                  <TableHead>{t("finance:vatReport.col.counterparty")}</TableHead>
                  <TableHead>{t("finance:vatReport.col.vatId")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance:vatReport.col.base")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:vatReport.col.vat")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reverseCharge.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(r.issue_date)}
                    </TableCell>
                    <TableCell>{r.document_number || "—"}</TableCell>
                    <TableCell>{r.counterparty_name_snapshot || "—"}</TableCell>
                    <TableCell>{r.nif || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR(Number(r.subtotal_ex_vat))}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {t("finance:vatReport.reverseCharge.manual")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t("finance:vatReport.breakdown")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
          ) : normal.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("finance:vatReport.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:vatReport.col.date")}</TableHead>
                  <TableHead>{t("finance:vatReport.col.number")}</TableHead>
                  <TableHead>{t("finance:vatReport.col.counterparty")}</TableHead>
                  <TableHead>{t("finance:vatReport.col.direction")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance:vatReport.col.base")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:vatReport.col.vat")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:vatReport.col.total")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderRows(output)}
                {renderRows(input)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
