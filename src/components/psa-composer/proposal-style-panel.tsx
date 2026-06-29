/**
 * Proposal-level style settings panel.
 *
 * Shown in the right sidebar when no block is selected. Lets the user pick
 * heading/body fonts, heading weight, body alignment and body font-size for
 * the whole proposal. Values are stored as JSON in psa_proposals.style_settings
 * and applied to .proposal-print-document via CSS variables on the canvas.
 */
import { Label } from "@/components/ui/label";
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
  { label: "Inter (sans, default)", value: '"Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "Manrope (sans)", value: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { label: "Fraunces (display serif)", value: '"Fraunces", Georgia, serif' },
  { label: "Source Serif (serif)", value: '"Source Serif 4", Georgia, serif' },
  { label: "EB Garamond (classic serif)", value: '"EB Garamond", Georgia, serif' },
];

const BODY_FONTS = [
  { label: "Source Serif (default)", value: '"Source Serif 4", "EB Garamond", Georgia, serif' },
  { label: "EB Garamond (classic serif)", value: '"EB Garamond", Georgia, serif' },
  { label: "Fraunces (display serif)", value: '"Fraunces", Georgia, serif' },
  { label: "Inter (sans)", value: '"Inter", "Helvetica Neue", Arial, sans-serif' },
  { label: "Manrope (sans)", value: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
];

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

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Tipografia da Proposta
      </div>
      <p className="text-[11px] text-zinc-500">
        Aplica-se a todos os blocos. Os títulos usam o tipo de letra de heading;
        os parágrafos usam o tipo de letra de body.
      </p>

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
