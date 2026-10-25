import uiI18n from "@/i18n/index";
/**
 * Possible duplicate suppliers, grouped into clusters (read-only suggestions).
 * Nothing is merged until a person picks which company to keep and confirms with
 * a reason. Merged companies are never deleted: they stay inactive and their
 * names/NIFs become aliases; every reference moves in one database transaction.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
import { listSupplierClusters, type ClusterMember, type SupplierCluster } from "@/lib/finance/supplier-clusters.functions";

const eur = (n: number) => new Intl.NumberFormat(uiI18n.language, { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const KEY = ["finance", "supplier-clusters"] as const;
const docsOf = (m: ClusterMember) => Object.values(m.byEntity).reduce((s, e) => s + e.docs, 0);

export function SupplierDuplicatesReview() {
  const { t } = useTranslation("finance");
  const list = useServerFn(listSupplierClusters);
  const q = useQuery({ queryKey: KEY, queryFn: () => list() });
  const clusters = q.data?.clusters ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("finance:supplierDups.subtitle")}</p>
      {q.isLoading ? <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        : clusters.length === 0 ? <p className="text-sm text-muted-foreground">{t("finance:supplierDups.none")}</p>
        : (
          <>
            <Badge variant="secondary">{t("finance:supplierDups.count", { count: clusters.length })}</Badge>
            {clusters.map((c) => <ClusterCard key={c.key} c={c} />)}
          </>
        )}
    </div>
  );
}

function ClusterCard({ c }: { c: SupplierCluster }) {
  const { t } = useTranslation("finance");
  const qc = useQueryClient();
  const [keep, setKeep] = useState<ClusterMember | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const others = keep ? c.members.filter((m) => m.id !== keep.id) : [];
  const name = (id: string) => c.members.find((m) => m.id === id)?.name ?? "—";
  const entityLabel = (id: string) => t(id === PSA_ENTITY_ID ? "finance:supplierDups.entityPsa" : "finance:supplierDups.entityOther");

  const done = async () => {
    await qc.invalidateQueries({ queryKey: KEY });
    await qc.invalidateQueries({ queryKey: ["finance", "purchase-duplicates"] });
  };
  const merge = async () => {
    if (!keep) return;
    setBusy(true);
    try {
      for (const o of others) {
        const { error } = await supabase.rpc("fin_merge_companies", { _keep: keep.id, _merge: o.id, _reason: reason.trim() });
        if (error) throw error;
      }
      toast.success(t("finance:supplierDups.merged", { keep: keep.name, merged: others.map((o) => o.name).join(", ") }));
      setKeep(null); setReason("");
      await done();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const notDup = async () => {
    setBusy(true);
    try {
      for (let i = 0; i < c.members.length; i++) for (let j = i + 1; j < c.members.length; j++) {
        const { error } = await supabase.rpc("fin_company_not_duplicate", { _a: c.members[i].id, _b: c.members[j].id });
        if (error) throw error;
      }
      toast.success(t("finance:supplierDups.remembered"));
      await done();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {c.members[0]?.name}
          <Badge variant="outline">{t("finance:supplierDups.confidence", { value: c.confidence })}</Badge>
          {[...new Set(c.edges.map((e) => e.reason))].map((r) => (
            <Badge key={r} variant="secondary">{t(`finance:supplierDups.reason.${r}`)}</Badge>
          ))}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {c.members.map((m) => (
            <div key={m.id} className="space-y-1 rounded-md border p-3 text-sm">
              <div className="font-semibold">{m.name}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">NIF</span><span>{m.nif ?? "—"}</span></div>
              {Object.entries(m.byEntity).map(([eid, v]) => (
                <div key={eid} className="flex justify-between">
                  <span className="text-muted-foreground">{entityLabel(eid)} · {t("finance:supplierDups.documents")}</span>
                  <span className="tabular-nums">{v.docs} · {eur(v.total)}</span>
                </div>
              ))}
              {Object.keys(m.byEntity).length === 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t("finance:supplierDups.documents")}</span><span>0</span></div>
              )}
              <Button size="sm" className="mt-1" disabled={busy} onClick={() => setKeep(m)}>{t("finance:supplierDups.keepThis")}</Button>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">{t("finance:supplierDups.why")}:</span>
          <ul className="ml-4 list-disc">
            {c.edges.map((e) => (
              <li key={`${e.a}${e.b}`}>{name(e.a)} ↔ {name(e.b)}: {t(`finance:supplierDups.reason.${e.reason}`)} ({e.detail}) · {e.confidence}%</li>
            ))}
          </ul>
        </div>
        <div className="space-y-1 text-sm">
          <div className="font-medium">{t("finance:supplierDups.purchasePairs")}</div>
          {c.purchasePairs.length === 0 ? <p className="text-xs text-muted-foreground">{t("finance:supplierDups.noPairs")}</p> : (
            <ul className="space-y-1">
              {c.purchasePairs.map((p) => (
                <li key={`${p.a.id}${p.b.id}`} className="flex flex-wrap items-center gap-2 rounded border border-destructive/40 bg-destructive/5 px-2 py-1">
                  <Badge variant="outline">{entityLabel(p.entityId)}</Badge>
                  <span className="tabular-nums">{eur(p.a.total)}</span>
                  {[p.a, p.b].map((d) => (
                    <Link key={d.id} to="/finance/documents/$documentId" params={{ documentId: d.id }} className="underline">
                      {name(d.companyId)} · {d.number ?? "—"} · {d.date}
                    </Link>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void notDup()}>{t("finance:supplierDups.notDupAll")}</Button>
      </CardContent>
      <Dialog open={!!keep} onOpenChange={(o) => !o && setKeep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finance:supplierDups.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {keep && t("finance:supplierDups.confirmDescMany", {
                keep: keep.name, merge: others.map((o) => o.name).join(", "), docs: others.reduce((s, o) => s + docsOf(o), 0),
              })}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("finance:supplierDups.reasonPh") as string} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeep(null)}>{t("finance:supplierDups.cancel")}</Button>
            <Button disabled={busy || !reason.trim()} onClick={() => void merge()}>{t("finance:supplierDups.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
