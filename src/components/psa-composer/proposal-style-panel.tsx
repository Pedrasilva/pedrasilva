import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Proposal-level style settings panel.
 *
 * Shown in the right sidebar when no block is selected. Lets the user pick
 * heading/body fonts, heading weight, body alignment and body font-size for
 * the whole proposal. Values are stored as JSON in psa_proposals.style_settings
 * and applied to .proposal-print-document via CSS variables on the canvas.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { PSA_BRAND_TYPOGRAPHY, proposalFontAvailable } from "@/lib/psa-proposal/typography";
import { useMasterDefault, useSaveMasterDefault } from "@/lib/psa-proposal/use-master-page";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ProposalMasterButton } from "./master-page-editor";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useUpdateProposal } from "@/lib/psa-proposal/use-psa-proposal";
import type {
  PsaProposal,
  PsaProposalStyleSettings,
} from "@/lib/psa-proposal/types";

const HEADING_FONTS = [
  { label: "The Future (Pedra Silva)", value: '"The Future", "Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "crm:composer.typography.interSans", value: '"Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "crm:composer.typography.manropeSans", value: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { label: "crm:composer.typography.frauncesSerif", value: '"Fraunces", Georgia, serif' },
  { label: "crm:composer.typography.sourceSerif", value: '"Source Serif 4", Georgia, serif' },
  { label: "crm:composer.typography.garamondSerif", value: '"EB Garamond", Georgia, serif' },
];

const BODY_FONTS = [
  { label: "Signifier (Pedra Silva)", value: '"Signifier", "Source Serif 4", Georgia, serif' },
  { label: "The Future (Pedra Silva)", value: '"The Future", "Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "crm:composer.typography.sourceSerif", value: '"Source Serif 4", "EB Garamond", Georgia, serif' },
  { label: "crm:composer.typography.garamondSerif", value: '"EB Garamond", Georgia, serif' },
  { label: "crm:composer.typography.frauncesSerif", value: '"Fraunces", Georgia, serif' },
  { label: "crm:composer.typography.interSans", value: '"Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "crm:composer.typography.manropeSans", value: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
];

const PSA_BRAND_PRESET = PSA_BRAND_TYPOGRAPHY;

const WEIGHTS = [
  { label: "crm:composer.typography.regular400", value: 400 },
  { label: "crm:composer.typography.medium500", value: 500 },
  { label: "crm:composer.typography.semibold600", value: 600 },
  { label: "crm:composer.typography.bold700", value: 700 },
];

const ALIGNMENTS: { label: string; value: NonNullable<PsaProposalStyleSettings["bodyAlign"]> }[] = [
  { label: "crm:composer.typography.left", value: "left" },
  { label: "crm:composer.typography.justify", value: "justify" },
  { label: "crm:composer.typography.center", value: "center" },
  { label: "crm:composer.typography.right", value: "right" },
];

export function ProposalStylePanel({ proposal }: { proposal: PsaProposal }) {
  useTranslation();
  const update = useUpdateProposal(proposal.id);
  const qc = useQueryClient();
  const defaults = useMasterDefault();
  const saveMaster = useSaveMasterDefault();
  const [v,setValue]=useState<PsaProposalStyleSettings>(proposal.style_settings??{});
  const [saveStatus,setSaveStatus]=useState<'saved'|'saving'|'error'>('saved');
  const [fontWarning,setFontWarning]=useState(false);
  const generation=useRef(0);
  const saveQueue=useRef<Promise<unknown>>(Promise.resolve());
  const locked=!!proposal.locked_at||['sent','accepted'].includes(proposal.status);
  useEffect(()=>{if(saveStatus==='saved')setValue(proposal.style_settings??{});},[proposal.style_settings,saveStatus]);
  useEffect(()=>{
    let cancelled=false;
    Promise.all([proposalFontAvailable(v.headingFont??PSA_BRAND_PRESET.headingFont??''),proposalFontAvailable(v.bodyFont??PSA_BRAND_PRESET.bodyFont??'')]).then(results=>{if(!cancelled)setFontWarning(results.some(result=>!result));});
    return ()=>{cancelled=true;};
  },[v.headingFont,v.bodyFont]);
  useEffect(()=>{
    if(saveStatus!=='saving')return;
    const version=generation.current;
    const timer=setTimeout(()=>{
      saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>update.mutateAsync({style_settings:v})).then(()=>{if(generation.current===version)setSaveStatus('saved');}).catch(error=>{if(generation.current===version)setSaveStatus('error');toast.error(error instanceof Error?error.message:uiI18n.t('common:error'));});
    },500);
    return ()=>clearTimeout(timer);
  },[v]);
  function patch(next:Partial<PsaProposalStyleSettings>){
    if(locked)return;
    generation.current+=1;
    const merged={...v,...next};setValue(merged);setSaveStatus('saving');
    void qc.cancelQueries({queryKey:['psa-proposal',proposal.id]});
    qc.setQueryData<PsaProposal>(['psa-proposal',proposal.id],prev=>prev?{...prev,style_settings:merged}:prev);
  }
  const bodySize = v.bodySize ?? 10.5;
  const headingScale = v.headingScale ?? 1;
  const marginTop = v.marginTop ?? 34;
  const marginBottom = v.marginBottom ?? 32;
  const marginLeft = v.marginLeft ?? 14;
  const marginRight = v.marginRight ?? 14;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
         {uiI18n.t("crm:quoteEditor.documentLanguage")} </div>
      <Select
        value={(proposal.language ?? "pt-PT")}
        onValueChange={(v) => update.mutate({ language: v } as Partial<PsaProposal>)}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pt-PT">Português (Portugal)</SelectItem>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[11px] text-zinc-500">
         {uiI18n.t("crm:quoteEditor.documentLanguageHint")} </p>

      <div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase">{uiI18n.t("crm:quoteEditor.proposalTypography")}</span><span role="status" className="text-xs text-muted-foreground">{uiI18n.t(saveStatus==='error'?'common:error':saveStatus==='saving'?'common:saving':'common:saved')}</span></div>
      <p className="text-xs text-muted-foreground">{uiI18n.t('crm:quoteEditor.typographyScopeHint')}</p>
      {fontWarning&&<p role="alert" className="text-xs text-destructive">{uiI18n.t('crm:quoteEditor.fontEmbedWarning')}</p>}
      <fieldset disabled={locked} className="contents">
      <p className="text-[11px] text-zinc-500">
         {uiI18n.t("crm:quoteEditor.typographyHint")} </p>

      <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700">
           {uiI18n.t("common:preset")} </div>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => patch(PSA_BRAND_PRESET)}
        >
           {uiI18n.t("crm:quoteEditor.applyBrand")} </Button>
        <Button size="sm" variant="outline" onClick={()=>patch(PSA_BRAND_PRESET)}>{uiI18n.t('crm:quoteEditor.resetBrand')}</Button>
        <Button size="sm" variant="outline" disabled={!defaults.data||saveMaster.isPending} onClick={()=>{if(!defaults.data)return;void saveMaster.mutateAsync({template:{...defaults.data.template,typography:{headingFont:v.headingFont,bodyFont:v.bodyFont,headingWeight:v.headingWeight,bodyAlign:v.bodyAlign,bodySize:v.bodySize,headingScale:v.headingScale,paragraphGap:v.paragraphGap}},revision:defaults.data.revision}).then(()=>toast.success(uiI18n.t('common:masterPage.saved'))).catch(error=>toast.error(error.message));}}>{uiI18n.t('crm:quoteEditor.saveTypographyMaster')}</Button>
        <p className="text-[10px] text-zinc-500 leading-snug">
           {uiI18n.t("crm:quoteEditor.brandFontsHint")} </p>
      </div>



      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.headingFont")} </Label>
        <Select
          value={v.headingFont ?? HEADING_FONTS[0].value}
          onValueChange={(v) => patch({ headingFont: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {HEADING_FONTS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label.startsWith("crm:") ? uiI18n.t(f.label) : f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.headingWeight")} </Label>
        <Select
          value={String(v.headingWeight ?? 700)}
          onValueChange={(v) => patch({ headingWeight: Number(v) })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {WEIGHTS.map((w) => (
              <SelectItem key={w.value} value={String(w.value)}>{uiI18n.t(w.label)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bodyFont")} </Label>
        <Select
          value={v.bodyFont ?? BODY_FONTS[0].value}
          onValueChange={(v) => patch({ bodyFont: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BODY_FONTS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label.startsWith("crm:") ? uiI18n.t(f.label) : f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bodyAlignment")} </Label>
        <Select
          value={v.bodyAlign ?? "justify"}
          onValueChange={(v) => patch({ bodyAlign: v as PsaProposalStyleSettings["bodyAlign"] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALIGNMENTS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{uiI18n.t(a.label)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bodySizePrefix")} {bodySize.toLocaleString(uiI18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}  {uiI18n.t("crm:quoteEditor.pointSuffix")} </Label>
        <Slider
          min={8}
          max={14}
          step={0.5}
          value={[bodySize]}
          onValueChange={([v]) => patch({ bodySize: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
           {uiI18n.t("crm:quoteEditor.headingSizePrefix")} {Math.round(headingScale * 100)}%)
        </Label>
        <Slider
          min={0.7}
          max={1.6}
          step={0.05}
          value={[headingScale]}
          onValueChange={([v]) => patch({ headingScale: v })}
        />
        <p className="text-[10px] text-zinc-500">
           {uiI18n.t("crm:quoteEditor.headingScaleHint")} </p>
      </div>


      <div className="space-y-1"><Label>{uiI18n.t('crm:quoteEditor.paragraphSpacing')}</Label><Slider aria-label={uiI18n.t('crm:quoteEditor.paragraphSpacing')} min={0} max={1.5} step={0.05} value={[v.paragraphGap??0.75]} onValueChange={([value])=>patch({paragraphGap:value})}/></div>
      </fieldset>
      <div className="border-t pt-3"><ProposalMasterButton proposal={proposal} readOnly={!!proposal.locked_at || proposal.status === "sent" || proposal.status === "accepted"} /></div>
    </div>
  );
}
