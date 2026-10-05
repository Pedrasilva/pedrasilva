/**
 * Suspected duplicate purchases: read-only side-by-side review. The only
 * actions are a person's decision per group (void B linked to A, or "not a duplicate").
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listPurchaseDuplicates, resolvePurchaseDuplicate, type DupDoc, type DupGroup } from "@/lib/finance/purchase-duplicates.functions";

const BUCKET = "financial-documents";
const eur = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "EUR" });

async function openFile(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120);
  if (error || !data) return toast.error(error?.message ?? "File not available");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function PurchaseDuplicatesReview() {
  const { t } = useTranslation("finance");
  const list = useServerFn(listPurchaseDuplicates);
  const q = useQuery({ queryKey: ["finance", "purchase-duplicates"], queryFn: () => list() });
  const groups = q.data?.groups ?? [];
  const flagged = groups.filter((g) => g.bothPaid || g.bothScheduled);
  const exact = groups.filter((g) => g.kind === "same_number").length;
  const twoPaid = groups.filter((g) => g.bothPaid).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("purchaseDups.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("purchaseDups.subtitle")}</p>
      </div>
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : q.error ? (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{t("purchaseDups.countExact", { count: exact })}</Badge>
            <Badge variant="secondary">{t("purchaseDups.countProbable", { count: groups.length - exact })}</Badge>
            <Badge variant="destructive">{t("purchaseDups.countTwoPaid", { count: twoPaid })}</Badge>
            <Badge variant="outline">{t("purchaseDups.countFlagged", { count: flagged.length })}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{t("purchaseDups.payHint")}</p>
          {groups.length === 0 && <p className="text-sm text-muted-foreground">{t("purchaseDups.none")}</p>}
          {groups.map((g) => <GroupCard key={g.key} g={g} />)}
        </>
      )}
    </div>
  );
}

function GroupCard({ g }: { g: DupGroup }) {
  const { t } = useTranslation("finance");
  const qc = useQueryClient();
  const resolve = useServerFn(resolvePurchaseDuplicate);
  const [voidTarget, setVoidTarget] = useState<{ keep: DupDoc; drop: DupDoc[] } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const flagged = g.bothPaid || g.bothScheduled;

  const run = async (decision: "duplicate" | "not_duplicate", keep: DupDoc, others: DupDoc[], why?: string) => {
    setBusy(true);
    try {
      await resolve({ data: { decision, keepId: keep.id, otherIds: others.map((o) => o.id), reason: why } });
      toast.success(decision === "duplicate" ? t("purchaseDups.voided") : t("purchaseDups.remembered"));
      setVoidTarget(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: ["finance", "purchase-duplicates"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const letter = (i: number) => String.fromCharCode(65 + i);
  return (
    <Card className={cn(flagged && "border-destructive bg-destructive/5")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {flagged && <AlertTriangle className="h-4 w-4 text-destructive" />}
          {g.docs[0]?.supplier}
          <Badge variant="outline">{t(g.kind === "same_number" ? "purchaseDups.kindExact" : "purchaseDups.kindProbable")}</Badge>
          {g.bothPaid && <Badge variant="destructive">{t("purchaseDups.bothPaid")}</Badge>}
          {g.bothScheduled && <Badge variant="destructive">{t("purchaseDups.bothScheduled")}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {g.docs.map((d, i) => (
            <div key={d.id} className="space-y-1 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{letter(i)}</span>
                <Badge variant={d.pay === "paid" ? "default" : d.pay === "scheduled" ? "secondary" : "outline"}>{t(`purchaseDups.pay.${d.pay}`)}</Badge>
              </div>
              <Row k={t("purchaseDups.number")} v={d.number ?? "—"} />
              <Row k={t("purchaseDups.date")} v={d.date ?? "—"} />
              <Row k={t("purchaseDups.total")} v={eur(d.total)} />
              <Row k={t("purchaseDups.nif")} v={d.nif ?? "—"} />
              {d.payments > 0 && <Row k={t("purchaseDups.payments")} v={String(d.payments)} />}
              {d.dueDate && d.pay !== "paid" && <Row k={t("purchaseDups.due")} v={d.dueDate} />}
              <Row k={t("purchaseDups.enteredBy")} v={`${d.createdBy ?? "—"} · ${t(`purchaseDups.how.${d.how}`)} · ${d.createdAt.slice(0, 10)}`} />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm" variant="outline">
                  <Link to="/finance/documents/$documentId" params={{ documentId: d.id }}>{t("purchaseDups.open")}</Link>
                </Button>
                {d.filePath ? (
                  <Button size="sm" variant="outline" onClick={() => openFile(d.filePath!)}><FileText className="mr-1 h-3.5 w-3.5" />{t("purchaseDups.file")}</Button>
                ) : (
                  <span className="self-center text-xs text-muted-foreground">{t("purchaseDups.noFile")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {g.docs.map((keep, i) => (
            <Button key={keep.id} size="sm" variant="destructive" disabled={busy}
              onClick={() => setVoidTarget({ keep, drop: g.docs.filter((x) => x.id !== keep.id) })}>
              {t("purchaseDups.keepVoid", { keep: letter(i), drop: g.docs.map((_, j) => letter(j)).filter((_, j) => j !== i).join(", ") })}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run("not_duplicate", g.docs[0], g.docs.slice(1))}>
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("purchaseDups.notDup")}
          </Button>
        </div>
      </CardContent>
      <Dialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("purchaseDups.voidTitle")}</DialogTitle>
            <DialogDescription>{t("purchaseDups.voidDesc")}</DialogDescription>
          </DialogHeader>
          {voidTarget && voidTarget.drop.some((d) => d.pay === "paid") && (
            <p className="text-sm text-destructive">{t("purchaseDups.voidPaidWarn")}</p>
          )}
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("purchaseDups.reasonPh")} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>{t("purchaseDups.cancel")}</Button>
            <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => voidTarget && run("duplicate", voidTarget.keep, voidTarget.drop, reason.trim())}>
              {t("purchaseDups.confirmVoid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="text-right tabular-nums">{v}</span></div>;
}
