/**
 * Banking → Bank balances.
 *
 * Accounts are grouped by `account_kind` (bank / credit_card / benefits / other).
 * Only real bank accounts roll up into the headline "total current bank balance";
 * each other group gets its own subtotal.
 *
 * Archiving sets `archived_at` — rows stay in the database, so historical
 * snapshots and transactions remain intact and queryable.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { BankAccountDetailDialog } from "@/components/finance/bank-account-detail-dialog";
import {
  useCalculatedBankBalances,
  useCalculatedBalanceAt,
  checkSnapshot,
} from "@/lib/finance/use-bank-balances";

type AccountKind = "bank" | "credit_card" | "benefits" | "other";

type Account = {
  id: string;
  account_name: string;
  bank_name: string | null;
  currency: string;
  account_kind: AccountKind;
  archived_at: string | null;
  opening_balance: number | null;
  opening_balance_date: string | null;
};

type Snapshot = {
  bank_account_id: string;
  snapshot_date: string;
  balance: number;
};

const GROUPS: AccountKind[] = ["bank", "credit_card", "benefits", "other"];

const fmtEUR2 = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);

export function BankBalancesSection() {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const dateLocale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const qc = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState("");
  const [notes, setNotes] = useState("");

  const accountsQ = useQuery({
    queryKey: ["finance", "bank-accounts-balances"],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select(
          "id, account_name, bank_name, currency, account_kind, archived_at, opening_balance, opening_balance_date",
        )
        .order("account_name");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const snapshotsQ = useQuery({
    queryKey: ["finance", "bank-snapshots"],
    queryFn: async (): Promise<Snapshot[]> => {
      const { data, error } = await supabase
        .from("bank_balance_snapshots")
        .select("bank_account_id, snapshot_date, balance")
        .order("snapshot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Snapshot[];
    },
  });

  const latest = useMemo(() => {
    const m = new Map<string, Snapshot>();
    for (const s of snapshotsQ.data ?? []) {
      if (!m.has(s.bank_account_id)) m.set(s.bank_account_id, s);
    }
    return m;
  }, [snapshotsQ.data]);

  const visible = useMemo(
    () => (accountsQ.data ?? []).filter((a) => showArchived || !a.archived_at),
    [accountsQ.data, showArchived],
  );

  const grouped = useMemo(() => {
    const m = new Map<AccountKind, Account[]>();
    for (const k of GROUPS) m.set(k, []);
    for (const a of visible) m.get(a.account_kind ?? "other")!.push(a);
    return m;
  }, [visible]);

  const balancesQ = useCalculatedBankBalances();

  // Authoritative balance: opening balance + all reconciled transactions.
  const effective = (a: Account) =>
    balancesQ.byAccount.get(a.id)?.calculated_balance ?? 0;

  const subtotal = (rows: Account[]) =>
    rows
      .filter((a) => !a.archived_at)
      .reduce((s, a) => s + effective(a), 0);

  const bankTotal = subtotal(grouped.get("bank") ?? []);

  const setArchived = useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { error } = await supabase
        .from("bank_accounts")
        .update({
          archived_at: archive ? new Date().toISOString() : null,
          is_active: !archive,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.archive
          ? t("finance:bank.archive.archived")
          : t("finance:bank.archive.restored"),
      );
      qc.invalidateQueries({ queryKey: ["finance", "bank-accounts-balances"] });
      qc.invalidateQueries({ queryKey: ["finance", "bank-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setKind = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: AccountKind }) => {
      const { error } = await supabase
        .from("bank_accounts")
        .update({ account_kind: kind })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance", "bank-accounts-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertSnapshot = useMutation({
    mutationFn: async () => {
      const amt = Number(balance);
      if (!accountId || !date || Number.isNaN(amt)) throw new Error("Invalid input");
      const { error } = await supabase.from("bank_balance_snapshots").insert({
        bank_account_id: accountId,
        snapshot_date: date,
        balance: amt,
        source: "manual",
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("finance:bank.form.saved"));
      qc.invalidateQueries({ queryKey: ["finance", "bank-snapshots"] });
      setOpen(false);
      setBalance("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message || t("finance:bank.form.saveError")),
  });

  if (accountsQ.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("common:loading")}</div>;
  }

  const activeAccounts = (accountsQ.data ?? []).filter((a) => !a.archived_at);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="font-display text-lg">
              {t("finance:bank.title")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {t("finance:bank.totalCurrent")}:{" "}
              <span className="font-semibold text-foreground">{fmtEUR2(bankTotal)}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("finance:bank.totalCurrentHint")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived" className="text-xs text-muted-foreground">
                {t("finance:bank.archive.showArchived")}
              </Label>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("finance:bank.newSnapshot")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("finance:bank.newSnapshotTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("finance:bank.form.account")}</Label>
                    <Select value={accountId} onValueChange={setAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAccounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("finance:bank.form.date")}</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("finance:bank.form.balance")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={balance}
                      onChange={(e) => setBalance(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("finance:bank.form.notes")}</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <SnapshotComparePreview
                    accountId={accountId || null}
                    date={date}
                    entered={balance}
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={insertSnapshot.isPending || !accountId || !balance}
                    onClick={() => insertSnapshot.mutate()}
                  >
                    {t("finance:bank.form.save")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {GROUPS.map((kind) => {
        const rows = grouped.get(kind) ?? [];
        if (rows.length === 0) return null;
        const sum = subtotal(rows);
        return (
          <Card key={kind}>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {t(`finance:bank.groups.${kind}.title`)}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {t(`finance:bank.groups.${kind}.subtotal`)}:{" "}
                  <span className="font-semibold text-foreground">{fmtEUR2(sum)}</span>
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("finance:bank.col.account")}</TableHead>
                      <TableHead>{t("finance:bank.col.bank")}</TableHead>
                      <TableHead className="w-[170px]">
                        {t("finance:bank.col.type")}
                      </TableHead>
                      <TableHead className="w-[90px]">
                        {t("finance:bank.col.currency")}
                      </TableHead>
                      <TableHead className="text-right w-[150px]">
                        {t("finance:bank.col.calculated")}
                      </TableHead>
                      <TableHead className="w-[110px] text-right">
                        {t("finance:bank.col.movements")}
                      </TableHead>
                      <TableHead className="w-[210px]">
                        {t("finance:bank.col.snapshotCheck")}
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        {t("finance:bank.col.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a) => {
                      const snap = latest.get(a.id);
                      const value = effective(a);
                      const calc = balancesQ.byAccount.get(a.id);
                      const archived = !!a.archived_at;
                      return (
                        <TableRow
                          key={a.id}
                          onClick={() => setDetailId(a.id)}
                          className={`cursor-pointer ${archived ? "opacity-60" : ""}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {a.account_name}
                              {archived && (
                                <Badge variant="outline" className="text-[10px]">
                                  {t("finance:bank.archive.badge")}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{a.bank_name ?? "—"}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={a.account_kind ?? "other"}
                              onValueChange={(v) =>
                                setKind.mutate({ id: a.id, kind: v as AccountKind })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GROUPS.map((k) => (
                                  <SelectItem key={k} value={k} className="text-xs">
                                    {t(`finance:bank.groups.${k}.label`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>{a.currency}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {fmtEUR2(value, a.currency)}
                            <div className="text-[10px] font-normal text-muted-foreground">
                              {t("finance:bank.openingTag", {
                                amount: fmtEUR2(
                                  calc?.opening_balance ?? 0,
                                  a.currency,
                                ),
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {calc?.reconciled_count ?? 0}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <SnapshotCheckCell
                              accountId={a.id}
                              currency={a.currency}
                              snapshot={snap ?? null}
                              dateLocale={dateLocale}
                            />
                          </TableCell>
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >

                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={setArchived.isPending}
                              onClick={() =>
                                setArchived.mutate({ id: a.id, archive: !archived })
                              }
                            >
                              {archived ? (
                                <>
                                  <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                                  {t("finance:bank.archive.restore")}
                                </>
                              ) : (
                                <>
                                  <Archive className="h-3.5 w-3.5 mr-1.5" />
                                  {t("finance:bank.archive.archive")}
                                </>
                              )}
                            </Button>
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
      })}

      <BankAccountDetailDialog
        accountId={detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
      />
    </div>
  );
}

/**
 * Audit check: a manual snapshot is compared against the calculated balance
 * as of the same date. It never becomes the balance itself.
 */
