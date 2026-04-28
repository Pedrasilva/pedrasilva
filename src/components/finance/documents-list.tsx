/**
 * Documents list with filters. Used by:
 *  - the Finance dashboard "Documents" tab (compact)
 *  - the dedicated /finance/documents page (full)
 *
 * Display rules (see src/lib/finance/display-rules.ts):
 *  - Amounts: EUR with 2 decimals, right-aligned, tabular-nums.
 *  - Dates: pt-PT dd/mm/yyyy. Empty → DASH.
 *  - Status badges: never raw enum; always translated via i18n.
 */

import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, FileText, Search, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useFinDocuments,
  useFinSuppliers,
  useFinClients,
  useFinProjects,
  type DocumentFilters,
  type FinDocStatus,
  type FinDocType,
  type FinDocDirection,
} from "@/lib/finance/use-documents";

const DASH = "—";

const fmtEUR2 = (v: number | null | undefined) =>
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

const fmtPeriod = (s: string | null | undefined) => {
  if (!s) return DASH;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat("pt-PT", {
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

const ALL = "__all__";

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

export function DocumentsList({
  variant = "full",
  showHeader = true,
}: {
  variant?: "compact" | "full";
  showHeader?: boolean;
}) {
  const { t } = useTranslation(["finance", "common"]);
  const [filters, setFilters] = useState<DocumentFilters>({});

  const docs = useFinDocuments(filters);
  const suppliersQ = useFinSuppliers();
  const clientsQ = useFinClients();
  const projectsQ = useFinProjects();

  const supplierMap = useMemo(
    () => new Map((suppliersQ.data ?? []).map((s) => [s.id, s.name])),
    [suppliersQ.data],
  );
  const clientMap = useMemo(
    () => new Map((clientsQ.data ?? []).map((c) => [c.id, c.name])),
    [clientsQ.data],
  );
  const projectMap = useMemo(
    () => new Map((projectsQ.data ?? []).map((p) => [p.id, p.name])),
    [projectsQ.data],
  );

  function counterpartyOf(d: (typeof docs.data)[number] | undefined) {
    if (!d) return DASH;
    if (d.counterparty_supplier_id)
      return supplierMap.get(d.counterparty_supplier_id) ??
        d.counterparty_name_snapshot ??
        DASH;
    if (d.counterparty_client_id)
      return clientMap.get(d.counterparty_client_id) ??
        d.counterparty_name_snapshot ??
        DASH;
    return d.counterparty_name_snapshot ?? DASH;
  }

  return (
    <Card>
      {showHeader && (
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("finance:documents.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t("finance:documents.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {variant === "compact" && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/finance/documents">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  {t("finance:documents.openFull")}
                </Link>
              </Button>
            )}
            <Button size="sm" asChild>
              <Link to="/finance/documents/$documentId" params={{ documentId: "new" }}>
                <Plus className="h-4 w-4 mr-1" />
                {t("finance:documents.new")}
              </Link>
            </Button>
          </div>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="relative col-span-2 md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("finance:documents.filters.search") as string}
              value={filters.search ?? ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
            />
          </div>

          <Select
            value={filters.docType ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                docType: v === ALL ? null : (v as FinDocType),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("finance:documents.filters.docType") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("finance:documents.filters.all")}</SelectItem>
              {(
                [
                  "client_invoice",
                  "client_credit_note",
                  "supplier_invoice",
                  "supplier_credit_note",
                  "receipt",
                  "other",
                ] as FinDocType[]
              ).map((dt) => (
                <SelectItem key={dt} value={dt}>
                  {t(`finance:documents.type.${dt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.direction ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                direction: v === ALL ? null : (v as FinDocDirection),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("finance:documents.filters.direction") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("finance:documents.filters.all")}</SelectItem>
              <SelectItem value="issued">{t("finance:documents.direction.issued")}</SelectItem>
              <SelectItem value="received">{t("finance:documents.direction.received")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.status ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: v === ALL ? null : (v as FinDocStatus),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("finance:documents.filters.status") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("finance:documents.filters.all")}</SelectItem>
              {(
                ["draft", "issued", "partially_paid", "paid", "cancelled"] as FinDocStatus[]
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`finance:documents.status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="month"
            value={filters.vatPeriod ? filters.vatPeriod.slice(0, 7) : ""}
            onChange={(e) => {
              const v = e.target.value;
              setFilters((f) => ({
                ...f,
                vatPeriod: v ? `${v}-01` : null,
              }));
            }}
          />

          <Select
            value={filters.supplierId ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                supplierId: v === ALL ? null : v,
                clientId: v === ALL ? f.clientId : null,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("finance:documents.filters.supplier") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("finance:documents.filters.all")}</SelectItem>
              {(suppliersQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.clientId ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                clientId: v === ALL ? null : v,
                supplierId: v === ALL ? f.supplierId : null,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("finance:documents.filters.client") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("finance:documents.filters.all")}</SelectItem>
              {(clientsQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.projectId ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                projectId: v === ALL ? null : v,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("finance:documents.filters.project") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("finance:documents.filters.all")}</SelectItem>
              {(projectsQ.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:documents.col.number")}</TableHead>
                <TableHead>{t("finance:documents.col.type")}</TableHead>
                <TableHead>{t("finance:documents.col.counterparty")}</TableHead>
                <TableHead>{t("finance:documents.col.issueDate")}</TableHead>
                <TableHead>{t("finance:documents.col.dueDate")}</TableHead>
                <TableHead>{t("finance:documents.col.vatPeriod")}</TableHead>
                <TableHead className="text-right">{t("finance:documents.col.net")}</TableHead>
                <TableHead className="text-right">{t("finance:documents.col.vat")}</TableHead>
                <TableHead className="text-right">{t("finance:documents.col.gross")}</TableHead>
                <TableHead className="text-right">{t("finance:documents.col.paid")}</TableHead>
                <TableHead className="text-right">{t("finance:documents.col.outstanding")}</TableHead>
                <TableHead>{t("finance:documents.col.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    …
                  </TableCell>
                </TableRow>
              ) : (docs.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    {t("finance:documents.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                (docs.data ?? []).map((d) => (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono">
                      <Link
                        to="/finance/documents/$documentId"
                        params={{ documentId: d.id }}
                        className="hover:underline"
                      >
                        {d.document_number || d.external_reference || DASH}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">{t(`finance:documents.type.${d.doc_type}`)}</TableCell>
                    <TableCell>{counterpartyOf(d)}</TableCell>
                    <TableCell>{fmtDate(d.issue_date)}</TableCell>
                    <TableCell>{fmtDate(d.due_date)}</TableCell>
                    <TableCell className="text-xs">{fmtPeriod(d.vat_period)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(d.subtotal_ex_vat)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(d.vat_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmtEUR2(d.total_inc_vat)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(d.paid_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtEUR2(d.outstanding_amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(d.status)}>
                        {t(`finance:documents.status.${d.status}`)}
                      </Badge>
                      {d.project_id && projectMap.get(d.project_id) && (
                        <span className="block text-[10px] text-muted-foreground mt-1">
                          {projectMap.get(d.project_id)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
