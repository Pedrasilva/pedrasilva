import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { useDateLocale } from "@/i18n/use-date-locale";
import {
  computeSnapshot,
  fmtEUR,
  mesesFromSubsidios,
  type Collaborator,
  type Snapshot,
} from "@/lib/salary";

type Row = { label: string; value: number; hint?: string };

/**
 * Candidate-facing compensation summary.
 *
 * Deliberately narrow: it shows only what a future team member needs to know
 * (what they receive, monthly and yearly). Internal management data — FTE,
 * back-office split, employer cost, chargeability, value chain — is excluded,
 * and any line with a zero/blank value is omitted entirely.
 *
 * Rendered hidden on screen; only printed when <body> carries `printing-offer`.
 */
export function OfferSummarySheet({
  collaborator,
  snapshot,
}: {
  collaborator: Collaborator;
  snapshot: Snapshot;
}) {
  const { t } = useTranslation(["hr"]);
  const dateLocale = useDateLocale();
  const c = computeSnapshot(snapshot);
  const meses = snapshot.subsidios_modo
    ? mesesFromSubsidios(snapshot.subsidios_modo)
    : c.meses;

  const positive = (rows: Row[]) => rows.filter((r) => Math.round(r.value * 100) > 0);

  const salaryRows = positive([
    { label: t("hr:offerSheet.rows.baseMonthly"), value: c.base },
    { label: t("hr:offerSheet.rows.netMonthly"), value: c.liquido12m },
  ]);

  const allowanceRows = positive([
    {
      label: t("hr:offerSheet.rows.mealAllowance"),
      value: c.alimentacaoMensal,
      hint: snapshot.subsidio_alimentacao_diario
        ? t("hr:offerSheet.rows.mealAllowanceHint", {
            daily: fmtEUR(snapshot.subsidio_alimentacao_diario),
          })
        : undefined,
    },
    { label: t("hr:offerSheet.rows.transitPass"), value: c.passeMensal },
    { label: t("hr:offerSheet.rows.perDiem"), value: c.ajudasMensal },
  ]);

  const benefitRows = positive([
    { label: t("hr:offerSheet.rows.car"), value: snapshot.beneficio_carro / 12 },
    { label: t("hr:offerSheet.rows.voucher"), value: snapshot.beneficio_ticket / 12 },
    { label: t("hr:offerSheet.rows.associateBonus"), value: snapshot.premio_associado / 12 },
    { label: t("hr:offerSheet.rows.retirementPlan"), value: (snapshot.plano_reforma ?? 0) / 12 },
    { label: t("hr:offerSheet.rows.otherBenefits"), value: snapshot.outros_beneficios / 12 },
  ]);

  const annualRows = positive([
    { label: t("hr:offerSheet.rows.annualNet"), value: c.liquidoAnual },
    { label: t("hr:offerSheet.rows.annualAllowances"), value: c.alimentacaoAnual + c.passeAnual + snapshot.ajudas_custo_anual },
    { label: t("hr:offerSheet.rows.annualBenefits"), value: c.beneficiosAnualGarantido },
  ]);

  const variableAnnual = c.bonusVariavelAnual;
  const subtitleParts = [
    collaborator.proposal_role || collaborator.billing_role || null,
    t(`hr:enums.department.${collaborator.departamento}`, {
      defaultValue: collaborator.departamento,
    }),
    collaborator.situacao_contractual || null,
  ].filter(Boolean);

  return (
    <div className="offer-sheet" aria-hidden="true">
      <header className="offer-sheet__header">
        <div>
          <p className="offer-sheet__eyebrow">{t("hr:offerSheet.documentTitle")}</p>
          <h1 className="offer-sheet__name">{collaborator.nome}</h1>
          <p className="offer-sheet__meta">{subtitleParts.join(" · ")}</p>
        </div>
        <p className="offer-sheet__date">
          {t("hr:offerSheet.referenceDate", {
            date: format(
              parseISO(snapshot.effective_from || snapshot.reference_date),
              "dd MMMM yyyy",
              { locale: dateLocale },
            ),
          })}
        </p>
      </header>

      <section className="offer-sheet__highlight">
        <div>
          <span className="offer-sheet__highlight-label">
            {t("hr:offerSheet.highlight.monthly")}
          </span>
          <strong className="offer-sheet__highlight-value">
            {fmtEUR(c.liquidoTotalMensal)}
          </strong>
        </div>
        <div>
          <span className="offer-sheet__highlight-label">
            {t("hr:offerSheet.highlight.annual")}
          </span>
          <strong className="offer-sheet__highlight-value">
            {fmtEUR(c.liquidoTotalMensal * 12)}
          </strong>
        </div>
        <div>
          <span className="offer-sheet__highlight-label">
            {t("hr:offerSheet.highlight.months")}
          </span>
          <strong className="offer-sheet__highlight-value">{meses}</strong>
        </div>
      </section>

      <Block title={t("hr:offerSheet.sections.salary")} rows={salaryRows} />
      {allowanceRows.length > 0 && (
        <Block title={t("hr:offerSheet.sections.allowances")} rows={allowanceRows} />
      )}
      {benefitRows.length > 0 && (
        <Block title={t("hr:offerSheet.sections.benefits")} rows={benefitRows} />
      )}

      <section className="offer-sheet__total">
        <span>{t("hr:offerSheet.rows.totalMonthly")}</span>
        <strong>{fmtEUR(c.liquidoTotalMensal)}</strong>
      </section>

      {annualRows.length > 0 && (
        <Block title={t("hr:offerSheet.sections.annual")} rows={annualRows} />
      )}

      {variableAnnual > 0 && (
        <p className="offer-sheet__note">
          {t("hr:offerSheet.variableNote", { value: fmtEUR(variableAnnual) })}
        </p>
      )}

      {snapshot.notas && <p className="offer-sheet__note">{snapshot.notas}</p>}

      <footer className="offer-sheet__footer">
        <p>{t("hr:offerSheet.disclaimer")}</p>
      </footer>
    </div>
  );
}

function Block({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="offer-sheet__block">
      <h2>{title}</h2>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">
                {r.label}
                {r.hint && <span className="offer-sheet__hint">{r.hint}</span>}
              </th>
              <td>{fmtEUR(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
