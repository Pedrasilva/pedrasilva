import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ESTADOS_CIVIS, LOCALIZACOES, pickTabela, type IrsResultado } from "@/lib/irs";
import type { Snapshot } from "@/lib/salary";
import { fmtEUR } from "@/lib/salary";
import { Sparkles } from "lucide-react";

type Setter = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) => void;

const TABELA_LABEL: Record<string, string> = {
  nao_casado: "Não casado",
  casado_unico_titular: "Casado · único titular",
  casado_dois_titulares: "Casado · dois titulares",
};

export function FamilySection({
  draft,
  set,
  irsAuto,
}: {
  draft: Snapshot;
  set: Setter;
  irsAuto: IrsResultado;
}) {
  const tabela = pickTabela(draft.estado_civil, draft.numero_titulares);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FieldS label="Localização">
          <Select value={draft.localizacao} onValueChange={(v) => set("localizacao", v)}>
            <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOCALIZACOES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldS>
        <FieldS label="Estado civil">
          <Select value={draft.estado_civil} onValueChange={(v) => set("estado_civil", v)}>
            <SelectTrigger className="input-yellow"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTADOS_CIVIS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldS>
        <FieldS label="Nº titulares">
          <Input type="number" min={1} max={2} className="input-yellow tabular-nums"
            value={draft.numero_titulares}
            onChange={(e) => set("numero_titulares", Number(e.target.value) || 1)} />
        </FieldS>
        <FieldS label="Nº dependentes">
          <Input type="number" min={0} className="input-yellow tabular-nums"
            value={draft.numero_dependentes}
            onChange={(e) => set("numero_dependentes", Number(e.target.value) || 0)} />
        </FieldS>
        <FieldS label="Dep. com deficiência">
          <Input type="number" min={0} className="input-yellow tabular-nums"
            value={draft.dependentes_com_deficiencia}
            onChange={(e) => set("dependentes_com_deficiencia", Number(e.target.value) || 0)} />
        </FieldS>
        <FieldS label="Ano fiscal">
          <Input type="number" min={2020} className="input-yellow tabular-nums"
            value={draft.ano_fiscal}
            onChange={(e) => set("ano_fiscal", Number(e.target.value) || 2026)} />
        </FieldS>
      </div>

      <div className="rounded-lg border border-[var(--sage)]/30 bg-[color-mix(in_oklab,var(--sage)_6%,transparent)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--sage)]" />
            <div>
              <div className="text-sm font-medium">Cálculo automático de IRS</div>
              <div className="text-[11px] text-muted-foreground">
                Tabela: {TABELA_LABEL[tabela]} · {draft.localizacao} · {draft.ano_fiscal}
              </div>
            </div>
          </div>
          <Switch checked={draft.irs_calculado_auto}
            onCheckedChange={(v) => set("irs_calculado_auto", v)} />
        </div>
        {draft.irs_calculado_auto && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <Mini label="Taxa marginal" value={`${(irsAuto.taxa_marginal * 100).toFixed(1)}%`} />
            <Mini label="Parcela a abater" value={fmtEUR(irsAuto.parcela_abater)} />
            <Mini label="IRS mensal" value={fmtEUR(irsAuto.irs_mensal)} />
          </div>
        )}
      </div>
    </div>
  );
}

function FieldS({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}
