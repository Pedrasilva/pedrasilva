/**
 * Settlement history — read-only panel listing recent
 * `financial_document_payments` for one direction (supplier payments or
 * client receipts). Includes filters for date range, counterparty, method,
 * and bank-transaction link status.
 *
 * No reversal/undo here — read-only by design.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search, Link2, Link2Off, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useFinSettlements,
  useFinSuppliers,
  useFinClients,
  type SettlementFilters,
  type SettlementRow,
} from "@/lib/finance/use-documents";
import type { SettlementDirection } from "./settlement-workspace";

type Props = {
  direction: SettlementDirection;
};

const METHODS: Array<SettlementFilters["method"]> = [
  "bank_transfer",
  "cash",
  "card",
  "direct_debit",
  "other",
];

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(n);

export function SettlementHistory({ direction }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const ns = direction === "received" ? "outflows" : "receipts";
  const isPt = i18n.language?.startsWith("pt");
  const dateLocale = isPt ? "pt-PT" : "en-GB";

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [counterpartyId, setCounterpartyId] = useState<string>("all");
  const [method, setMethod] = useState<string>("all");
  const [link, setLink] = useState<"all" | "linked" | "unlinked">("all");
  const [search, setSearch] = useState("");

  const suppliersQ = useFinSuppliers();
  const clientsQ = useFinClients();
  const counterparties =
    direction === "received" ? suppliersQ.data : clientsQ.data;

  const settlementsQ = useFinSettlements({
    direction,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    counterpartyId: counterpartyId === "all" ? null : counterpartyId,
    method:
      method === "all"
        ? null
        : (method as NonNullable<SettlementFilters["method"]>),
    link,
  });

  const counterpartyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of counterparties ?? []) map.set(c.id, c.name);
    return map;
  }, [counterparties]);

  const rows = useMemo(() => {
    const all = settlementsQ.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) => {
      const docNum = r.document?.document_number?.toLowerCase() ?? "";
      const extRef = r.document?.external_reference?.toLowerCase() ?? "";
      const cpId =
        direction === "received"
          ? r.document?.counterparty_supplier_id
          : r.document?.counterparty_client_id;
      const cpName =
        (cpId ? counterpartyName.get(cpId) : null) ??
        r.document?.counterparty_name_snapshot ??
        "";
      const notes = r.notes?.toLowerCase() ?? "";
      return (
        docNum.includes(s) ||
        extRef.includes(s) ||
        cpName.toLowerCase().includes(s) ||
        notes.includes(s)
      );
    });
  }, [settlementsQ.data, search, counterpartyName, direction]);

  const totals = useMemo(() => {
    let count = 0;
    let amount = 0;
    let linkedCount = 0;
    for (const r of rows) {
      count += 1;
      amount += Number(r.amount ?? 0);
      if (r.bank_transaction_id) linkedCount += 1;
    }
    return { count, amount, linkedCount };
  }, [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            {t(`finance:settlement.history.${ns}.title`)}
          </CardTitle>
          <CardDescription>
            {t(`finance:settlement.history.${ns}.subtitle`)}
          </CardDescription>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("finance:settlement.history.common.totalLabel")}
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {fmt(totals.amount)}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {t("finance:settlement.history.common.summary", {
              count: totals.count,
              linked: totals.linkedCount,
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <div className="col-span-2 md:col-span-2 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                t("finance:settlement.history.common.searchPlaceholder") as string
              }
              className="pl-8 h-9"
            />
          </div>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9"
            aria-label={t("finance:settlement.history.common.from") as string}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9"
            aria-label={t("finance:settlement.history.common.to") as string}
          />
          <Select value={counterpartyId} onValueChange={setCounterpartyId}>
            <SelectTrigger className="h-9">
              <SelectValue
                placeholder={t(`finance:settlement.${ns}.allCounterparties`)}
              />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              <SelectItem value="all">
                {t(`finance:settlement.${ns}.allCounterparties`)}
              </SelectItem>
              {counterparties?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-9">
              <SelectValue
                placeholder={t("finance:settlement.history.common.allMethods")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("finance:settlement.history.common.allMethods")}
              </SelectItem>
              {METHODS.map((m) => (
                <SelectItem key={m as string} value={m as string}>
                  {t(`finance:settlement.dialog.methods.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("finance:settlement.history.common.linkFilter")}:
          </span>
          {(["all", "linked", "unlinked"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setLink(opt)}
              className={
                "px-2 py-1 rounded border transition-colors " +
                (link === opt
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted")
              }
            >
              {t(`finance:settlement.history.common.link.${opt}`)}
            </button>
          ))}
        </div>

        {settlementsQ.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="inline size-4 animate-spin mr-1" />
            {t("common:loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground border rounded-md">
            <History className="size-6 mx-auto mb-2 opacity-50" />
            {t(`finance:settlement.history.${ns}.empty`)}
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">
                    {t("finance:settlement.history.col.date")}
                  </TableHead>
                  <TableHead>
                    {direction === "received"
                      ? t("finance:settlement.common.col.supplier")
                      : t("finance:settlement.common.col.client")}
                  </TableHead>
                  <TableHead>
                    {t("finance:settlement.history.col.document")}
                  </TableHead>
                  <TableHead className="text-right w-[130px]">
                    {t("finance:settlement.history.col.amount")}
                  </TableHead>
                  <TableHead className="w-[130px]">
                    {t("finance:settlement.history.col.method")}
                  </TableHead>
                  <TableHead>
                    {t("finance:settlement.history.col.bank")}
                  </TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <HistoryRow
                    key={r.id}
                    row={r}
                    direction={direction}
                    counterpartyName={counterpartyName}
                    dateLocale={dateLocale}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryRow({
  row,
  direction,
  counterpartyName,
  dateLocale,
}: {
  row: SettlementRow;
  direction: SettlementDirection;
  counterpartyName: Map<string, string>;
  dateLocale: string;
}) {
  const { t } = useTranslation(["finance"]);
  const cpId =
    direction === "received"
      ? row.document?.counterparty_supplier_id
      : row.document?.counterparty_client_id;
  const cpName =
    (cpId ? counterpartyName.get(cpId) : null) ??
    row.document?.counterparty_name_snapshot ??
    "—";

  const bank = row.bank_transaction;
  return (
    <TableRow>
      <TableCell className="text-sm tabular-nums">
        {new Date(row.payment_date).toLocaleDateString(dateLocale)}
      </TableCell>
      <TableCell className="font-medium">{cpName}</TableCell>
      <TableCell className="text-sm">
        <div className="font-mono">
          {row.document?.document_number ?? "—"}
        </div>
        {row.document?.doc_type ? (
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t(`finance:settlement.history.docType.${row.document.doc_type}`, {
              defaultValue: row.document.doc_type,
            })}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmt(Number(row.amount ?? 0), row.document?.currency ?? "EUR")}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[11px]">
          {t(`finance:settlement.dialog.methods.${row.method}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        {bank ? (
          <div className="flex items-start gap-1.5">
            <Link2 className="size-3.5 mt-0.5 text-emerald-600 shrink-0" />
            <div>
              <div className="font-medium">
                {bank.bank_account?.account_name ??
                  t("finance:settlement.history.common.unknownAccount")}
              </div>
              <div className="text-muted-foreground truncate max-w-[260px]">
                {new Date(bank.transaction_date).toLocaleDateString(dateLocale)}
                {" · "}
                {bank.description}
              </div>
            </div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Link2Off className="size-3.5" />
            {t("finance:settlement.history.common.notLinked")}
          </span>
        )}
      </TableCell>
      <TableCell>
        {row.notes ? (
          <span
            title={row.notes}
            className="inline-block text-[11px] text-muted-foreground truncate max-w-[140px]"
          >
            {row.notes}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
