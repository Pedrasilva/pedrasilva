import uiI18n from "@/i18n/index";
/**
 * Construction-percentage architectural fee calculator.
 *
 * Lives in the Overview tab of a Project Proposal. Persists its inputs to
 * `fee_proposals.project_fee_calculation` (JSONB) and exposes a helper to
 * push the resulting `finalFee` into the quote's headline `valor`,
 * `construction_cost` and `fee_percentage` fields.
 *
 * Hidden for Consultancy Proposals — the parent route already gates that
 * via `quote.quote_category`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {Plus,Trash2,Undo2} from 'lucide-react';
import {CalculatorApplyDialog} from './calculator-apply-dialog';
import {calculatorHasConflicts,type CalculatorPreview} from '@/lib/quotes/calculator-planning';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { formatEUR } from "@/lib/crm/types";
import {
  computeFeeCalculator,
  parseFeeCalculatorPayload,
  type FeeCalculatorInputs,
  type FeeCategory,
} from "@/lib/quotes/fee-calculator";

interface Props {
  quoteId: string;
  initialPayload: unknown;
  /** Callback fired after the user clicks "Apply to fee" so the parent
   *  form can refresh the headline `valor` / `construction_cost` /
   *  `fee_percentage` inputs without a full page reload. */
  onApplied?: (finalFee: number, constructionValue: number, feePercentage: number) => void;
}

function pctInput(value: number): string {
  // 0.10 → "10"
  return value === 0 ? "" : String(Math.round(value * 10000) / 100);
}

function parsePct(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n) / 100;
}

function numInput(value: number | null): string {
  return value == null ? "" : String(value);
}

