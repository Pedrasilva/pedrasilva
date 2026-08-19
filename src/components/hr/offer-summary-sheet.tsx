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
type Slice = { name: string; value: number; color: string };

/** Print-safe palette (no oklch / CSS vars — printers flatten those). */
const COLORS = {
  net: "#6f8f6a",
  meal: "#7fb8a0",
  travel: "#6ea3c8",
  benefits: "#b4795d",
};

/**
 * Candidate-facing compensation summary.
 *
 * Mirrors the on-screen "Doutor Finanças"-style simulator: a headline banner
 * with the monthly take-home, three KPIs, and a donut composition of what the
 * candidate receives — followed by the detailed line items.
 *
 * Deliberately narrow: internal management data (FTE, back-office split,
 * employer cost, chargeability, value chain) is excluded, and any line with a
 * zero/blank value is omitted entirely.
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

  // Headline figures — same maths as the on-screen simulator hero.
  const recebeMensal = c.liquidoTotalMensal;
  // Gross annual cost to the atelier (base ×14 + employer SS + allowances).
  const brutoAnualColaborador = c.custoVBG;

  const slices: Slice[] = [
    { name: t("hr:offerSheet.rows.netMonthly"), value: c.liquido12m, color: COLORS.net },
    { name: t("hr:offerSheet.rows.mealAllowance"), value: c.alimentacaoMensal, color: COLORS.meal },
    {
      name: t("hr:offerSheet.donut.travel"),
      value: c.ajudasMensal + c.passeMensal,
      color: COLORS.travel,
    },
    {
      name: t("hr:offerSheet.sections.benefits"),
      value: c.beneficiosMensalGarantido,
      color: COLORS.benefits,
    },
  ].filter((s) => Math.round(s.value * 100) > 0);

  const humanizeRole = (v?: string | null) =>
    v
      ? v
          .replace(/[_-]+/g, " ")
          .replace(/\b\w/g, (m) => m.toUpperCase())
      : null;
  const subtitleParts = [
    humanizeRole(collaborator.proposal_role || collaborator.billing_role),
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

      <section className="offer-sheet__banner">
        <span>{t("hr:offerSheet.banner.label")}</span>
        <strong>{fmtEUR(recebeMensal)}</strong>
      </section>

      <section className="offer-sheet__kpis">
        <Kpi
          label={t("hr:offerSheet.kpis.grossAnnual")}
          value={fmtEUR(brutoAnualColaborador)}
          hint={t("hr:offerSheet.kpis.perMonth", { value: fmtEUR(brutoAnualColaborador / 12) })}
        />
        <Kpi
          label={t("hr:offerSheet.kpis.irsRate")}
          value={`${(snapshot.irs_pct * 100).toFixed(2)}%`}
          hint={t("hr:offerSheet.kpis.perMonth", { value: fmtEUR(c.irsMensal) })}
        />
        <Kpi
          label={t("hr:offerSheet.kpis.annualTakeHome")}
          value={fmtEUR(recebeMensal * 12)}
          hint={t("hr:offerSheet.kpis.months", { count: meses })}
        />
      </section>

      <section className="offer-sheet__composition">
        <Donut slices={slices} centerLabel={t("hr:offerSheet.donut.center")} centerValue={recebeMensal} />
        <ul className="offer-sheet__legend">
          {slices.map((s) => {
            const total = slices.reduce((a, b) => a + b.value, 0);
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <li key={s.name}>
                <span className="offer-sheet__swatch" style={{ background: s.color }} />
                <span className="offer-sheet__legend-label">{s.name}</span>
                <span className="offer-sheet__legend-value">{fmtEUR(s.value)}</span>
                <span className="offer-sheet__legend-pct">{pct.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
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
        <strong>{fmtEUR(recebeMensal)}</strong>
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

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="offer-sheet__kpi">
      <span className="offer-sheet__kpi-label">{label}</span>
      <strong className="offer-sheet__kpi-value">{value}</strong>
      <span className="offer-sheet__kpi-hint">{hint}</span>
    </div>
  );
}

/**
 * Static SVG donut. Recharts renders through a responsive container that has no
 * measurable size in a print-only subtree, so the chart is drawn by hand with
 * stroke-dasharray arcs instead.
 */
function Donut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  centerLabel: string;
  centerValue: number;
}) {
  const size = 150;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = slices.reduce((a, b) => a + b.value, 0) || 1;
  let offset = 0;

  return (
    <div className="offer-sheet__donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="presentation">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s) => {
            const len = (s.value / total) * circ;
            const dash = `${Math.max(len - 2, 0)} ${circ - Math.max(len - 2, 0)}`;
            const el = (
              <circle
                key={s.name}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      <div className="offer-sheet__donut-center">
        <span>{centerLabel}</span>
        <strong>{fmtEUR(centerValue)}</strong>
      </div>
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
