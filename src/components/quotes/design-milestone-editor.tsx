import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { parseDesignMilestones, validateDesignMilestones, type DesignMilestonePlan, type DesignMilestone } from "@/lib/quotes/payment-generators";
import { numberStages, formatStageLabel } from "@/lib/quotes/stage-numbering";
import type { QuoteStage } from "@/lib/quotes/types";

export function DesignMilestoneEditor({ quoteId, settings, stages }: { quoteId: string; settings: Record<string, unknown> | null; stages: QuoteStage[] }) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DesignMilestonePlan>(() => parseDesignMilestones(settings));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(parseDesignMilestones(settings)), [settings]);
  const design = numberStages(stages).filter(({ stage }) => stage.stage_kind !== "retainer_monthly" && stage.billing_model !== "retainer" && stage.stage_role !== "client");
  const update = (index: number, patch: Partial<DesignMilestone>) => setDraft(current => ({ ...current, rows: current.rows.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const save = async () => {
    if (draft.enabled && !validateDesignMilestones(draft, stages)) { toast.error(t("workspace.payment.designInvalid")); return; }
    setSaving(true);
    try {
      const { data, error: readError } = await supabase.from("fee_proposals").select("quote_build_settings").eq("id", quoteId).single();
      if (readError) throw readError;
      const current = (data.quote_build_settings ?? {}) as Record<string, unknown>;
      const { error } = await supabase.from("fee_proposals").update({ quote_build_settings: { ...current, designMilestones: draft } as never }).eq("id", quoteId);
      if (error) throw error;
      for (const key of ["fee-proposal-summary", "quote-build-settings", "psa-live-quote"]) qc.invalidateQueries({ queryKey: [key, quoteId] });
      toast.success(t("workspace.payment.designSaved"));
    } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); }
  };
  return <section className="space-y-3 border-t pt-4">
    <div className="flex items-center justify-between gap-3"><Label>{t("workspace.payment.designMilestones")}</Label><Switch checked={draft.enabled} onCheckedChange={enabled => setDraft({ ...draft, enabled })} /></div>
    {draft.enabled && <>
      <p className="text-xs text-muted-foreground">{t("workspace.payment.designBasisHint")}</p>
      {draft.rows.map((row, index) => <div key={index} className="grid items-center gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_90px_36px]">
        <Input aria-label={t("workspace.payment.label")} value={row.label} onChange={event => update(index, { label: event.target.value })} />
        <Select value={row.trigger === "project_start" ? "project_start" : `${row.trigger}:${row.stageId}`} onValueChange={value => { const [trigger, stageId] = value.split(":"); update(index, { trigger: trigger as DesignMilestone["trigger"], stageId: stageId ?? null }); }}>
          <SelectTrigger aria-label={t("workspace.payment.trigger")}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="project_start">{t("workspace.planning.projectStart")}</SelectItem>{design.flatMap(({ stage, number }) => (["stage_start", "stage_end"] as const).map(trigger => <SelectItem key={`${trigger}:${stage.id}`} value={`${trigger}:${stage.id}`}>{t(trigger === "stage_start" ? "workspace.payment.designStart" : "workspace.payment.designEnd", { stage: formatStageLabel(stage, number) })}</SelectItem>))}</SelectContent>
        </Select>
        <Input type="number" min={0} max={100} step="0.01" aria-label={t("workspace.payment.designPercent")} value={row.percent} onChange={event => update(index, { percent: Number(event.target.value) })} />
        <Button variant="ghost" size="icon" title={t("common:delete")} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, rows: [...draft.rows, { label: "", stageId: design[0]?.stage.id ?? null, trigger: "stage_end", percent: 0 }] })}><Plus className="mr-2 h-4 w-4" />{t("workspace.payment.designAdd")}</Button><span className="text-sm tabular-nums">{t("workspace.payment.designTotal", { percent: draft.rows.reduce((sum, row) => sum + row.percent, 0) })}</span></div>
    </>}
    <Button size="sm" variant="outline" disabled={saving} onClick={save}><Save className="mr-2 h-4 w-4" />{t("common:save")}</Button>
  </section>;
}