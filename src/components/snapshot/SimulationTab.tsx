import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  computeSnapshot,
  fmtEUR,
  mesesFromSubsidios,
  SUBSIDIOS_MODO_OPTIONS,
  type Snapshot,
  type SubsidiosModo,
} from "@/lib/salary";
import { CalcRow, FieldRow, NumIn } from "./inputs";
import { PayrollSimulationCard } from "./PayrollSimulationCard";
import { SalarySimulatorHero } from "./SalarySimulatorHero";

type Setter = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) => void;

export function SimulationTab({ draft, set }: { draft: Snapshot; set: Setter }) {
  useTranslation();
  const c = computeSnapshot(draft);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SalarySimulatorHero draft={draft} />
      <PayrollSimulationCard draft={draft} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base"> {uiI18n.t("hr:resumo.rhTable.headers.contractualBase")} </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label={uiI18n.t("hr:myProfile.details.fields.valor_base")}>
            <NumIn value={draft.valor_base} onChange={(n) => set("valor_base", n)} />
          </FieldRow>
          <FieldRow label={uiI18n.t("hr:snapshot.labels.holidayAndChristmasAllowances")}>
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
                <SelectValue placeholder={uiI18n.t("hr:snapshot.labels.selectAllowancePaymentMethod")} />
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
          <FieldRow label={uiI18n.t("hr:snapshot.labels.studioSocialSecurity")}>
            <NumIn value={draft.ss_atelier_pct * 100} step={0.01} suffix="%"
              onChange={(n) => set("ss_atelier_pct", n / 100)} />
          </FieldRow>
          <FieldRow label={uiI18n.t("hr:snapshot.labels.collaboratorSocialSecurity")}>
            <NumIn value={draft.ss_colaborador_pct * 100} step={0.01} suffix="%"
              onChange={(n) => set("ss_colaborador_pct", n / 100)} />
          </FieldRow>
          {draft.irs_calculado_auto ? (
            <FieldRow label={uiI18n.t("hr:snapshot.labels.automaticIrs")}>
              <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
                {(draft.irs_pct * 100).toFixed(2)}%
              </div>
            </FieldRow>
          ) : (
            <FieldRow label={uiI18n.t("hr:snapshot.labels.manualIrs")}>
              <NumIn value={draft.irs_pct * 100} step={0.1} suffix="%"
                onChange={(n) => set("irs_pct", n / 100)} />
            </FieldRow>
          )}
          <CalcRow label={uiI18n.t("hr:snapshot.labels.annualBaseGrossSalary")} value={fmtEUR(c.baseAnual)} />
          <CalcRow label={uiI18n.t("hr:snapshot.labels.annualStudioSocialSecurity")} value={fmtEUR(c.ssAtelierAnual)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base"> {uiI18n.t("hr:compensationLiquidity.breakdown.mealAllowance")} </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label={uiI18n.t("hr:snapshot.labels.setManually")}>
            <div className="flex h-9 items-center justify-end gap-2">
              <Switch
                checked={draft.subsidio_alimentacao_manual}
                onCheckedChange={(v) => {
                  set("subsidio_alimentacao_manual", v);
                  // Quando activa o modo manual pela primeira vez, semeia com o valor
                  // actual da tabela para evitar saltar para 0€.
                  if (v && (!draft.subsidio_alimentacao_diario_manual || draft.subsidio_alimentacao_diario_manual === 0)) {
                    set("subsidio_alimentacao_diario_manual", draft.subsidio_alimentacao_diario);
                  }
                }}
              />
              <span className="text-[11px] text-muted-foreground">
                {draft.subsidio_alimentacao_manual ? uiI18n.t("hr:snapshot.labels.manualAmount") : uiI18n.t("hr:snapshot.labels.annualTable")}
              </span>
            </div>
          </FieldRow>
          {draft.subsidio_alimentacao_manual ? (
            <FieldRow label={uiI18n.t("hr:snapshot.labels.dailyAmountManual")}>
              <NumIn
                value={draft.subsidio_alimentacao_diario_manual}
                step={0.01}
                onChange={(n) => set("subsidio_alimentacao_diario_manual", n)}
              />
            </FieldRow>
          ) : (
            <FieldRow label={uiI18n.t("hr:snapshot.labels.dailyAmountTable")}>
              <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
                {fmtEUR(draft.subsidio_alimentacao_diario)}
              </div>
            </FieldRow>
          )}
          <FieldRow label={uiI18n.t("hr:snapshot.labels.workingDaysAnnual")}>
            <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-right text-sm tabular-nums text-muted-foreground">
              {draft.dias_uteis}
            </div>
          </FieldRow>
          <CalcRow label={uiI18n.t("hr:snapshot.labels.annualTotal")} value={fmtEUR(c.alimentacaoAnual)} />
          <CalcRow label={uiI18n.t("hr:snapshot.labels.monthlyAverage")} value={fmtEUR(c.alimentacaoMensal)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base"> {uiI18n.t("hr:compensationLiquidity.breakdown.perDiem")} </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label={uiI18n.t("hr:snapshot.labels.monthlyAmount")}>
            <NumIn value={Math.round(((draft.ajudas_custo_anual ?? 0) / 12) * 100) / 100}
              onChange={(n) => set("ajudas_custo_anual", Math.round((n || 0) * 12 * 100) / 100)} />
          </FieldRow>
          <CalcRow label={uiI18n.t("hr:snapshot.labels.annualTotal")} value={fmtEUR(draft.ajudas_custo_anual ?? 0)} />
          <div className="border-t pt-3" />
          <FieldRow label={uiI18n.t("hr:snapshot.labels.transitPassPublicTransportMonthly")}>
            <NumIn value={Math.round(((draft.passe_anual ?? 0) / 12) * 100) / 100}
              onChange={(n) => set("passe_anual", Math.round((n || 0) * 12 * 100) / 100)} />
          </FieldRow>
          <CalcRow label={uiI18n.t("hr:snapshot.labels.transitPassAnnualTotal")} value={fmtEUR(draft.passe_anual ?? 0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base"> {uiI18n.t("glossary:hr.benefits")} </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label={uiI18n.t("hr:snapshot.labels.carBenefit")}>
            <NumIn value={draft.beneficio_carro} onChange={(n) => set("beneficio_carro", n)} />
          </FieldRow>
          <FieldRow label={uiI18n.t("hr:snapshot.labels.voucherBenefit")}>
            <NumIn value={draft.beneficio_ticket} onChange={(n) => set("beneficio_ticket", n)} />
          </FieldRow>
          <FieldRow label={uiI18n.t("hr:snapshot.labels.associateBonus")}>
            <NumIn value={draft.premio_associado} onChange={(n) => set("premio_associado", n)} />
          </FieldRow>
          <FieldRow label={uiI18n.t("common:other")}>
            <NumIn value={draft.outros_beneficios} onChange={(n) => set("outros_beneficios", n)} />
          </FieldRow>
          <FieldRow label={uiI18n.t("hr:snapshot.labels.retirementPlanAnnualSubjectToIrs")}>
            <NumIn value={draft.plano_reforma ?? 0} onChange={(n) => set("plano_reforma", n)} />
          </FieldRow>
          <CalcRow label={uiI18n.t("hr:snapshot.labels.guaranteedTotalAnnual")} value={fmtEUR(c.beneficiosAnualGarantido)} />

          <div className="mt-2 rounded-md border border-dashed border-[var(--clay)]/40 bg-[color-mix(in_oklab,var(--cream)_50%,transparent)] p-3 space-y-3">
            <div className="space-y-0.5">
              <div className="text-sm font-medium"> {uiI18n.t("hr:snapshot.labels.annualBonusPotential")} </div>
              <div className="text-[11px] text-muted-foreground">
                 {uiI18n.t("hr:snapshot.labels.variableNonGuaranteedAmountPaidOnlyAccording")} </div>
            </div>
            <FieldRow label={uiI18n.t("hr:snapshot.labels.variableBonusAnnual")}>
              <NumIn value={draft.beneficio_variavel ?? 0} onChange={(n) => set("beneficio_variavel", n)} />
            </FieldRow>
            <CalcRow label={uiI18n.t("hr:snapshot.labels.totalWithBonusAnnual")} value={fmtEUR(c.beneficiosAnual)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
