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
import { useEffect } from "react";
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

const PSA_BRAND_PRESET: PsaProposalStyleSettings = {
  headingFont: '"The Future", "Inter", "Helvetica Neue", Arial, sans-serif',
  bodyFont: '"Signifier", "Source Serif 4", Georgia, serif',
  headingWeight: 700,
  bodyAlign: "justify",
  bodySize: 10.5,
};


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

type StyleEditState = { latest: PsaProposalStyleSettings | null; timer: ReturnType<typeof setTimeout> | null; inFlight: number };
const styleEdits = new Map<string, StyleEditState>();
function styleEditState(id: string): StyleEditState {
  let state = styleEdits.get(id);
  if (!state) { state = { latest: null, timer: null, inFlight: 0 }; styleEdits.set(id, state); }
  return state;
}

export function ProposalStylePanel({ proposal }: { proposal: PsaProposal }) {
  useTranslation();
  const update = useUpdateProposal(proposal.id);
  const qc = useQueryClient();
  const s = proposal.style_settings ?? {};
  // Edit state lives per proposal outside the component: the panel can remount
  // while the paged view repaginates, and a refetch of an older save must not
  // snap sliders (or the paged view) back mid-drag.
  const edit = styleEditState(proposal.id);
  useEffect(() => {
    const latest = edit.latest;
    if (!latest || JSON.stringify(latest) === JSON.stringify(proposal.style_settings ?? {})) return;
    qc.setQueryData<PsaProposal | undefined>(["psa-proposal", proposal.id], (prev) => (prev ? { ...prev, style_settings: latest } : prev));
  }, [proposal.style_settings, proposal.id, qc, edit]);

  function patch(next: Partial<PsaProposalStyleSettings>) {
    // Merge onto the newest local settings to avoid overwrites between ticks.
    const merged = { ...(edit.latest ?? s), ...next } as PsaProposalStyleSettings;
    edit.latest = merged;
    void qc.cancelQueries({ queryKey: ["psa-proposal", proposal.id] });

    // Optimistic cache update so the canvas re-renders instantly.
    qc.setQueryData<PsaProposal | undefined>(
      ["psa-proposal", proposal.id],
      (prev) => (prev ? { ...prev, style_settings: merged } : prev),
    );

    // Debounce the network write so dragging a slider doesn't fire a
    // request per tick.
    if (edit.timer) clearTimeout(edit.timer);
    edit.timer = setTimeout(() => {
      edit.timer = null;
      const toSave = edit.latest;
      if (!toSave) return;
      edit.inFlight += 1;
      void update.mutateAsync({ style_settings: toSave } as Partial<PsaProposal>).catch(() => {}).finally(() => {
        edit.inFlight -= 1;
        // Keep guarding until the last save has settled and its refetch landed.
        window.setTimeout(() => {
          if (edit.inFlight === 0 && !edit.timer) edit.latest = null;
        }, 1500);
      });
    }, 250);
  }

  // Sliders read the newest local value so rapid ticks never compute from a stale save.
  const v = edit.latest ?? s;
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

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mt-2">
         {uiI18n.t("crm:quoteEditor.proposalTypography")} </div>
      <p className="text-[11px] text-zinc-500">
         {uiI18n.t("crm:quoteEditor.typographyHint")} </p>

      <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700">
           {uiI18n.t("common:preset")} </div>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => update.mutate({ style_settings: { ...s, ...PSA_BRAND_PRESET } } as Partial<PsaProposal>)}
        >
           {uiI18n.t("crm:quoteEditor.applyBrand")} </Button>
        <p className="text-[10px] text-zinc-500 leading-snug">
           {uiI18n.t("crm:quoteEditor.brandFontsHint")} </p>
      </div>



      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.headingFont")} </Label>
        <Select
          value={s.headingFont ?? HEADING_FONTS[0].value}
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
          value={String(s.headingWeight ?? 700)}
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
          value={s.bodyFont ?? BODY_FONTS[0].value}
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
          value={s.bodyAlign ?? "justify"}
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


      <div className="border-t pt-3"><ProposalMasterButton proposal={proposal} readOnly={!!proposal.locked_at || proposal.status === "sent" || proposal.status === "accepted"} /></div>
    </div>
  );
}