function SnapshotCheckCell({
  accountId,
  currency,
  snapshot,
  dateLocale,
}: {
  accountId: string;
  currency: string;
  snapshot: Snapshot | null;
  dateLocale: string;
}) {
  const { t } = useTranslation(["finance"]);
  const calcQ = useCalculatedBalanceAt(
    snapshot ? accountId : null,
    snapshot?.snapshot_date ?? null,
  );

  if (!snapshot) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("finance:bank.check.none")}
      </span>
    );
  }
  if (calcQ.isLoading || calcQ.data == null) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }

  const check = checkSnapshot(Number(snapshot.balance), calcQ.data);
  const when = new Date(snapshot.snapshot_date).toLocaleDateString(dateLocale);

  if (check.status === "match") {
    return (
      <div className="text-xs">
        <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600">
          {t("finance:bank.check.confirmed")}
        </Badge>
        <div className="mt-0.5 text-muted-foreground tabular-nums">{when}</div>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <Badge variant="destructive" className="text-[10px]">
        {t("finance:bank.check.mismatch")}
      </Badge>
      <div className="mt-0.5 text-muted-foreground tabular-nums">
        {t("finance:bank.check.detail", {
          snapshot: fmtEUR2(check.snapshot, currency),
          calculated: fmtEUR2(check.calculated, currency),
          difference: fmtEUR2(check.difference, currency),
        })}
      </div>
      <div className="text-muted-foreground tabular-nums">{when}</div>
    </div>
  );
}

/** Live comparison shown while entering a snapshot. */
function SnapshotComparePreview({
  accountId,
  date,
  entered,
}: {
  accountId: string | null;
  date: string;
  entered: string;
}) {
  const { t } = useTranslation(["finance"]);
  const calcQ = useCalculatedBalanceAt(accountId, date || null);
  const amount = Number(entered);

  if (!accountId || !date || calcQ.data == null) return null;

  const check = Number.isFinite(amount) && entered !== ""
    ? checkSnapshot(amount, calcQ.data)
    : null;

  return (
    <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/30">
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {t("finance:bank.check.calculatedAt")}
        </span>
        <span className="tabular-nums font-medium">{fmtEUR2(calcQ.data)}</span>
      </div>
      {check && (
        <div
          className={
            check.status === "match"
              ? "text-emerald-600"
              : "text-destructive font-medium"
          }
        >
          {check.status === "match"
            ? t("finance:bank.check.confirmedHint")
            : t("finance:bank.check.detail", {
                snapshot: fmtEUR2(check.snapshot),
                calculated: fmtEUR2(check.calculated),
                difference: fmtEUR2(check.difference),
              })}
        </div>
      )}
      <p className="text-muted-foreground">{t("finance:bank.check.auditHint")}</p>
    </div>
  );
}
