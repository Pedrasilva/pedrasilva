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
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

export function ProposalStylePanel({ proposal }: { proposal: PsaProposal }) {
  useTranslation();
  const update = useUpdateProposal(proposal.id);
  const qc = useQueryClient();
  const s = proposal.style_settings ?? {};
  const pendingRef = useRef<PsaProposalStyleSettings | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch(next: Partial<PsaProposalStyleSettings>) {
    // Merge onto latest pending (or current) settings to avoid overwrites
    // between rapid slider ticks.
    const base = pendingRef.current ?? s;
    const merged = { ...base, ...next } as PsaProposalStyleSettings;
    pendingRef.current = merged;

    // Optimistic cache update so the canvas re-renders instantly.
    qc.setQueryData<PsaProposal | undefined>(
      ["psa-proposal", proposal.id],
      (prev) => (prev ? { ...prev, style_settings: merged } : prev),
    );

    // Debounce the network write so dragging a slider doesn't fire a
    // request per tick.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const toSave = pendingRef.current;
      pendingRef.current = null;
      timerRef.current = null;
      if (toSave) update.mutate({ style_settings: toSave } as Partial<PsaProposal>);
    }, 250);
  }

  const bodySize = s.bodySize ?? 10.5;
  const headingScale = s.headingScale ?? 1;
  const marginTop = s.marginTop ?? 34;
  const marginBottom = s.marginBottom ?? 32;
  const marginLeft = s.marginLeft ?? 14;
  const marginRight = s.marginRight ?? 14;

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
           {uiI18n.t("crm:quoteEditor.preset")} </div>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => update.mutate({ style_settings: PSA_BRAND_PRESET } as Partial<PsaProposal>)}
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
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bodySizePrefix")} {bodySize.toFixed(1)}  {uiI18n.t("crm:quoteEditor.pointSuffix")} </Label>
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


      <div className="pt-2 border-t border-zinc-200" />

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
         {uiI18n.t("crm:quoteEditor.pageMargins")} </div>
      <p className="text-[11px] text-zinc-500">
         {uiI18n.t("crm:quoteEditor.pageMarginsHint")} </p>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.topMarginPrefix")} {marginTop}  {uiI18n.t("crm:quoteEditor.millimetreSuffix")} </Label>
        <Slider
          min={15}
          max={60}
          step={1}
          value={[marginTop]}
          onValueChange={([v]) => patch({ marginTop: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bottomMarginPrefix")} {marginBottom}  {uiI18n.t("crm:quoteEditor.millimetreSuffix")} </Label>
        <Slider
          min={15}
          max={60}
          step={1}
          value={[marginBottom]}
          onValueChange={([v]) => patch({ marginBottom: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.leftMarginPrefix")} {marginLeft}  {uiI18n.t("crm:quoteEditor.millimetreSuffix")} </Label>
        <Slider
          min={5}
          max={60}
          step={1}
          value={[marginLeft]}
          onValueChange={([v]) => patch({ marginLeft: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.rightMarginPrefix")} {marginRight}  {uiI18n.t("crm:quoteEditor.millimetreSuffix")} </Label>
        <Slider
          min={5}
          max={60}
          step={1}
          value={[marginRight]}
          onValueChange={([v]) => patch({ marginRight: v })}
        />
      </div>

      <div className="pt-2 border-t border-zinc-200" />

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
         {uiI18n.t("crm:quoteEditor.header")} </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showHeader")} </Label>
        <Switch
          checked={s.showHeader !== false}
          onCheckedChange={(v) => patch({ showHeader: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.brandFirstLine")} </Label>
        <Input
          value={s.headerBrand ?? "PEDRA SILVA"}
          onChange={(e) => patch({ headerBrand: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.brandSecondLine")} </Label>
        <Input
          value={s.headerBrandSub ?? "ARCHITECTS"}
          onChange={(e) => patch({ headerBrandSub: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.contactEmail")} </Label>
        <Input
          value={s.headerContactEmail ?? "info@pedrasilva.com"}
          onChange={(e) => patch({ headerContactEmail: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.website")} </Label>
        <Input
          value={s.headerContactWebsite ?? "www.pedrasilva.com"}
          onChange={(e) => patch({ headerContactWebsite: e.target.value })}
        />
      </div>

      <div className="pt-2 border-t border-zinc-200" />

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
         {uiI18n.t("crm:quoteEditor.footer")} </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showFooter")} </Label>
        <Switch
          checked={s.showFooter !== false}
          onCheckedChange={(v) => patch({ showFooter: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.addressLines")} </Label>
        <Textarea
          rows={3}
          value={s.footerAddress ?? "Trav. Corpo Santo 10, 1.ºD\n1200-131 Lisboa, Portugal"}
          onChange={(e) => patch({ footerAddress: e.target.value })}
        />
      </div>


      <div className="pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => update.mutate({ style_settings: {} } as Partial<PsaProposal>)}
        >
           {uiI18n.t("crm:quoteEditor.resetDefaults")} </Button>
      </div>
    </div>
  );
}