export function QuoteFeeCalculatorCard({ quoteId, initialPayload, onApplied }: Props) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const [preview,setPreview]=useState<CalculatorPreview|null>(null);
  const [undoId,setUndoId]=useState<string|null>(null);

  const [inputs, setInputs] = useState<FeeCalculatorInputs>(() =>
    parseFeeCalculatorPayload(initialPayload),
  );

  // Re-hydrate when a different quote loads (route navigation between quotes).
  useEffect(() => {
    setInputs(parseFeeCalculatorPayload(initialPayload));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  const result = useMemo(() => computeFeeCalculator(inputs), [inputs]);

  const stageTotal = useMemo(
    () => inputs.stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0),
    [inputs.stages],
  );

  // Auto-save inputs to fee_proposals.project_fee_calculation (JSONB) on
  // every change, debounced. The manual "Save draft" button stays as a
  // visible confirmation, but typing values is enough — no click required.
  const isFirstRender = useRef(true);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setAutoSaveState("saving");
    const handle = setTimeout(async () => {
      const { error } = await supabase
        .from("fee_proposals")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ project_fee_calculation: inputs as any })
        .eq("id", quoteId);
      if (error) {
        setAutoSaveState("error");
        toast.error(error.message);
      } else {
        setAutoSaveState("saved");
        qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [inputs, quoteId, qc]);

  const save = useMutation({
    mutationFn: async (apply: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: any = { project_fee_calculation: inputs };
      if (apply) {
        updates.valor = result.finalFee;
        updates.construction_cost = result.constructionValue || null;
        updates.fee_percentage = Number(result.feePercentage.toFixed(4)) || null;
      }
      const { error } = await supabase
        .from("fee_proposals")
        .update(updates)
        .eq("id", quoteId);
      if (error) throw error;
      return apply;
    },
    onSuccess: (applied) => {
      toast.success(
        applied ? t("feeCalculator.appliedToast") : t("feeCalculator.savedToast"),
      );
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      if (applied) {
        onApplied?.(result.finalFee, result.constructionValue, result.feePercentage);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({mutationFn:async({action,overwrite,remove,revision}:{action:string;overwrite:boolean;remove:boolean;revision:string})=>{
    const r=await supabase.rpc('quote_apply_calculator',{_quote_id:quoteId,_inputs:inputs as unknown as import('@/integrations/supabase/types').Json,_revision:revision,_existing_action:action,_overwrite_manual:overwrite,_delete_removed:remove});if(r.error)throw Error(r.error.message);return r.data;
  },onSuccess:async id=>{setUndoId(id);setPreview(null);await qc.invalidateQueries();onApplied?.(result.finalFee,result.constructionValue,result.feePercentage);toast.success(t('feeCalculator.appliedToast'));},onError:(e:Error)=>toast.error(e.message)});
  const review=useMutation({mutationFn:async()=>{
    const ids=inputs.stages.map((s,i)=>s.id??`legacy-${i}`);
    const r=await supabase.rpc('quote_calculator_preview',{_quote_id:quoteId,_row_ids:ids});if(r.error)throw Error(r.error.message);return r.data as unknown as CalculatorPreview;
  },onSuccess:p=>{if(calculatorHasConflicts(p))setPreview(p);else apply.mutate({action:'add',overwrite:false,remove:false,revision:p.revision});},onError:(e:Error)=>toast.error(e.message)});
  const undo=useMutation({mutationFn:async()=>{if(!undoId)return;const r=await supabase.rpc('quote_undo_template_import',{_import_id:undoId});if(r.error)throw Error(r.error.message);},onSuccess:async()=>{setUndoId(null);await qc.invalidateQueries();toast.success(t('quoteTemplate.undone'));},onError:(e:Error)=>toast.error(e.message)});
  const busy=apply.isPending||review.isPending||save.isPending||undo.isPending;

  const setStageName = (idx: number, name: string) =>
    setInputs((p) => ({
      ...p,
      stages: p.stages.map((s, i) => (i === idx ? { ...s, id:s.id??`legacy-${i}`, name } : s)),
    }));

  const setStagePct = (idx: number, raw: string) =>
    setInputs((p) => ({
      ...p,
      stages: p.stages.map((s, i) =>
        i === idx ? { ...s, id:s.id??`legacy-${i}`, percentage: parsePct(raw) } : s,
      ),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("feeCalculator.title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("feeCalculator.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* INPUTS */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>{t("feeCalculator.constructionValue")}</Label>
            <Input
              type="number" step="0.01" min={0}
              value={numInput(inputs.constructionValue)}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  constructionValue: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              placeholder={t("feeCalculator.constructionValuePh")}
            />
          </div>
          <div>
            <Label>{t("feeCalculator.costPerSqm")}</Label>
            <Input
              type="number" step="0.01" min={0}
              value={numInput(inputs.costPerSqm)}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  costPerSqm: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>{t("feeCalculator.area")}</Label>
            <Input
              type="number" step="0.01" min={0}
              value={numInput(inputs.area)}
              onChange={(e) =>
                setInputs((p) => ({
                  ...p,
                  area: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </div>
          <div>
            <Label>{t("feeCalculator.category")}</Label>
            <Select
              value={String(inputs.category)}
              onValueChange={(v) =>
                setInputs((p) => ({ ...p, category: (Number(v) as FeeCategory) }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">{t("feeCalculator.category2")}</SelectItem>
                <SelectItem value="3">{t("feeCalculator.category3")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("feeCalculator.discount")}</Label>
            <Input
              type="number" step="0.01" min={0} max={100}
              value={pctInput(inputs.discount)}
              onChange={(e) => setInputs((p) => ({ ...p, discount: parsePct(e.target.value) }))}
            />
          </div>
          <div>
            <Label>{t("feeCalculator.heritageUplift")}</Label>
            <Input
              type="number" step="0.01" min={0} max={100}
              value={pctInput(inputs.heritageUplift)}
              onChange={(e) =>
                setInputs((p) => ({ ...p, heritageUplift: parsePct(e.target.value) }))
              }
              placeholder="30"
            />
          </div>
          <div>
            <Label>{t("feeCalculator.extensionUplift")}</Label>
            <Input
              type="number" step="0.01" min={0} max={100}
              value={pctInput(inputs.extensionUplift)}
              onChange={(e) =>
                setInputs((p) => ({ ...p, extensionUplift: parsePct(e.target.value) }))
              }
              placeholder="20"
            />
          </div>
        </div>

        <Separator />

        {/* SUMMARY (read-only) */}
        <div className="rounded-md border bg-muted/30 p-4 text-sm space-y-1.5">
          <SummaryRow label={t("feeCalculator.summary.constructionValue")} value={formatEUR(result.constructionValue)} />
          <SummaryRow label={t("feeCalculator.summary.foundationDeduction")} value={`− ${formatEUR(result.foundationDeduction)}`} />
          {result.heritageUpliftValue > 0 && (
            <SummaryRow label={t("feeCalculator.summary.heritageUplift")} value={`+ ${formatEUR(result.heritageUpliftValue)}`} />
          )}
          {result.extensionUpliftValue > 0 && (
            <SummaryRow label={t("feeCalculator.summary.extensionUplift")} value={`+ ${formatEUR(result.extensionUpliftValue)}`} />
          )}
          <SummaryRow label={t("feeCalculator.summary.adjustedValue")} value={formatEUR(result.adjustedConstructionValue)} bold />
          <SummaryRow
            label={t("feeCalculator.summary.feePct")}
            value={`${result.feePercentage.toFixed(2)} %`}
          />
          <SummaryRow label={t("feeCalculator.summary.baseFee")} value={formatEUR(result.baseFee)} />
          <Separator className="my-2" />
          <SummaryRow
            label={t("feeCalculator.summary.finalFee")}
            value={formatEUR(result.finalFee)}
            bold
            highlight
          />
        </div>

        {/* STAGE BREAKDOWN */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("feeCalculator.stageBreakdown")}
            </Label>
            <span
              className={
                "text-xs " +
                (Math.abs(stageTotal - 1) < 0.001
                  ? "text-muted-foreground"
                  : "text-amber-600 dark:text-amber-400")
              }
            >
              {t("feeCalculator.stageTotal", { pct: (stageTotal * 100).toFixed(1) })}
            </span>
          </div>
          <div className="rounded-md border divide-y">
            {inputs.stages.map((s, idx) => (
              <div key={s.id??idx} className="grid grid-cols-12 gap-2 items-center p-2 text-sm">
                <div className="col-span-1 text-xs text-muted-foreground">
                  {idx + 1}
                </div>
                <Input
                  className="col-span-5 h-8"
                  placeholder={t("feeCalculator.stageNamePh")}
                  value={s.name}
                  onChange={(e) => setStageName(idx, e.target.value)}
                />
                <div className="col-span-2 flex items-center gap-1">
                  <Input
                    className="h-8"
                    type="number" step="0.01" min={0} max={100}
                    value={pctInput(s.percentage)}
                    onChange={(e) => setStagePct(idx, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="col-span-3 text-right tabular-nums">
                  {formatEUR(result.stageBreakdown[idx]?.amount ?? 0)}
                </div>
                <Button variant="ghost" size="icon" title={t('feeCalculator.planning.removeRow')} aria-label={t('feeCalculator.planning.removeRow')} disabled={busy} onClick={()=>setInputs(p=>({...p,stages:p.stages.filter((_,i)=>i!==idx)}))}><Trash2 className="h-4 w-4"/></Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={()=>setInputs(p=>({...p,stages:[...p.stages,{id:crypto.randomUUID(),name:'',percentage:0}]}))}><Plus className="h-4 w-4"/>{t('feeCalculator.planning.addRow')}</Button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {undoId && <Button variant="outline" size="sm" disabled={busy} onClick={()=>undo.mutate()}><Undo2 className="h-4 w-4"/>{t('quoteTemplate.undo')}</Button>}
          <span className="mr-auto text-xs text-muted-foreground">
            {autoSaveState === "saving"
              ? uiI18n.t("common:saving")
              : autoSaveState === "saved"
                ? uiI18n.t("crm:quoteEditor.autosaved")
                : autoSaveState === "error"
                  ? uiI18n.t("crm:quoteEditor.saveFailed")
                  : ""}
          </span>
          <Button
            variant="outline" size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate(false)}
          >
            {t("feeCalculator.saveDraft")}
          </Button>
          <Button
            size="sm"
            disabled={busy || result.finalFee <= 0 || Math.abs(stageTotal-1)>0.000001 || inputs.stages.some(s=>!s.name.trim())}
            onClick={() => {setInputs(p=>({...p,stages:p.stages.map((s,i)=>({...s,id:s.id??`legacy-${i}`}))}));review.mutate();}}
          >
            {t("feeCalculator.applyToFee")}
          </Button>
        </div>
      </CardContent>
      <CalculatorApplyDialog key={preview?.revision??'closed'} preview={preview} pending={apply.isPending} onCancel={()=>setPreview(null)} onApply={(action,overwrite,remove)=>{if(preview)apply.mutate({action,overwrite,remove,revision:preview.revision});}}/>
    </Card>
  );
}

function SummaryRow({
  label, value, bold, highlight,
}: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  useTranslation();
  return (
    <div className={"flex items-center justify-between " + (highlight ? "text-base" : "")}>
      <span className={"text-muted-foreground " + (highlight ? "text-foreground" : "")}>{label}</span>
      <span className={"tabular-nums " + (bold ? "font-semibold" : "")}>{value}</span>
    </div>
  );
}
