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
  { label: "Inter (sans)", value: '"Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "Manrope (sans)", value: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { label: "Fraunces (display serif)", value: '"Fraunces", Georgia, serif' },
  { label: "Source Serif (serif)", value: '"Source Serif 4", Georgia, serif' },
  { label: "EB Garamond (classic serif)", value: '"EB Garamond", Georgia, serif' },
];

const BODY_FONTS = [
  { label: "Signifier (Pedra Silva)", value: '"Signifier", "Source Serif 4", Georgia, serif' },
  { label: "Source Serif (serif)", value: '"Source Serif 4", "EB Garamond", Georgia, serif' },
  { label: "EB Garamond (classic serif)", value: '"EB Garamond", Georgia, serif' },
  { label: "Fraunces (display serif)", value: '"Fraunces", Georgia, serif' },
  { label: "Inter (sans)", value: '"Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "Manrope (sans)", value: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
];

const PSA_BRAND_PRESET: PsaProposalStyleSettings = {
  headingFont: '"The Future", "Inter", "Helvetica Neue", Arial, sans-serif',
  bodyFont: '"Signifier", "Source Serif 4", Georgia, serif',
  headingWeight: 700,
  bodyAlign: "justify",
  bodySize: 10.5,
};


const WEIGHTS = [
  { label: "Regular (400)", value: 400 },
  { label: "Medium (500)", value: 500 },
  { label: "Semibold (600)", value: 600 },
  { label: "Bold (700)", value: 700 },
];

const ALIGNMENTS: { label: string; value: NonNullable<PsaProposalStyleSettings["bodyAlign"]> }[] = [
  { label: "Esquerda", value: "left" },
  { label: "Justificado", value: "justify" },
  { label: "Centrado", value: "center" },
  { label: "Direita", value: "right" },
];

export function ProposalStylePanel({ proposal }: { proposal: PsaProposal }) {
  const update = useUpdateProposal(proposal.id);
  const s = proposal.style_settings ?? {};

  function patch(next: Partial<PsaProposalStyleSettings>) {
    update.mutate({ style_settings: { ...s, ...next } } as Partial<PsaProposal>);
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
        Idioma da Proposta / Proposal Language
      </div>
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
        Controla labels do sistema (Fase, Duração, meses, etc.). Nomes das fases
        vindos do orçamento não são traduzidos.
      </p>

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mt-2">
        Tipografia da Proposta
      </div>
      <p className="text-[11px] text-zinc-500">
        Aplica-se a todos os blocos. Os títulos usam o tipo de letra de heading;
        os parágrafos usam o tipo de letra de body.
      </p>

      <div className="rounded-md border border-zinc-300 bg-zinc-50 p-2 space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-700">
          Predefinição
        </div>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => update.mutate({ style_settings: PSA_BRAND_PRESET } as Partial<PsaProposal>)}
        >
          Aplicar marca Pedra Silva
        </Button>
        <p className="text-[10px] text-zinc-500 leading-snug">
          The Future (títulos) + Signifier (texto), conforme manual gráfico.
        </p>
      </div>



      <div className="space-y-1">
        <Label className="text-xs">Tipo de letra — Títulos</Label>
        <Select
          value={s.headingFont ?? HEADING_FONTS[0].value}
          onValueChange={(v) => patch({ headingFont: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {HEADING_FONTS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Peso dos títulos</Label>
        <Select
          value={String(s.headingWeight ?? 700)}
          onValueChange={(v) => patch({ headingWeight: Number(v) })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {WEIGHTS.map((w) => (
              <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tipo de letra — Texto</Label>
        <Select
          value={s.bodyFont ?? BODY_FONTS[0].value}
          onValueChange={(v) => patch({ bodyFont: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BODY_FONTS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Alinhamento do texto</Label>
        <Select
          value={s.bodyAlign ?? "justify"}
          onValueChange={(v) => patch({ bodyAlign: v as PsaProposalStyleSettings["bodyAlign"] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALIGNMENTS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tamanho do texto ({bodySize.toFixed(1)} pt)</Label>
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
          Tamanho dos títulos ({Math.round(headingScale * 100)}%)
        </Label>
        <Slider
          min={0.7}
          max={1.6}
          step={0.05}
          value={[headingScale]}
          onValueChange={([v]) => patch({ headingScale: v })}
        />
        <p className="text-[10px] text-zinc-500">
          Escala H1/H2/H3 em conjunto. 100% = predefinição.
        </p>
      </div>


      <div className="pt-2 border-t border-zinc-200" />

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Margens da página
      </div>
      <p className="text-[11px] text-zinc-500">
        Controla o espaço entre o cabeçalho/rodapé e o corpo de texto.
      </p>

      <div className="space-y-1">
        <Label className="text-xs">Margem superior ({marginTop} mm)</Label>
        <Slider
          min={15}
          max={60}
          step={1}
          value={[marginTop]}
          onValueChange={([v]) => patch({ marginTop: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Margem inferior ({marginBottom} mm)</Label>
        <Slider
          min={15}
          max={60}
          step={1}
          value={[marginBottom]}
          onValueChange={([v]) => patch({ marginBottom: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Margem esquerda ({marginLeft} mm)</Label>
        <Slider
          min={5}
          max={60}
          step={1}
          value={[marginLeft]}
          onValueChange={([v]) => patch({ marginLeft: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Margem direita ({marginRight} mm)</Label>
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
        Cabeçalho
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Mostrar cabeçalho</Label>
        <Switch
          checked={s.showHeader !== false}
          onCheckedChange={(v) => patch({ showHeader: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Marca (linha 1)</Label>
        <Input
          value={s.headerBrand ?? "PEDRA SILVA"}
          onChange={(e) => patch({ headerBrand: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Marca (linha 2)</Label>
        <Input
          value={s.headerBrandSub ?? "ARCHITECTS"}
          onChange={(e) => patch({ headerBrandSub: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Email de contacto</Label>
        <Input
          value={s.headerContactEmail ?? "info@pedrasilva.com"}
          onChange={(e) => patch({ headerContactEmail: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Website</Label>
        <Input
          value={s.headerContactWebsite ?? "www.pedrasilva.com"}
          onChange={(e) => patch({ headerContactWebsite: e.target.value })}
        />
      </div>

      <div className="pt-2 border-t border-zinc-200" />

      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Rodapé
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Mostrar rodapé</Label>
        <Switch
          checked={s.showFooter !== false}
          onCheckedChange={(v) => patch({ showFooter: v })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Morada (uma linha por linha)</Label>
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
          Repor predefinições
        </Button>
      </div>
    </div>
  );
}
