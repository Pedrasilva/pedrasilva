/**
 * Banking → Transactions.
 *
 * Read-only browser over every `bank_transactions` row, across all accounts.
 * Reuses the same tables/queries as the Reconciliation screen (no new backend
 * logic) and adds: account filter, status filter, text search, date range and
 * the linked financial document (via `financial_document_payments`).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, FileText, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 100;

type Account = { id: string; account_name: string; bank_name: string | null };

type Tx = {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
};

const fmtAmount = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(n);

const statusVariant = (s: string) =>
  s === "classified"
    ? "default"
    : s === "unclassified"
      ? "secondary"
      : "outline";

export function BankTransactionsBrowser() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);

  const accountsQ = useQuery({
    queryKey: ["finance", "bank-accounts"],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name")
        .order("account_name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const txQ = useQuery({
    queryKey: ["finance", "bank-tx-browser", account, status, search, from, to, page],
    queryFn: async () => {
      let q = supabase
        .from("bank_transactions")
        .select(
          "id, bank_account_id, transaction_date, description, amount, currency, status",
          { count: "exact" },
        )
        .order("transaction_date", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (account !== "all") q = q.eq("bank_account_id", account);
      if (status !== "all") q = q.eq("status", status as never);
      if (search.trim()) q = q.ilike("description", `%${search.trim()}%`);
      if (from) q = q.gte("transaction_date", from);
      if (to) q = q.lte("transaction_date", to);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Tx[], count: count ?? 0 };
    },
  });

  const rows = txQ.data?.rows ?? [];
  const txIds = rows.map((r) => r.id);

  const linksQ = useQuery({
    queryKey: ["finance", "bank-tx-doc-links", txIds.join(",")],
    enabled: txIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_document_payments")
        .select(
          "bank_transaction_id, document:financial_documents(id, document_number, counterparty_name_snapshot)",
        )
        .in("bank_transaction_id", txIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        bank_transaction_id: string | null;
        document: {
          id: string;
          document_number: string | null;
          counterparty_name_snapshot: string | null;
        } | null;
      }>;
    },
  });

  const linkByTx = useMemo(() => {
    const m = new Map<string, { id: string; label: string }>();
    for (const l of linksQ.data ?? []) {
      if (!l.bank_transaction_id || !l.document) continue;
      m.set(l.bank_transaction_id, {
        id: l.document.id,
        label:
          l.document.document_number ??
          l.document.counterparty_name_snapshot ??
          "—",
      });
    }
    return m;
  }, [linksQ.data]);

  const accountName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accountsQ.data ?? []) m.set(a.id, a.account_name);
    return m;
  }, [accountsQ.data]);

  const total = txQ.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reset = (fn: () => void) => {
    setPage(0);
    fn();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("finance:txBrowser.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("finance:txBrowser.subtitle", { count: total })}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("finance:bankRec.account")}
            </Label>
            <Select value={account} onValueChange={(v) => reset(() => setAccount(v))}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("finance:txBrowser.allAccounts")}</SelectItem>
                {(accountsQ.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("finance:bankRec.col.status")}
            </Label>
            <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("finance:bankRec.status.all")}</SelectItem>
                {["unclassified", "classified", "ignored", "internal_transfer", "archived"].map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {t(`finance:bankRec.status.${s}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("finance:bankRec.operator.searchPlaceholder")}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                value={search}
                onChange={(e) => reset(() => setSearch(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("finance:bankRec.operator.dateFrom")}
            </Label>
            <Input
              type="date"
              className="h-9"
              value={from}
              onChange={(e) => reset(() => setFrom(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t("finance:bankRec.operator.dateTo")}
            </Label>
            <Input
              type="date"
              className="h-9"
              value={to}
              onChange={(e) => reset(() => setTo(e.target.value))}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">
                  {t("finance:bankRec.col.date")}
                </TableHead>
                <TableHead className="w-[180px]">
                  {t("finance:bankRec.account")}
                </TableHead>
                <TableHead>{t("finance:bankRec.col.description")}</TableHead>
                <TableHead className="w-[140px] text-right">
                  {t("finance:bankRec.col.amount")}
                </TableHead>
                <TableHead className="w-[140px]">
                  {t("finance:bankRec.col.status")}
                </TableHead>
                <TableHead className="w-[170px]">
                  {t("finance:txBrowser.col.document")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {t("common:loading")}
                  </TableCell>
                </TableRow>
              )}
              {!txQ.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    {t("finance:bankRec.noTransactions")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((tx) => {
                const link = linkByTx.get(tx.id);
                const negative = Number(tx.amount) < 0;
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="tabular-nums text-sm">
                      {new Date(tx.transaction_date).toLocaleDateString(dateLocale)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {accountName.get(tx.bank_account_id) ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[380px] truncate text-sm">
                      {tx.description}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums ${
                        negative ? "text-destructive" : "text-emerald-600"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {negative ? (
                          <ArrowDownRight className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                        {fmtAmount(Number(tx.amount), tx.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(tx.status)} className="text-[11px]">
                        {t(`finance:bankRec.status.${tx.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {link ? (
                        <Link
                          to="/finance/documents/$documentId"
                          params={{ documentId: link.id }}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="size-3.5" />
                          {link.label}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("finance:txBrowser.page", { page: page + 1, pages })}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 disabled:opacity-40"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t("finance:txBrowser.prev")}
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 disabled:opacity-40"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("finance:txBrowser.next")}
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
