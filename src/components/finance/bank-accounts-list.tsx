/**
 * Data → Bank accounts.
 *
 * Straight list view over `bank_accounts` (the same rows Reconciliation and
 * Balances already read), with transaction counts and latest balance snapshot.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type Account = {
  id: string;
  account_name: string;
  bank_name: string | null;
  account_number: string | null;
  iban: string | null;
  currency: string;
  is_active: boolean;
};

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(n);

export function BankAccountsList() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const accountsQ = useQuery({
    queryKey: ["finance", "bank-accounts-list"],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, account_name, bank_name, account_number, iban, currency, is_active")
        .order("account_name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const txQ = useQuery({
    queryKey: ["finance", "bank-accounts-tx-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("bank_account_id, transaction_date");
      if (error) throw error;
      return (data ?? []) as Array<{
        bank_account_id: string;
        transaction_date: string;
      }>;
    },
  });

  const snapshotsQ = useQuery({
    queryKey: ["finance", "bank-accounts-latest-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_balance_snapshots")
        .select("bank_account_id, snapshot_date, balance")
        .order("snapshot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        bank_account_id: string;
        snapshot_date: string;
        balance: number;
      }>;
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; last: string | null }>();
    for (const tx of txQ.data ?? []) {
      const cur = m.get(tx.bank_account_id) ?? { count: 0, last: null };
      cur.count += 1;
      if (!cur.last || tx.transaction_date > cur.last) cur.last = tx.transaction_date;
      m.set(tx.bank_account_id, cur);
    }
    return m;
  }, [txQ.data]);

  const latestSnapshot = useMemo(() => {
    const m = new Map<string, { snapshot_date: string; balance: number }>();
    for (const s of snapshotsQ.data ?? []) {
      if (!m.has(s.bank_account_id)) {
        m.set(s.bank_account_id, { snapshot_date: s.snapshot_date, balance: Number(s.balance) });
      }
    }
    return m;
  }, [snapshotsQ.data]);

  const accounts = accountsQ.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("finance:bankAccountsList.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("finance:bankAccountsList.subtitle", { count: accounts.length })}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("finance:bank.col.account")}</TableHead>
                <TableHead>{t("finance:bank.col.bank")}</TableHead>
                <TableHead>{t("finance:bankRec.accountNumber")}</TableHead>
                <TableHead className="w-[90px]">{t("finance:bank.col.currency")}</TableHead>
                <TableHead className="w-[110px] text-right">
                  {t("finance:bankAccountsList.col.transactions")}
                </TableHead>
                <TableHead className="w-[130px]">
                  {t("finance:bankAccountsList.col.lastMovement")}
                </TableHead>
                <TableHead className="w-[150px] text-right">
                  {t("finance:bank.col.latest")}
                </TableHead>
                <TableHead className="w-[100px]">
                  {t("finance:bankAccountsList.col.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountsQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {t("common:loading")}
                  </TableCell>
                </TableRow>
              )}
              {!accountsQ.isLoading && accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {t("finance:bank.empty")}
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((a) => {
                const st = stats.get(a.id);
                const snap = latestSnapshot.get(a.id);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.account_name}</TableCell>
                    <TableCell>{a.bank_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.iban ?? a.account_number ?? "—"}
                    </TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {st?.count ?? 0}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {st?.last
                        ? new Date(st.last).toLocaleDateString(dateLocale)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {snap ? fmt(snap.balance, a.currency) : t("finance:bank.noSnapshot")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.is_active ? "default" : "outline"} className="text-[11px]">
                        {a.is_active
                          ? t("finance:bankAccountsList.active")
                          : t("finance:bankAccountsList.inactive")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
