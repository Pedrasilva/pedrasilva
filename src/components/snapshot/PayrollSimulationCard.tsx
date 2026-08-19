import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";

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
        <CardTitle className="text-base">Simulação salarial</CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Vista comparável a um simulador público: o que o colaborador recebe
          por mês e quanto custa ao atelier, incluindo contribuições patronais.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="space-y-1">
          <Heading>Colaborador (mensal)</Heading>
          <Line label="Vencimento bruto tributável" value={brutoTributavelMensal} />
          <Line
            label={`Segurança Social (${(draft.ss_colaborador_pct * 100).toFixed(2)}%)`}
            value={-c.ssColaboradorMensal}
            muted
          />
          <Line
            label={`Retenção IRS (${(draft.irs_pct * 100).toFixed(2)}%)`}
            value={-c.irsMensal}
            muted
          />
          <Total label="Vencimento líquido" value={liquidoMensal} />
          <div className="pt-2" />
          <Line label="Subsídio de alimentação" value={c.alimentacaoMensal} muted />
          <Line label="Ajudas de custo" value={c.ajudasMensal} muted />
          <Line label="Passe / transporte" value={c.passeMensal} muted />
          <Line label="Benefícios garantidos" value={c.beneficiosMensalGarantido} muted />
          <Total label="Total recebido por mês" value={recebeMensal} tone="sage" />
          <p className="pt-1 text-[11px] text-muted-foreground">
            Isenções e benefícios pagos além do salário: {fmtEUR(isencoesMensal)}/mês.
          </p>
        </section>

        <section className="space-y-1">
          <Heading>Atelier (custo)</Heading>
          <Line label="Remuneração base anual (14 meses)" value={c.baseAnual} />
          <Line
            label={`Contribuição patronal TSU (${(draft.ss_atelier_pct * 100).toFixed(2)}%)`}
            value={c.ssAtelierAnual}
          />
          <Line label="Subsídio de alimentação (ano)" value={c.alimentacaoAnual} muted />
          <Line label="Ajudas de custo + passe (ano)" value={c.ajudasMensal * 12 + c.passeAnual} muted />
          <Line label="Benefícios (ano)" value={c.beneficiosAnual} muted />
          <Total label="Custo total anual" value={c.custoVBG} tone="clay" />
          <Total label="Custo médio mensal" value={custoMensal} tone="clay" />
          <p className="pt-1 text-[11px] text-muted-foreground">
            Encargo adicional sobre o que o colaborador recebe:{" "}
            {fmtEUR(encargoMensal)}/mês ({fmtEUR(encargoMensal * 12)}/ano), dos
            quais {fmtEUR(c.ssAtelierAnual / 12)}/mês de Segurança Social patronal.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
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
