/**
 * Banking → Bank balances → account detail.
 *
 * Editable account master data (everything the `bank_accounts` table actually
 * holds), plus read-only snapshot history and the 10 most recent transactions.
 * IBAN/BIC are only surfaced for real bank accounts; card/benefit accounts show
 * the account/card number instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export type AccountKind = "bank" | "credit_card" | "benefits" | "other";

export type BankAccountRow = {
  id: string;
  account_name: string;
  bank_name: string | null;
  currency: string;
  account_kind: AccountKind;
  archived_at: string | null;
  account_number?: string | null;
  iban?: string | null;
  bic?: string | null;
  opening_balance?: number | string | null;
  opening_balance_date?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

const KINDS: AccountKind[] = ["bank", "credit_card", "benefits", "other"];

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export function BankAccountDetailDialog({
  accountId,
  onOpenChange,
}: {
  accountId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const qc = useQueryClient();

  const accountQ = useQuery({
    queryKey: ["finance", "bank-account-detail", accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<BankAccountRow> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("id", accountId!)
        .single();
      if (error) throw error;
      return data as BankAccountRow;
    },
  });

  const snapshotsQ = useQuery({
    queryKey: ["finance", "bank-account-snapshots", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_balance_snapshots")
        .select("id, snapshot_date, balance, source, notes")
        .eq("bank_account_id", accountId!)
        .order("snapshot_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        snapshot_date: string;
        balance: number;
        source: string | null;
        notes: string | null;
      }>;
    },
  });

  const txQ = useQuery({
    queryKey: ["finance", "bank-account-recent-tx", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, transaction_date, description, amount, currency")
        .eq("bank_account_id", accountId!)
        .order("transaction_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        transaction_date: string;
        description: string | null;
        amount: number;
        currency: string | null;
      }>;
    },
  });

  const [form, setForm] = useState<BankAccountRow | null>(null);
  useEffect(() => {
    if (accountQ.data) setForm(accountQ.data);
  }, [accountQ.data]);

  const set = <K extends keyof BankAccountRow>(k: K, v: BankAccountRow[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { data, error } = await supabase
        .from("bank_accounts")
        .update({
          account_name: form.account_name.trim(),
          bank_name: form.bank_name || null,
          currency: form.currency || "EUR",
          account_kind: form.account_kind,
          account_number: form.account_number || null,
          iban: form.iban || null,
          bic: form.bic || null,
          opening_balance:
            form.opening_balance === "" || form.opening_balance == null
              ? null
              : Number(form.opening_balance),
          opening_balance_date: form.opening_balance_date || null,
          notes: form.notes || null,
          is_active: form.is_active ?? true,
        })
        .eq("id", form.id)
        .select("id");
      if (error) throw error;
      // An update blocked by row-level security returns no error and no rows —
      // surface it instead of showing a false "saved".
      if (!data || data.length === 0) {
        throw new Error(t("finance:bank.detail.saveDenied"));
      }

    },
    onSuccess: () => {
      toast.success(t("finance:bank.detail.saved"));
      qc.invalidateQueries({ queryKey: ["finance", "bank-account-detail"] });
      qc.invalidateQueries({ queryKey: ["finance", "bank-accounts-balances"] });
      qc.invalidateQueries({ queryKey: ["finance", "bank-accounts-list"] });
      qc.invalidateQueries({ queryKey: ["finance", "bank-accounts"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isBank = form?.account_kind === "bank";
  const currency = form?.currency ?? "EUR";

  const openingLabel = useMemo(
    () =>
      form?.account_kind === "credit_card"
        ? t("finance:bank.detail.openingBalanceCard")
        : t("finance:bank.detail.openingBalance"),
    [form?.account_kind, t],
  );

  return (
    <Dialog open={!!accountId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form?.account_name ?? t("finance:bank.detail.title")}
          </DialogTitle>
        </DialogHeader>

        {!form ? (
          <div className="py-8 text-sm text-muted-foreground">{t("common:loading")}</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("finance:bank.detail.accountName")}</Label>
                <Input
                  value={form.account_name ?? ""}
                  onChange={(e) => set("account_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.col.bank")}</Label>
                <Input
                  value={form.bank_name ?? ""}
                  onChange={(e) => set("bank_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.col.type")}</Label>
                <Select
                  value={form.account_kind ?? "other"}
                  onValueChange={(v) => set("account_kind", v as AccountKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`finance:bank.groups.${k}.label`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.col.currency")}</Label>
                <Input
                  value={form.currency ?? "EUR"}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  {form.account_kind === "credit_card"
                    ? t("finance:bank.detail.cardNumber")
                    : t("finance:bankRec.accountNumber")}
                </Label>
                <Input
                  value={form.account_number ?? ""}
                  onChange={(e) => set("account_number", e.target.value)}
                />
              </div>

              {isBank && (
                <>
                  <div className="space-y-2">
                    <Label>{t("finance:bank.detail.iban")}</Label>
                    <Input
                      value={form.iban ?? ""}
                      onChange={(e) => set("iban", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("finance:bank.detail.bic")}</Label>
                    <Input
                      value={form.bic ?? ""}
                      onChange={(e) => set("bic", e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>{openingLabel}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.opening_balance ?? ""}
                  onChange={(e) => set("opening_balance", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("finance:bank.detail.openingBalanceDate")}</Label>
                <Input
                  type="date"
                  value={form.opening_balance_date ?? ""}
                  onChange={(e) => set("opening_balance_date", e.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("finance:bank.detail.openingHint")}
            </p>

            <div className="space-y-2">
              <Label>{t("finance:bank.form.notes")}</Label>
              <Textarea
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="acct-active"
                checked={form.is_active ?? true}
                onCheckedChange={(v) => set("is_active", v)}
              />
              <Label htmlFor="acct-active" className="text-xs text-muted-foreground">
                {t("finance:bank.detail.active")}
              </Label>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">
                {t("finance:bank.detail.snapshotHistory")}
              </h4>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">
                        {t("finance:bank.col.asOf")}
                      </TableHead>
                      <TableHead className="text-right w-[140px]">
                        {t("finance:bank.form.balance")}
                      </TableHead>
                      <TableHead>{t("finance:bank.form.notes")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(snapshotsQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="py-6 text-center text-sm text-muted-foreground"
                        >
                          {t("finance:bank.noSnapshot")}
                        </TableCell>
                      </TableRow>
                    )}
                    {(snapshotsQ.data ?? []).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="tabular-nums text-sm">
                          {new Date(s.snapshot_date).toLocaleDateString(dateLocale)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(Number(s.balance), currency)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.notes ?? s.source ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  {t("finance:bank.detail.recentTransactions")}
                </h4>
                <Button asChild variant="ghost" size="sm">
                  <Link
                    to="/finance/banking/transactions"
                    search={{ account: form.id }}
                    onClick={() => onOpenChange(false)}
                  >
                    {t("finance:bank.detail.viewAllTransactions")}
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">
                        {t("finance:bank.col.asOf")}
                      </TableHead>
                      <TableHead>{t("finance:bank.form.notes")}</TableHead>
                      <TableHead className="text-right w-[140px]">
                        {t("finance:bank.form.balance")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(txQ.data ?? []).length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="py-6 text-center text-sm text-muted-foreground"
                        >
                          {t("finance:bank.detail.noTransactions")}
                        </TableCell>
                      </TableRow>
                    )}
                    {(txQ.data ?? []).map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="tabular-nums text-sm">
                          {new Date(tx.transaction_date).toLocaleDateString(dateLocale)}
                        </TableCell>
                        <TableCell className="text-sm">{tx.description ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(Number(tx.amount), tx.currency ?? currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button disabled={!form || save.isPending} onClick={() => save.mutate()}>
            {t("common:save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
