import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeSnapshot, fmtEUR, type Snapshot } from "@/lib/salary";

export function BrutoTab({ draft }: { draft: Snapshot }) {
  const c = computeSnapshot(draft);
  const rows = [
    { label: "Base mensal (anualizada/12)", value: c.baseMensal12 },
    { label: "+ SS Atelier mensal (anualizada/12)", value: c.ssAtelier12 },
    { label: "+ Subsídio alimentação mensal", value: c.alimentacaoMensal },
    { label: "+ Ajudas de custo mensais", value: c.ajudasMensal },
    { label: "= Bruto mensal (custo equivalente)", value: c.brutoMensal, strong: true },
    { label: "× 12", value: c.brutoMensal * 12 },
    { label: "+ Benefícios anuais", value: c.beneficiosAnual },
    { label: "= Bruto anual", value: c.brutoAnual, strong: true },
    { label: "+ Ajudas de custo anuais", value: draft.ajudas_custo_anual },
    { label: "= Custo total RH (VBG)", value: c.custoVBG, strong: true, accent: true },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Visão Bruto</CardTitle>
        <CardDescription>Custo total para o atelier ao longo do ano.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {rows.map((r) => (
            <div
              key={r.label}
              className={`flex items-baseline justify-between py-2 ${r.strong ? "font-semibold" : ""} ${r.accent ? "text-[var(--clay)]" : ""}`}
            >
              <span className="text-sm">{r.label}</span>
              <span className="font-mono tabular-nums">{fmtEUR(r.value)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
