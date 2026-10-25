import uiI18n from "@/i18n/index";
/**
 * Entrada > Banco: every draft statement period (created automatically when a
 * statement is read) with its checks. Green rows (both AI readings agree, opening
 * equals the previous period's closing, no conflicting copy) can be confirmed
 * together; red rows open the document for individual review.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { draftCheck, type PeriodLite } from "@/lib/finance/bank-statements";
import { confirmStatements } from "@/lib/finance/intake-inbox.functions";
import { REGISTRY_KEY } from "@/components/finance/bank-statement-editor";

type Row = PeriodLite & { source_queue_item_id: string | null };

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString(uiI18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PENDING_STATEMENTS_KEY = ["finance", "pending-statements"] as const;

export function PendingStatementsTable({ onOpenItem }: { onOpenItem: (queueItemId: string) => void }) {
  const { t } = useTranslation(["finance"]);
  const qc = useQueryClient();
  const confirm = useServerFn(confirmStatements);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: PENDING_STATEMENTS_KEY,
    queryFn: async () => {
      const [pRes, aRes] = await Promise.all([
        supabase.from("bank_statement_periods").select(
          "id, bank_account_id, payment_card_id, statement_number, period_start_date, period_end_date, opening_balance, closing_balance, status, balance_disagreement, ai_readings, attached_documents, source_queue_item_id",
        ),
        supabase.from("bank_accounts").select("id, account_name"),
      ]);
      if (pRes.error) throw pRes.error;
      if (aRes.error) throw aRes.error;
      const all = (pRes.data ?? []).map((p) => ({
        ...p, opening_balance: Number(p.opening_balance), closing_balance: Number(p.closing_balance),
      })) as unknown as Row[];
      return { all, accounts: new Map((aRes.data ?? []).map((a) => [a.id, a.account_name] as const)) };
    },
  });

  const drafts = useMemo(() => {
    const all = q.data?.all ?? [];
    return all
      .filter((p) => p.status === "draft")
      .map((p) => ({ p, c: draftCheck(p, all) }))
      .sort((a, b) => (q.data?.accounts.get(a.p.bank_account_id) ?? "").localeCompare(q.data?.accounts.get(b.p.bank_account_id) ?? "")
        || a.p.period_start_date.localeCompare(b.p.period_start_date));
  }, [q.data]);
  const green = drafts.filter((d) => d.c.passes && d.p.source_queue_item_id);

  const m = useMutation({
    mutationFn: (ids: string[]) => confirm({ data: { ids } }),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.filter((r) => !r.ok);
      if (ok) toast.success(t("finance:statementDrafts.confirmed", { count: ok }));
      for (const f of failed) toast.error(f.error ?? "");
      setPicked(new Set());
      qc.invalidateQueries({ queryKey: PENDING_STATEMENTS_KEY });
      qc.invalidateQueries({ queryKey: ["finance", "review-queue"] });
      qc.invalidateQueries({ queryKey: ["finance", "bank-statement-periods"] });
      qc.invalidateQueries({ queryKey: REGISTRY_KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (!q.data || drafts.length === 0) return null;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const reading = (r?: { claude?: number | null; gemini?: number | null; differ?: boolean }) =>
    r?.differ ? <span className="text-destructive">{fmt(r.claude)} / {fmt(r.gemini)}</span> : null;

  return (
    <Card>
      <CardHeader className="py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{t("finance:statementDrafts.title", { count: drafts.length })}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={green.length === 0}
            onClick={() => setPicked(new Set(green.map((d) => d.p.source_queue_item_id!)))}>
            {t("finance:statementDrafts.selectGreen", { count: green.length })}
          </Button>
          <Button size="sm" disabled={picked.size === 0 || m.isPending} onClick={() => m.mutate([...picked])}>
            {m.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t("finance:statementDrafts.confirmSelected", { count: picked.size })}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t("finance:statementDrafts.col.account")}</TableHead>
              <TableHead>{t("finance:statementDrafts.col.id")}</TableHead>
              <TableHead>{t("finance:statementDrafts.col.period")}</TableHead>
              <TableHead className="text-right">{t("finance:statementDrafts.col.opening")}</TableHead>
              <TableHead className="text-right">{t("finance:statementDrafts.col.closing")}</TableHead>
              <TableHead>{t("finance:statementDrafts.col.ai")}</TableHead>
              <TableHead>{t("finance:statementDrafts.col.continuity")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map(({ p, c }) => {
              const src = p.source_queue_item_id;
              return (
                <TableRow key={p.id} className={c.passes ? "" : "bg-destructive/5"}>
                  <TableCell>
                    <Checkbox disabled={!c.passes || !src} checked={!!src && picked.has(src)} onCheckedChange={() => src && toggle(src)}
                      aria-label={p.statement_number} />
                  </TableCell>
                  <TableCell className="text-sm">{q.data.accounts.get(p.bank_account_id) ?? "—"}</TableCell>
                  <TableCell className="text-sm font-medium">{p.statement_number}</TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{p.period_start_date} → {p.period_end_date}</TableCell>
                  <TableCell className={`text-right text-sm tabular-nums ${p.ai_readings?.opening?.differ ? "text-destructive font-medium" : ""}`}>
                    {fmt(p.opening_balance)}<div className="text-[10px]">{reading(p.ai_readings?.opening)}</div>
                  </TableCell>
                  <TableCell className={`text-right text-sm tabular-nums ${p.ai_readings?.closing?.differ ? "text-destructive font-medium" : ""}`}>
                    {fmt(p.closing_balance)}<div className="text-[10px]">{reading(p.ai_readings?.closing)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.aiAgree ? "secondary" : "destructive"} className="text-[10px]">
                      {c.aiAgree ? t("finance:statementDrafts.aiAgree") : t("finance:statementDrafts.aiDiffer")}
                    </Badge>
                    {c.attachedDifferences && (
                      <Badge variant="destructive" className="ml-1 text-[10px]">{t("finance:statementDrafts.copyDiffers")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.continuity == null ? (
                      <span className="text-muted-foreground">{t("finance:statementDrafts.firstPeriod")}</span>
                    ) : c.continuity.ok ? (
                      <Badge variant="secondary" className="text-[10px]">{t("finance:statementDrafts.continuityOk")}</Badge>
                    ) : (
                      <span className="text-destructive">
                        {t("finance:statementDrafts.continuityBreak", { previous: fmt(c.continuity.previousClosing), difference: fmt(c.continuity.difference) })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {src && (
                      <Button size="sm" variant="ghost" onClick={() => onOpenItem(src)}>{t("finance:statementDrafts.review")}</Button>
                    )}
                    {src && c.passes && (
                      <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate([src])}>
                        {t("finance:statementDrafts.confirmOne")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
