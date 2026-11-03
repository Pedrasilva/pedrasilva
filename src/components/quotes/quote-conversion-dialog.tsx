import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { supabase } from "@/integrations/supabase/client";
import { useQuoteLifecycle } from "@/lib/quotes/use-quote-lifecycle";
import { canConvertQuote } from "@/lib/quotes/quote-lifecycle";
import { numberStages, formatStageLabel } from "@/lib/quotes/stage-numbering";
import { toast } from "@/lib/toast";
import { CompanyPicker } from "@/components/crm/company-picker";
import { ConversionInvoicePreview } from "@/components/quotes/conversion-invoice-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

export function QuoteConversionDialog({ quoteId, open, onOpenChange }: { quoteId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const lifecycleQ = useQuoteLifecycle(quoteId);
  const quoteQ = useQuery({ queryKey: ["conversion-quote", quoteId], queryFn: async () => {
    const { data, error } = await supabase.from("fee_proposals").select("id,company_id,pm_project_id,opportunity:crm_opportunities(company_id)").eq("id", quoteId).single();
    if (error) throw error;
    return data;
  }});
  const quote = quoteQ.data;
  const convert = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error(t("quotes.loadError"));
      if (!lifecycleQ.data || !canConvertQuote(lifecycleQ.data.state)) throw new Error(t("quotes.convertOnlyApproved"));
      if (quote.pm_project_id) {
        return {
          id: quote.pm_project_id,
          alreadyExisted: true,
          stagesCopied: 0,
          dependenciesCopied: 0,
          allocationsCopied: 0,
          allocationsSkipped: 0,
          externalCopied: 0,
        };
      }

      if (!conversionPreview) throw new Error(t("projects:gantt.relative.previewRequired"));
      const {data,error}=await supabase.rpc("pm_convert_relative_quote",{_quote:quote.id,_start:conversionStart,_revision:conversionPreview.revision});
      if(error)throw error;
      return data as unknown as {id:string;alreadyExisted:boolean;stagesCopied:number;dependenciesCopied:number;allocationsCopied:number;allocationsSkipped:number;externalCopied:number};
    },
    onSuccess: (res) => {
      if (res.alreadyExisted) {
        toast.success(t("quotes.convertExisting"));
      } else {
        toast.success(
          t("quotes.convertSummary", {
            stages: res.stagesCopied,
            allocations: res.allocationsCopied,
            external: res.externalCopied,
            dependencies: res.dependenciesCopied,
          }),
        );
        if (res.allocationsSkipped > 0) {
          toast.warning(
            t("quotes.convertSkipped", { count: res.allocationsSkipped }),
          );
        }
      }
      qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-lifecycle", quoteId] });
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["crm_opportunity"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunities"] });
      qc.invalidateQueries({ queryKey: ["crm_opportunity_projects"] });
      qc.invalidateQueries({ queryKey: ["crm-opportunities-overview"] });
      // Land on the allocations page so the PM can assign resources to
      // stages right after activation. They can skip and do it later by
      // navigating to the project overview.
      if (res.alreadyExisted) {
        navigate({ to: "/projects/$projectId", params: { projectId: res.id } });
      } else {
        navigate({ to: "/projects/$projectId/allocations", params: { projectId: res.id } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [showConversionCompany, setShowConversionCompany] = useState(false);
  const setConversionCompany = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.from("fee_proposals").update({ company_id: companyId }).eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: async () => {
      setConversionPreview(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["fee_proposal", quoteId] }),
        qc.invalidateQueries({ queryKey: ["quote-lifecycle", quoteId] }),
        qc.invalidateQueries({ queryKey: ["fee_proposals_by_opp"] }),
      ]);
      setShowConversionCompany(false);
      qc.invalidateQueries({ queryKey: ["conversion-quote", quoteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [conversionStart,setConversionStart]=useState("");
  const [conversionPreview,setConversionPreview]=useState<{revision:string;start_date:string;commercial:{total_fee:number};stages:Array<{id:string;name:string;parent_stage_id:string|null;sort_order:number;start_date:string;end_date:string;baseline_start_date?:string;baseline_end_date?:string;working_days?:number;hours?:number;fee?:number}>;allocations:Array<{id:string;resource_name:string;hours_per_day:number;start_date:string;end_date:string}>;payments:Array<{id:string;label:string;amount:number;expected_invoice_date:string|null;expected_payment_date:string|null}>}|null>(null);
  const [conversionPreviewPending,setConversionPreviewPending]=useState(false);
  const previewConversion=async()=>{
    if(!conversionStart)return;setConversionPreviewPending(true);
    try {const {data,error}=await supabase.rpc("pm_quote_conversion_preview",{_quote:quoteId,_start:conversionStart});if(error)throw error;setConversionPreview(data as unknown as NonNullable<typeof conversionPreview>);}
    catch(e){toast.error(t((e as Error).message));}finally {setConversionPreviewPending(false);}
  };

  const lifecycle = lifecycleQ.data;
  if (!quote || !lifecycle) return null;
  return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("quotes.convertDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("quotes.convertDialog.description")}
              {lifecycle.state === "approved" && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  {t("quotes.flow.unsignedWarning")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="font-medium">{t("quotes.flow.checklistTitle")}</p>
            {lifecycle.missing.map(item => <Button key={item} variant="link" onClick={() => {if(item === "client") {setShowConversionCompany(true);return;} onOpenChange(false);navigate({ to: "/crm/quotes/$quoteId", params: { quoteId }, search: { step: "publish" } });}}>{t(`quotes.flow.${item}`)}</Button>)}
            {showConversionCompany && <CompanyPicker value={quote.company_id ?? quote.opportunity?.company_id ?? null} onChange={id => setConversionCompany.mutate(id)} disabled={setConversionCompany.isPending} />}
            <Label htmlFor="conversion-start">{t("projects:gantt.relative.convertStart")}</Label>
            <Input id="conversion-start" type="date" value={conversionStart} onChange={e=>{setConversionStart(e.target.value);setConversionPreview(null);}}/>
            <Button variant="outline" onClick={previewConversion} disabled={!conversionStart||conversionPreviewPending||setConversionCompany.isPending||lifecycle.missing.length>0}>{t("projects:gantt.relative.convertPreview")}</Button>
            {conversionPreview && <div className="max-h-72 overflow-auto text-xs"><div className="flex flex-wrap justify-between gap-2 font-medium"><span>{conversionPreview.start_date}</span><span>{t("glossary:financial.fee")} · {new Intl.NumberFormat(uiI18n.language,{style:"currency",currency:"EUR"}).format(conversionPreview.commercial.total_fee)}</span></div>{numberStages(conversionPreview.stages).map(({stage:s,number})=><div key={s.id} className="border-b border-border py-2"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{formatStageLabel(s,number)}</span><span>{s.working_days ?? "—"} {t("projects:gantt.wdShort")} · {new Intl.NumberFormat(uiI18n.language,{maximumFractionDigits:1}).format(s.hours ?? 0)} {t("common:hours")} · {new Intl.NumberFormat(uiI18n.language,{style:"currency",currency:"EUR"}).format(s.fee ?? 0)}</span></div><div className="flex flex-wrap justify-between gap-2 text-muted-foreground"><span>{t("projects:gantt.relative.previewBaseline")}: {s.baseline_start_date} → {s.baseline_end_date}</span><span>{t("projects:gantt.relative.previewLive")}: {s.start_date} → {s.end_date}</span></div>{s.baseline_end_date && s.baseline_end_date!==s.end_date && <div className="font-medium text-amber-700 dark:text-amber-400">{t("projects:gantt.relative.previewShift",{count:Math.round((Date.parse(s.end_date)-Date.parse(s.baseline_end_date))/86400000)})}</div>}</div>)}{conversionPreview.allocations.map((a,i)=><div key={`${a.id}:${i}`} className="flex flex-wrap justify-between gap-2 py-1"><span>{a.resource_name} · {new Intl.NumberFormat(uiI18n.language,{maximumFractionDigits:2}).format(a.hours_per_day)} {t("common:hours")}</span><span>{a.start_date} → {a.end_date}</span></div>)}{conversionPreview.payments && <ConversionInvoicePreview quoteId={quoteId} payments={conversionPreview.payments}/>}</div>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={!canConvertQuote(lifecycle.state)||!conversionPreview||convert.isPending||lifecycle.missing.length>0}
              onClick={() => {
                onOpenChange(false);
                convert.mutate();
              }}
            >
              {t("quotes.convertDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

  );
}
