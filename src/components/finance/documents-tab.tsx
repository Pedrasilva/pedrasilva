/**
 * Documents tab for the Finance dashboard.
 *
 * Composes:
 *  - DocumentsList (compact)
 *  - VAT summary panel (useVatSummary)
 *  - Counterparty statement (useCounterpartyStatement)
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DocumentsList } from "@/components/finance/documents-list";
import {
  useCounterpartyStatement,
  useFinClients,
  useFinSuppliers,
  useVatSummary,
  type StatementParty,
} from "@/lib/finance/use-documents";

function fmt(n: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function VatSummaryPanel() {
  const { t } = useTranslation(["finance"]);
  const year = new Date().getFullYear();
  const q = useVatSummary(year);
  const rows = q.data ?? [];

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          output: a.output + r.output_vat_accrued,
          input: a.input + r.input_vat_accrued,
          payable: a.payable + r.vat_payable,
          paidEst: a.paidEst + (r.output_vat_paid_est - r.input_vat_paid_est),
          outstanding: a.outstanding + r.vat_outstanding,
        }),
        { output: 0, input: 0, payable: 0, paidEst: 0, outstanding: 0 },
      ),
    [rows],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("finance:documents.vat.title")} · {year}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("finance:documents.vat.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:documents.vat.period")}</TableHead>
                <TableHead className="text-right">
                  {t("finance:documents.vat.outputAccrued")}
                </TableHead>
                <TableHead className="text-right">
                  {t("finance:documents.vat.inputAccrued")}
                </TableHead>
                <TableHead className="text-right">
                  {t("finance:documents.vat.payable")}
                </TableHead>
                <TableHead className="text-right">
                  {t("finance:documents.vat.paidEst")}
                </TableHead>
                <TableHead className="text-right">
                  {t("finance:documents.vat.outstanding")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    —
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.vat_period}>
                    <TableCell className="text-xs">
                      {r.vat_period.slice(0, 7)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmt(r.output_vat_accrued)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmt(r.input_vat_accrued)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmt(r.vat_payable)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {fmt(r.output_vat_paid_est - r.input_vat_paid_est)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums font-medium">
                      {fmt(r.vat_outstanding)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="text-xs font-medium">
                    {t("finance:documents.vat.totals")}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">
                    {fmt(totals.output)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">
                    {fmt(totals.input)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">
                    {fmt(totals.payable)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">
                    {fmt(totals.paidEst)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums font-medium">
                    {fmt(totals.outstanding)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatementPanel() {
  const { t, i18n } = useTranslation(["finance"]);
  const isPt = i18n.language?.startsWith("pt");
  const suppliers = useFinSuppliers();
  const clients = useFinClients();

  const [selection, setSelection] = useState<string>("");
  // value format: "supplier:<id>" or "client:<id>"
  const party: StatementParty | null = useMemo(() => {
    if (!selection) return null;
    const [kind, id] = selection.split(":");
    if (kind !== "supplier" && kind !== "client") return null;
    return { kind, id };
  }, [selection]);

  const stmt = useCounterpartyStatement(party);
  const docs = stmt.data?.documents ?? [];
  const outstanding = stmt.data?.outstanding ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("finance:documents.statement.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px]">
            <Select value={selection} onValueChange={setSelection}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isPt ? "Escolher contraparte…" : "Pick counterparty…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(suppliers.data ?? []).map((s) => (
                  <SelectItem key={`s-${s.id}`} value={`supplier:${s.id}`}>
                    {isPt ? "Fornecedor" : "Supplier"} · {s.name}
                  </SelectItem>
                ))}
                {(clients.data ?? []).map((c) => (
                  <SelectItem key={`c-${c.id}`} value={`client:${c.id}`}>
                    {isPt ? "Cliente" : "Client"} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {party && (
            <div className="text-sm">
              <span className="text-muted-foreground">
                {t("finance:documents.statement.outstandingTotal")}:
              </span>{" "}
              <span className="font-medium tabular-nums">
                {fmt(outstanding)}
              </span>
            </div>
          )}
        </div>

        {party && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:documents.col.number")}</TableHead>
                  <TableHead>{t("finance:documents.col.type")}</TableHead>
                  <TableHead>{t("finance:documents.col.issueDate")}</TableHead>
                  <TableHead>{t("finance:documents.col.dueDate")}</TableHead>
                  <TableHead className="text-right">
                    {t("finance:documents.col.gross")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:documents.col.paid")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("finance:documents.col.outstanding")}
                  </TableHead>
                  <TableHead>{t("finance:documents.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      {t("finance:documents.noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-xs">
                        {d.document_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t(`finance:documents.type.${d.doc_type}`)}
                      </TableCell>
                      <TableCell className="text-xs">{d.issue_date}</TableCell>
                      <TableCell className="text-xs">
                        {d.due_date ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {fmt(Number(d.total_inc_vat ?? 0))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {fmt(Number(d.paid_amount ?? 0))}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums font-medium">
                        {fmt(Number(d.outstanding_amount ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {t(`finance:documents.status.${d.status}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DocumentsTab() {
  return (
    <div className="space-y-6">
      <DocumentsList variant="compact" />
      <VatSummaryPanel />
      <StatementPanel />
    </div>
  );
}
