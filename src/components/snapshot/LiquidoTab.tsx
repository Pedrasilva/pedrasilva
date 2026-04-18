import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";
import { SalaryDonut } from "./SalaryDonut";

export function LiquidoTab({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);
  const rows = [
    { label: "Valor base mensal", value: c.base },
    { label: "− SS Colaborador (mensal)", value: -c.ssColaboradorMensal },
    { label: "− IRS (mensal)", value: -c.irsMensal },
    { label: "= Líquido (por mês de pagamento)", value: c.liquido14m, strong: true },
    { label: "× Meses pagos", value: c.meses, raw: `${c.meses}` },
    { label: "= Líquido anual", value: c.liquidoAnual, strong: true },
    { label: "÷ 12 (Líquido mensal médio)", value: c.liquido12m },
    { label: "+ Subsídio alimentação mensal", value: c.alimentacaoMensal },
    { label: "+ Ajudas de custo mensais", value: c.ajudasMensal },
    { label: "= Líquido total mensal", value: c.liquidoTotalMensal, strong: true, accent: true },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visão Líquido</CardTitle>
          <CardDescription>O que entra na conta do colaborador.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {rows.map((r) => (
              <div
                key={r.label}
                className={`flex items-baseline justify-between py-2 ${r.strong ? "font-semibold" : ""} ${r.accent ? "text-[var(--sage)]" : ""}`}
              >
                <span className="text-sm">{r.label}</span>
                <span className="font-mono tabular-nums">
                  {r.raw ?? fmtEUR(r.value)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composição mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <SalaryDonut
            liquido={c.liquido14m}
            ssColaborador={c.ssColaboradorMensal}
            irs={c.irsMensal}
          />
        </CardContent>
      </Card>
    </div>
  );
}
