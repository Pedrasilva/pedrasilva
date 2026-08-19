import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeSnapshot, type Snapshot } from "@/lib/salary";
import { CompositionDonut } from "./SalaryDonut";

const eur2 = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

/**
 * "Doutor Finanças"-style headline + donut breakdowns.
 *
 * Top banner: what the collaborator receives each month.
 * Three KPIs: annual gross, IRS withholding rate, annual employer cost.
 * Tabs: salary simulation / net salary / gross salary donuts.
 *
 * Purely presentational — every figure comes from `computeSnapshot`.
 */
export function SalarySimulatorHero({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);

  const isencoesMensal = c.alimentacaoMensal + c.ajudasMensal + c.passeMensal;
  const recebeMensal = c.liquido14m + isencoesMensal + c.beneficiosMensalGarantido;

  const brutoAnualColaborador =
    c.baseAnual + c.alimentacaoAnual + c.ajudasMensal * 12 + c.passeAnual;
  const brutoMensalColaborador = brutoAnualColaborador / 12;

  const custoAnual = c.custoVBG;
  const custoMensal = custoAnual / 12;

  return (
    <Card className="overflow-hidden lg:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 bg-[var(--clay)] px-5 py-4 text-primary-foreground">
        <span className="text-base font-semibold">O que irá receber mensalmente:</span>
        <span className="text-xl font-semibold tabular-nums">{eur2(recebeMensal)}</span>
      </div>

      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Kpi
          label="O salário bruto anual terá um valor de:"
          value={eur2(brutoAnualColaborador)}
          hint={`${eur2(brutoMensalColaborador)} por mês`}
        />
        <Kpi
          label="A retenção na fonte do salário será de:"
          value={`${(draft.irs_pct * 100).toFixed(2)}%`}
          hint={`${eur2(c.irsMensal)} por mês`}
        />
        <Kpi
          label="O custo anual para o atelier será de:"
          value={eur2(custoAnual)}
          hint={`${eur2(custoMensal)} por mês`}
        />
      </div>

      <CardContent className="pt-5">
        <Tabs defaultValue="sim">
          <TabsList>
            <TabsTrigger value="sim">Simulação do salário</TabsTrigger>
            <TabsTrigger value="liquido">Salário líquido</TabsTrigger>
            <TabsTrigger value="bruto">Salário bruto</TabsTrigger>
          </TabsList>

          <TabsContent value="sim" className="pt-4">
            <CompositionDonut
              centerLabel="Salário líquido"
              centerValue={c.liquido14m}
              slices={[
                { name: "Salário líquido", value: c.liquido14m, color: "var(--sage)" },
                { name: "Retenção IRS", value: c.irsMensal, color: "oklch(0.65 0.13 50)" },
                {
                  name: "Contribuição Segurança Social",
                  value: c.ssColaboradorMensal,
                  color: "var(--clay)",
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="liquido" className="pt-4">
            <CompositionDonut
              centerLabel="Recebido por mês"
              centerValue={recebeMensal}
              slices={[
                { name: "Rendimento líquido", value: c.liquido14m, color: "var(--sage)" },
                {
                  name: "Subsídio de alimentação",
                  value: c.alimentacaoMensal,
                  color: "oklch(0.75 0.09 160)",
                },
                {
                  name: "Ajudas de custo + passe",
                  value: c.ajudasMensal + c.passeMensal,
                  color: "oklch(0.68 0.10 220)",
                },
                {
                  name: "Benefícios garantidos",
                  value: c.beneficiosMensalGarantido,
                  color: "var(--clay)",
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="bruto" className="pt-4">
            <CompositionDonut
              centerLabel="Custo mensal atelier"
              centerValue={custoMensal}
              slices={[
                {
                  name: "Rendimento tributável",
                  value: c.baseMensal12,
                  color: "oklch(0.72 0.06 250)",
                },
                {
                  name: "Segurança Social patronal",
                  value: c.ssAtelier12,
                  color: "oklch(0.55 0.13 30)",
                },
                {
                  name: "Subsídio de alimentação",
                  value: c.alimentacaoMensal,
                  color: "oklch(0.75 0.09 160)",
                },
                {
                  name: "Ajudas de custo + passe",
                  value: c.ajudasMensal + c.passeMensal,
                  color: "oklch(0.68 0.10 220)",
                },
                { name: "Benefícios", value: c.beneficiosAnual / 12, color: "var(--clay)" },
              ]}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-sm font-medium leading-snug">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--clay)]">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{hint}</div>
    </div>
  );
}
