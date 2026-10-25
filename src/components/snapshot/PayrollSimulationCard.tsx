import { payrollTerm } from "@/lib/hr/ui-terms";
import { fmtNumber } from "@/lib/hr/ui-format";
import { fmtEUR } from "@/lib/hr/ui-format";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeSnapshot, type Snapshot } from "@/lib/salary";

/**
 * "Doutor Finanças"-style payroll simulation.
 *
 * Left column: what the collaborator sees each month (gross taxable pay,
 * IRS and Social Security withheld, net, plus untaxed allowances).
 * Right column: what the company pays on top (employer Social Security,
 * allowances, benefits) and the resulting total employer cost.
 *
 * Purely presentational — every figure comes from `computeSnapshot`.
 */
export function PayrollSimulationCard({ draft }: { draft: Snapshot }) {
  useTranslation();
  const c = computeSnapshot(draft);

  const brutoTributavelMensal = c.baseMensalTributavel;
  const descontosMensal = c.ssColaboradorMensal + c.irsMensal;
  const liquidoMensal = c.liquido14m;
  const isencoesMensal = c.alimentacaoMensal + c.ajudasMensal + c.passeMensal;
  const recebeMensal = liquidoMensal + isencoesMensal + c.beneficiosMensalGarantido;

  const custoMensal = c.custoVBG / 12;
  const encargoMensal = custoMensal - recebeMensal;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base"> {uiI18n.t("hr:snapshot.labels.payrollSimulation")} </CardTitle>
        <p className="text-[11px] text-muted-foreground">
           {uiI18n.t("hr:snapshot.labels.monthlyCollaboratorTakeHomePayAndStudio")} </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="space-y-1">
          <Heading> {uiI18n.t("hr:snapshot.labels.collaboratorMonthly")} </Heading>
          <Line label={payrollTerm("grossTaxableSalary", true)} value={brutoTributavelMensal} />
          <Line
            label={uiI18n.t("hr:snapshot.payroll.socialSecurityPct", { term: payrollTerm("socialSecurity", true), percent: fmtNumber(draft.ss_colaborador_pct * 100) })}
            value={-c.ssColaboradorMensal}
            muted
          />
          <Line
            label={uiI18n.t("hr:snapshot.payroll.socialSecurityPct", { term: payrollTerm("withholding", true), percent: fmtNumber(draft.irs_pct * 100) })}
            value={-c.irsMensal}
            muted
          />
          <Total label={payrollTerm("netSalary", true)} value={liquidoMensal} />
          <div className="pt-2" />
          <Line label={payrollTerm("mealAllowance", true)} value={c.alimentacaoMensal} muted />
          <Line label={payrollTerm("expenseAllowance", true)} value={c.ajudasMensal} muted />
          <Line label={uiI18n.t("hr:snapshot.bruto.composition.slices.transitPass")} value={c.passeMensal} muted />
          <Line label={uiI18n.t("hr:snapshot.labels.guaranteedBenefits")} value={c.beneficiosMensalGarantido} muted />
          <Total label={uiI18n.t("hr:snapshot.labels.totalReceivedPerMonth")} value={recebeMensal} tone="sage" />
          <p className="pt-1 text-[11px] text-muted-foreground">
             {uiI18n.t("hr:snapshot.payroll.exemptHint", { amount: fmtEUR(isencoesMensal) })} </p>
        </section>

        <section className="space-y-1">
          <Heading> {uiI18n.t("hr:snapshot.labels.studioCost")} </Heading>
          <Line label={uiI18n.t("hr:snapshot.labels.annualBasePayMonths")} value={c.baseAnual} />
          <Line
            label={uiI18n.t("hr:snapshot.payroll.socialSecurityPct", { term: payrollTerm("employerContribution", true), percent: fmtNumber(draft.ss_atelier_pct * 100) })}
            value={c.ssAtelierAnual}
          />
          <Line label={uiI18n.t("hr:snapshot.payroll.mealAnnual", { term: payrollTerm("mealAllowance") })} value={c.alimentacaoAnual} muted />
          <Line label={uiI18n.t("hr:snapshot.labels.expenseAllowancesAndTransitPassAnnual")} value={c.ajudasMensal * 12 + c.passeAnual} muted />
          <Line label={uiI18n.t("hr:snapshot.labels.benefitsAnnual")} value={c.beneficiosAnual} muted />
          <Total label={uiI18n.t("hr:snapshot.labels.totalAnnualCost")} value={c.custoVBG} tone="clay" />
          <Total label={uiI18n.t("hr:snapshot.labels.averageMonthlyCost")} value={custoMensal} tone="clay" />
          <p className="pt-1 text-[11px] text-muted-foreground">
             {uiI18n.t("hr:snapshot.payroll.extraHint", { monthly: fmtEUR(encargoMensal), annual: fmtEUR(encargoMensal * 12), socialSecurity: fmtEUR(c.ssAtelierAnual / 12) })} </p>
        </section>
      </CardContent>
    </Card>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  useTranslation();
  return (
    <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function Line({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  useTranslation();
  if (Math.round(value * 100) === 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className="tabular-nums">{fmtEUR(value)}</span>
    </div>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "sage" | "clay";
}) {
  useTranslation();
  const toneCls =
    tone === "sage"
      ? "border-[var(--sage)]/40 bg-[color-mix(in_oklab,var(--sage)_10%,transparent)]"
      : tone === "clay"
        ? "border-[var(--clay)]/40 bg-[color-mix(in_oklab,var(--clay)_10%,transparent)]"
        : "border-border bg-muted/40";
  return (
    <div
      className={`mt-2 flex items-baseline justify-between gap-4 rounded-md border px-3 py-2 text-sm font-medium ${toneCls}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{fmtEUR(value)}</span>
    </div>
  );
}
