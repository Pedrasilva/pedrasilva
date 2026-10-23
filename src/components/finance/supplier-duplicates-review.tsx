/**
 * Possible duplicate suppliers (same NIF or same normalised name). Nothing is
 * merged until a person picks which company to keep and confirms with a reason.
 * The merged company is never deleted: it stays inactive and its name/NIF become
 * aliases of the kept one; every reference moves in one database transaction.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Pair = {
  company_a: string; name_a: string; nif_a: string | null; docs_a: number; total_a: number;
  company_b: string; name_b: string; nif_b: string | null; docs_b: number; total_b: number; reason: "same_nif" | "same_name";
};
type Side = { id: string; name: string; nif: string | null; docs: number; total: number };

const eur = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const KEY = ["finance", "supplier-duplicates"] as const;

export function SupplierDuplicatesReview() {
  const { t } = useTranslation("finance");
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fin_supplier_duplicate_candidates");
      if (error) throw error;
      return (data ?? []) as unknown as Pair[];
    },
  });
  const pairs = q.data ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("finance:supplierDups.subtitle")}</p>
      {q.isLoading ? <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        : pairs.length === 0 ? <p className="text-sm text-muted-foreground">{t("finance:supplierDups.none")}</p>
        : (
          <>
            <Badge variant="secondary">{t("finance:supplierDups.count", { count: pairs.length })}</Badge>
            {pairs.map((p) => <PairCard key={`${p.company_a}:${p.company_b}`} p={p} />)}
          </>
        )}
    </div>
  );
}

function PairCard({ p }: { p: Pair }) {
  const { t } = useTranslation("finance");
  const qc = useQueryClient();
  const sides: Side[] = [
    { id: p.company_a, name: p.name_a, nif: p.nif_a, docs: Number(p.docs_a), total: Number(p.total_a) },
    { id: p.company_b, name: p.name_b, nif: p.nif_b, docs: Number(p.docs_b), total: Number(p.total_b) },
  ];
  const [keep, setKeep] = useState<Side | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const other = keep ? sides.find((s) => s.id !== keep.id)! : null;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: KEY });
    await qc.invalidateQueries({ queryKey: ["finance", "purchase-duplicates"] });
  };
  const merge = async () => {
    if (!keep || !other) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("fin_merge_companies", { _keep: keep.id, _merge: other.id, _reason: reason.trim() });
      if (error) throw error;
      toast.success(t("finance:supplierDups.merged", { keep: keep.name, merged: other.name }));
      setKeep(null); setReason("");
      await done();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const notDup = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("fin_company_not_duplicate", { _a: p.company_a, _b: p.company_b });
      if (error) throw error;
      toast.success(t("finance:supplierDups.remembered"));
      await done();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {p.name_a}
          <Badge variant="outline">{t(`finance:supplierDups.reason.${p.reason}`)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {sides.map((s, i) => (
            <div key={s.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="font-semibold">{String.fromCharCode(65 + i)} · {s.name}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">NIF</span><span>{s.nif ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finance:supplierDups.documents")}</span><span className="tabular-nums">{s.docs}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finance:supplierDups.total")}</span><span className="tabular-nums">{eur(s.total)}</span></div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {sides.map((s, i) => (
            <Button key={s.id} size="sm" disabled={busy} onClick={() => setKeep(s)}>
              {t("finance:supplierDups.keep", { keep: String.fromCharCode(65 + i), merge: String.fromCharCode(66 - i) })}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void notDup()}>{t("finance:supplierDups.notDup")}</Button>
        </div>
      </CardContent>
      <Dialog open={!!keep} onOpenChange={(o) => !o && setKeep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finance:supplierDups.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {keep && other && t("finance:supplierDups.confirmDesc", { keep: keep.name, merge: other.name, docs: other.docs })}
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
