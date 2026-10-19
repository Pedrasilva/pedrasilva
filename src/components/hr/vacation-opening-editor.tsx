import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

export function VacationOpeningEditor({ collaboratorId, canEdit }: { collaboratorId: string; canEdit: boolean }) {
  const { t } = useTranslation(["hr", "common"]);
  const qc = useQueryClient();
  const [adjustment, setAdjustment] = useState("");
  const [reference, setReference] = useState("");
  const query = useQuery({ queryKey: ["vacation-opening", collaboratorId], queryFn: async () => {
    const { data, error } = await supabase.from("hr_vacation_opening_balances").select("year,reference_date,adjustment,base_days,updated_at").eq("collaborator_id", collaboratorId).order("year");
    if (error) throw error;
    return data;
  }});
  const row = query.data?.[0];
  useEffect(() => { if (row) { setAdjustment(String(row.adjustment)); setReference(row.reference_date); } }, [row]);
  const save = useMutation({ mutationFn: async () => {
    if (!row || !Number.isFinite(Number(adjustment))) throw new Error("invalid_adjustment");
    const { error } = await supabase.from("hr_vacation_opening_balances").update({ adjustment: Number(adjustment), reference_date: reference }).eq("collaborator_id", collaboratorId).eq("year", row.year).select().single();
    if (error) throw error;
  }, onSuccess: async () => {
    await Promise.all(["vacation-opening", "leave-balances", "hr-approval-inbox", "availability", "my-vacation-days"].map(key => qc.invalidateQueries({ queryKey: [key] })));
  }});
  if (query.isError) return <p role="alert" className="text-sm text-destructive">{t("hr:leaveOpening.loadError")}</p>;
  if (!row) return null;
  return <div className="col-span-full space-y-3 border-t pt-4">
    <h3 className="text-sm font-semibold">{t("hr:leaveOpening.title", { year: row.year })}</h3>
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label htmlFor="opening-reference">{t("hr:leaveOpening.reference")}</Label><Input id="opening-reference" type="date" value={reference} disabled={!canEdit || save.isPending} onChange={e => setReference(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="opening-adjustment">{t("hr:leaveOpening.adjustment")}</Label><Input id="opening-adjustment" className="w-32 tabular-nums" type="number" step="0.5" value={adjustment} disabled={!canEdit || save.isPending} onChange={e => setAdjustment(e.target.value)} /></div>
      <div className="pb-2 text-sm tabular-nums">{t("hr:leaveOpening.total")}: {row.base_days + Number(adjustment)}</div>
      {canEdit && <Button type="button" size="sm" disabled={save.isPending || !reference || adjustment === "" || (Number(adjustment) === row.adjustment && reference === row.reference_date)} onClick={() => save.mutate()}><Save className="h-4 w-4" />{t("common:save")}</Button>}
    </div>
    {save.isError && <p role="alert" className="text-sm text-destructive">{t("hr:leaveOpening.saveError")}</p>}
  </div>;
}