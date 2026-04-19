import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeSnapshot,
  fmtEUR,
  mesesFromSubsidios,
  SUBSIDIOS_MODO_OPTIONS,
  type Snapshot,
  type SubsidiosModo,
} from "@/lib/salary";
import { CalcRow, FieldRow, NumIn } from "./inputs";

type Setter = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) => void;

export function SimulationTab({ draft, set }: { draft: Snapshot; set: Setter }) {
  const c = computeSnapshot(draft);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Base contractual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Valor base mensal">
            <NumIn value={draft.valor_base} onChange={(n) => set("valor_base", n)} />
          </FieldRow>
          <FieldRow label="Subsídios férias e Natal">
            <Select
              value={draft.subsidios_modo ?? "tradicional"}
              onValueChange={(v) => {
                const modo = v as SubsidiosModo;
                set("subsidios_modo", modo);
                // Mantém meses_pagos sincronizado para compatibilidade
                set("meses_pagos", mesesFromSubsidios(modo));
              }}
            >
              <SelectTrigger className="input-yellow h-9 text-left">
                <SelectValue placeholder="Selecionar regime" />
              </SelectTrigger>
              <SelectContent>
                {SUBSIDIOS_MODO_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span className="text-sm">{opt.label}</span>
                      <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="SS atelier (%)">
            <NumIn value={draft.ss_atelier_pct * 100} step={0.01} suffix="%"
              onChange={(n) => set("ss_atelier_pct", n / 100)} />
          </FieldRow>
          <FieldRow label="SS colaborador (%)">
            <NumIn value={draft.ss_colaborador_pct * 100} step={0.01} suffix="%"
              onChange={(n) => set("ss_colaborador_pct", n / 100)} />
          </FieldRow>
          {draft.irs_calculado_auto ? (
            <FieldRow label="IRS automático (%)">
              <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
                {(draft.irs_pct * 100).toFixed(2)}%
              </div>
            </FieldRow>
          ) : (
            <FieldRow label="IRS manual (%)">
              <NumIn value={draft.irs_pct * 100} step={0.1} suffix="%"
                onChange={(n) => set("irs_pct", n / 100)} />
            </FieldRow>
          )}
          <CalcRow label="Bruto anual base" value={fmtEUR(c.baseAnual)} />
          <CalcRow label="SS atelier anual" value={fmtEUR(c.ssAtelierAnual)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subsídio alimentação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Valor diário">
            <NumIn value={draft.subsidio_alimentacao_diario}
              onChange={(n) => set("subsidio_alimentacao_diario", n)} />
          </FieldRow>
          <FieldRow label="Dias úteis (ano)">
            <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
              {draft.dias_uteis}
            </div>
          </FieldRow>
          <CalcRow label="Total anual" value={fmtEUR(c.alimentacaoAnual)} />
          <CalcRow label="Média mensal" value={fmtEUR(c.alimentacaoMensal)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajudas de custo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Valor anual">
            <NumIn value={draft.ajudas_custo_anual}
              onChange={(n) => set("ajudas_custo_anual", n)} />
          </FieldRow>
          <CalcRow label="Média mensal" value={fmtEUR(c.ajudasMensal)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Benefícios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Apoio carro">
            <NumIn value={draft.beneficio_carro} onChange={(n) => set("beneficio_carro", n)} />
          </FieldRow>
          <FieldRow label="Ticket">
            <NumIn value={draft.beneficio_ticket} onChange={(n) => set("beneficio_ticket", n)} />
          </FieldRow>
          <FieldRow label="Prémio de associado">
            <NumIn value={draft.premio_associado} onChange={(n) => set("premio_associado", n)} />
          </FieldRow>
          <FieldRow label="Outros">
            <NumIn value={draft.outros_beneficios} onChange={(n) => set("outros_beneficios", n)} />
          </FieldRow>
          <CalcRow label="Total anual" value={fmtEUR(c.beneficiosAnual)} />
        </CardContent>
      </Card>
    </div>
  );
}
