/**
 * Project Billing tab — read-only project-scoped financial view.
 *
 * Source of truth: `financial_documents` + `financial_document_lines`
 * + `financial_document_payments` (Finance module). This component does
 * NOT create or duplicate any invoicing logic. It only surfaces documents
 * that have at least one line where `financial_document_lines.project_id`
 * matches the current project (header-level `project_id` is also
 * included for backwards compatibility).
 *
 * The single CTA navigates to Finance to create a new document.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";

type FinDoc = Database["public"]["Tables"]["financial_documents"]["Row"];
type FinDocLine = Database["public"]["Tables"]["financial_document_lines"]["Row"];
type FinDocPayment = Database["public"]["Tables"]["financial_document_payments"]["Row"];
type FinDocStatus = FinDoc["status"];

const DASH = "—";

const fmtEUR = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));

const fmtDate = (s: string | null | undefined) => {
  if (!s) return DASH;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

function statusVariant(
  status: FinDocStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "partially_paid":
    case "issued":
      return "secondary";
    case "cancelled":
      return "destructive";
    case "draft":
    default:
      return "outline";
  }
}

type DocWithMeta = FinDoc & {
  counterparty_label: string | null;
};

function useProjectFinanceDocuments(projectId: string) {
  return useQuery({
    queryKey: ["project-billing", projectId],
    queryFn: async () => {
      // 1. Find document ids where any line is linked to this project
      const linesByProjectQ = await supabase
        .from("financial_document_lines")
        .select("document_id")
        .eq("project_id", projectId);
      if (linesByProjectQ.error) throw linesByProjectQ.error;
      const docIdsFromLines = new Set<string>(
        (linesByProjectQ.data ?? []).map((r) => r.document_id),
      );

      // 2. Also include documents whose header project_id matches (legacy)
      const headerDocsQ = await supabase
        .from("financial_documents")
        .select("id")
        .eq("project_id", projectId);
      if (headerDocsQ.error) throw headerDocsQ.error;
      (headerDocsQ.data ?? []).forEach((r) => docIdsFromLines.add(r.id));

      const ids = Array.from(docIdsFromLines);
      if (ids.length === 0) {
        return {
          documents: [] as DocWithMeta[],
          lines: [] as FinDocLine[],
          payments: [] as FinDocPayment[],
        };
      }

      // 3. Fetch documents
      const docsQ = await supabase
        .from("financial_documents")
        .select("*")
        .in("id", ids)
        .order("issue_date", { ascending: false });
      if (docsQ.error) throw docsQ.error;
      const documents = (docsQ.data ?? []) as FinDoc[];

      // 4. Fetch suppliers/clients for counterparty labels
      const supplierIds = Array.from(
        new Set(
          documents
            .map((d) => d.counterparty_supplier_id)
            .filter((v): v is string => !!v),
        ),
      );
      const clientIds = Array.from(
        new Set(
          documents
            .map((d) => d.counterparty_client_id)
            .filter((v): v is string => !!v),
        ),
      );
      const partyIds = Array.from(new Set([...supplierIds, ...clientIds]));
      const partyMap = new Map<string, string>();
      if (partyIds.length > 0) {
        const partyQ = await supabase
          .from("companies")
          .select("id, nome")
          .in("id", partyIds);
        if (partyQ.error) throw partyQ.error;
        (partyQ.data ?? []).forEach((p: { id: string; nome: string }) =>
          partyMap.set(p.id, p.nome),
        );
      }

      const documentsWithMeta: DocWithMeta[] = documents.map((d) => ({
        ...d,
        counterparty_label:
          (d.counterparty_supplier_id &&
            partyMap.get(d.counterparty_supplier_id)) ||
          (d.counterparty_client_id &&
            partyMap.get(d.counterparty_client_id)) ||
          d.counterparty_name_snapshot ||
          null,
      }));

      // 5. Fetch all lines for these documents (for project-scoped totals)
      const linesQ = await supabase
        .from("financial_document_lines")
        .select("*")
        .in("document_id", ids);
      if (linesQ.error) throw linesQ.error;
      const lines = (linesQ.data ?? []) as FinDocLine[];

      // 6. Fetch payments for these documents
      const paymentsQ = await supabase
        .from("financial_document_payments")
        .select("*")
        .in("document_id", ids)
        .order("payment_date", { ascending: false });
      if (paymentsQ.error) throw paymentsQ.error;
      const payments = (paymentsQ.data ?? []) as FinDocPayment[];

      return { documents: documentsWithMeta, lines, payments };
    },
  });
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "warn";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

export function ProjectBillingTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["finance", "projects", "common"]);
  const { data, isLoading, error } = useProjectFinanceDocuments(projectId);

  const issued = useMemo(
    () => (data?.documents ?? []).filter((d) => d.direction === "issued"),
    [data?.documents],
  );
  const received = useMemo(
    () => (data?.documents ?? []).filter((d) => d.direction === "received"),
    [data?.documents],
  );

  // Project-scoped line totals per document (only lines with project_id = current project)
  const projectLineNetByDoc = useMemo(() => {
    const m = new Map<string, number>();
    (data?.lines ?? []).forEach((l) => {
      if (l.project_id === projectId) {
        m.set(l.document_id, (m.get(l.document_id) ?? 0) + Number(l.amount_ex_vat ?? 0));
      }
    });
    return m;
  }, [data?.lines, projectId]);

  // Summary aggregates (use project-scoped line nets for accuracy when a doc spans projects)
  const summary = useMemo(() => {
    const docs = data?.documents ?? [];
    const payments = data?.payments ?? [];

    const issuedDocs = docs.filter((d) => d.direction === "issued");
    const receivedDocs = docs.filter((d) => d.direction === "received");

    const totalInvoiced = issuedDocs.reduce(
      (a, d) => a + (projectLineNetByDoc.get(d.id) ?? Number(d.subtotal_ex_vat ?? 0)),
      0,
    );
    const supplierCosts = receivedDocs.reduce(
      (a, d) => a + (projectLineNetByDoc.get(d.id) ?? Number(d.subtotal_ex_vat ?? 0)),
      0,
    );

    // For payments we use document-level paid totals (no per-line allocation)
    // and prorate by the project share of the document subtotal when the doc spans projects.
    const paidFor = (docId: string, direction: "issued" | "received") => {
      const doc = docs.find((d) => d.id === docId);
      if (!doc) return 0;
      const docPaid = payments
        .filter((p) => p.document_id === docId)
        .reduce((a, p) => a + Number(p.amount ?? 0), 0);
      if (!doc.subtotal_ex_vat || Number(doc.subtotal_ex_vat) === 0) return docPaid;
      const projectNet = projectLineNetByDoc.get(docId);
      if (projectNet == null) {
        // header-only link → attribute fully if header.project_id matches
        return doc.project_id === projectId ? docPaid : 0;
      }
      const share = projectNet / Number(doc.subtotal_ex_vat);
      // direction-aware just for clarity
      return docPaid * share * (direction === "issued" ? 1 : 1);
    };

    const totalReceived = issuedDocs.reduce(
      (a, d) => a + paidFor(d.id, "issued"),
      0,
    );
    const supplierPaid = receivedDocs.reduce(
      (a, d) => a + paidFor(d.id, "received"),
      0,
    );

    const outstandingClient = Math.max(0, totalInvoiced - totalReceived);
    const supplierOutstanding = Math.max(0, supplierCosts - supplierPaid);
    const netPosition = totalInvoiced - supplierCosts;

    return {
      totalInvoiced,
      totalReceived,
      outstandingClient,
      supplierCosts,
      supplierPaid,
      supplierOutstanding,
      netPosition,
    };
  }, [data, projectLineNetByDoc, projectId]);

  // Build payment rows with linked doc number
  const paymentRows = useMemo(() => {
    const docMap = new Map((data?.documents ?? []).map((d) => [d.id, d]));
    return (data?.payments ?? []).map((p) => ({
      ...p,
      document: docMap.get(p.document_id) ?? null,
    }));
  }, [data?.payments, data?.documents]);

  // TODO: when /finance/documents/$documentId supports a `project_id` search param
  // for prefill, switch this CTA to pass `search={{ project_id: projectId }}`.
  const newDocLink = (
    <Button asChild size="sm">
      <Link
        to="/finance/documents/$documentId"
        params={{ documentId: "new" }}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        {t("finance:projectBilling.cta.createInFinance")}
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("common:loading", "Loading…")}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const hasAny =
    (data?.documents ?? []).length > 0 || (data?.payments ?? []).length > 0;

  if (!hasAny) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {t("finance:projectBilling.title")}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("finance:projectBilling.subtitle")}
            </p>
          </div>
          {newDocLink}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("finance:projectBilling.empty")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + CTA */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {t("finance:projectBilling.title")}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("finance:projectBilling.subtitle")}
            </p>
          </div>
          {newDocLink}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <SummaryCard
              label={t("finance:projectBilling.summary.invoiced")}
              value={fmtEUR(summary.totalInvoiced)}
            />
            <SummaryCard
              label={t("finance:projectBilling.summary.received")}
              value={fmtEUR(summary.totalReceived)}
              tone="positive"
            />
            <SummaryCard
              label={t("finance:projectBilling.summary.outstandingClient")}
              value={fmtEUR(summary.outstandingClient)}
              tone={summary.outstandingClient > 0 ? "warn" : "default"}
            />
            <SummaryCard
              label={t("finance:projectBilling.summary.supplierCosts")}
              value={fmtEUR(summary.supplierCosts)}
            />
            <SummaryCard
              label={t("finance:projectBilling.summary.supplierPaid")}
              value={fmtEUR(summary.supplierPaid)}
            />
            <SummaryCard
              label={t("finance:projectBilling.summary.supplierOutstanding")}
              value={fmtEUR(summary.supplierOutstanding)}
              tone={summary.supplierOutstanding > 0 ? "warn" : "default"}
            />
            <SummaryCard
              label={t("finance:projectBilling.summary.netPosition")}
              value={fmtEUR(summary.netPosition)}
              tone={summary.netPosition < 0 ? "negative" : "positive"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section A: Client invoices / income */}
      <DocumentsSection
        title={t("finance:projectBilling.sections.clientInvoices")}
        emptyLabel={t("finance:projectBilling.sections.noClientInvoices")}
        documents={issued}
        projectLineNetByDoc={projectLineNetByDoc}
      />

      {/* Section B: Supplier invoices / project costs */}
      <DocumentsSection
        title={t("finance:projectBilling.sections.supplierInvoices")}
        emptyLabel={t("finance:projectBilling.sections.noSupplierInvoices")}
        documents={received}
        projectLineNetByDoc={projectLineNetByDoc}
      />

      {/* Section C: Payments / receipts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {t("finance:projectBilling.sections.payments")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("finance:projectBilling.sections.noPayments")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("finance:projectBilling.cols.date")}</TableHead>
                    <TableHead>{t("finance:projectBilling.cols.linkedDocument")}</TableHead>
                    <TableHead>{t("finance:projectBilling.cols.method")}</TableHead>
                    <TableHead>{t("finance:projectBilling.cols.bankTx")}</TableHead>
                    <TableHead className="text-right">{t("finance:projectBilling.cols.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{fmtDate(p.payment_date)}</TableCell>
                      <TableCell>
                        {p.document ? (
                          <Link
                            to="/finance/documents/$documentId"
                            params={{ documentId: p.document.id }}
                            className="text-primary hover:underline"
                          >
                            {p.document.document_number ||
                              p.document.external_reference ||
                              DASH}
                          </Link>
                        ) : (
                          DASH
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t(`finance:payments.methods.${p.method}`, p.method)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.bank_transaction_id ? (
                          <Badge variant="secondary">
                            {t("finance:payments.matched")}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("finance:payments.manual")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR(Number(p.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsSection({
  title,
  emptyLabel,
  documents,
  projectLineNetByDoc,
}: {
  title: string;
  emptyLabel: string;
  documents: DocWithMeta[];
  projectLineNetByDoc: Map<string, number>;
}) {
  const { t } = useTranslation(["finance", "common"]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finance:col.number", "Number")}</TableHead>
                  <TableHead>{t("finance:col.type", "Type")}</TableHead>
                  <TableHead>{t("finance:col.counterparty", "Counterparty")}</TableHead>
                  <TableHead>{t("finance:col.issueDate", "Issue date")}</TableHead>
                  <TableHead>{t("finance:col.dueDate", "Due date")}</TableHead>
                  <TableHead>{t("finance:col.status", "Status")}</TableHead>
                  <TableHead className="text-right">{t("finance:col.net", "Net")}</TableHead>
                  <TableHead className="text-right">{t("finance:col.vat", "VAT")}</TableHead>
                  <TableHead className="text-right">{t("finance:col.gross", "Gross")}</TableHead>
                  <TableHead className="text-right">{t("finance:col.paid", "Paid")}</TableHead>
                  <TableHead className="text-right">{t("finance:col.outstanding", "Outstanding")}</TableHead>
                  <TableHead className="text-right">{t("finance:projectBilling.cols.projectShare")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => {
                  const projectNet = projectLineNetByDoc.get(d.id);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/finance/documents/$documentId"
                          params={{ documentId: d.id }}
                          className="text-primary hover:underline"
                        >
                          {d.document_number || d.external_reference || DASH}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        {t(`finance:documents.type.${d.doc_type}`, d.doc_type)}
                      </TableCell>
                      <TableCell>{d.counterparty_label || DASH}</TableCell>
                      <TableCell>{fmtDate(d.issue_date)}</TableCell>
                      <TableCell>{fmtDate(d.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(d.status)}>
                          {t(`finance:documents.status.${d.status}`, d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR(Number(d.subtotal_ex_vat))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR(Number(d.vat_amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR(Number(d.total_inc_vat))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR(Number(d.paid_amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtEUR(Number(d.outstanding_amount ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {projectNet != null ? fmtEUR(projectNet) : DASH}
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
  );
}
