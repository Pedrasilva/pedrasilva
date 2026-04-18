import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type Collaborator,
  type Snapshot,
  computeSnapshot,
  fmtEUR,
} from "@/lib/salary";
import { computeValorBO } from "./_app.valor-bo";
import { computePricing, cotaBoPorColabProjecto, TAXA_DESPERDICIO } from "@/lib/pricing";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/resumo")({
  component: ResumoPage,
});

type Row = {
  collab: Collaborator;
  effective: Snapshot | null;
  proposed: Snapshot | null;
};

function ResumoPage() {
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators").select("*").order("nome");
      if (error) throw error;
      return data as Collaborator[];
    },
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["all-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_snapshots")
        .select("*")
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return data as Snapshot[];
    },
  });

  const { data: boSettings } = useQuery({
    queryKey: ["bo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bo_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as {
        custos_operacionais_anual: number;
        dias_uteis: number;
        horas_dia: number;
        margem_lucro_pct: number;
      } | null;
    },
  });

  const rows: Row[] = collaborators.map((c) => {
    const sns = snapshots.filter((s) => s.collaborator_id === c.id);
    const effective = sns.find((s) => s.is_effective) ?? null;
    const proposed = sns.find((s) => !s.is_effective) ?? null;
    return { collab: c, effective, proposed };
  });

  const projecto = rows.filter((r) => r.collab.departamento === "Projecto");
  const backoffice = rows.filter((r) => r.collab.departamento === "Backoffice");

  const totalProjecto = sumVBG(projecto);
  const totalBackoffice = sumVBG(backoffice);
  const totalGeral = totalProjecto + totalBackoffice;

  const custosOp = Number(boSettings?.custos_operacionais_anual ?? 0);
  const diasUteis = Number(boSettings?.dias_uteis ?? 220);
  const horasDia = Number(boSettings?.horas_dia ?? 8);
  const margemGlobal = Number(boSettings?.margem_lucro_pct ?? 0.25);

  const valorBO = computeValorBO({
    custosOperacionais: custosOp,
    custoBackoffice: totalBackoffice,
    custoProjecto: totalProjecto,
    numColaboradoresProjecto: projecto.length,
    diasUteis,
    horasDia,
  });

  const cotaBo = cotaBoPorColabProjecto({
    custosOperacionais: custosOp,
    custoBackofficeVbg: totalBackoffice,
    numColabProjecto: projecto.length,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resumo geral</h1>
        <p className="text-sm text-muted-foreground">
          Formato espelhado do mapa Excel — Equipa Backoffice + Equipa Projecto.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi title="Total Equipa Projecto (VBG)" value={fmtEUR(totalProjecto)} />
        <Kpi title="Total Equipa Backoffice (VBG)" value={fmtEUR(totalBackoffice)} />
        <Kpi title="Total RH (VBG)" value={fmtEUR(totalGeral)} highlight />
      </div>

      <Card className="border-primary">
        <CardHeader className="pb-2 flex-row items-end justify-between gap-4">
          <div>
            <CardDescription>
              Valor BO / hora — cota a distribuir por colaborador da Equipa Projecto
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums text-primary">
              {fmtEUR(valorBO.valorHora)}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Cota BO/colab/ano: {fmtEUR(cotaBo)} · Margem global:{" "}
              {(margemGlobal * 100).toFixed(1)}% · Desperdício:{" "}
              {(TAXA_DESPERDICIO * 100).toFixed(0)}%
            </p>
          </div>
          <Link
            to="/valor-bo"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Editar parâmetros →
          </Link>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RatioCard
          title="Custo operacional / Total RH"
          numerator={custosOp}
          denominator={totalGeral}
          hint="Peso dos custos operacionais sobre o custo total de recursos humanos (VBG)."
        />
        <RatioCard
          title="(Custo operacional + Backoffice) / Equipa Projecto"
          numerator={custosOp + totalBackoffice}
          denominator={totalProjecto}
          hint="Quanto a estrutura (operacional + backoffice) representa face ao custo da equipa de produção."
        />
      </div>

      <RhTable title="Equipa Backoffice" rows={backoffice} totalLabel="Equipa Backoffice" />
      <RhTable title="Equipa Projecto" rows={projecto} totalLabel="Equipa produção" />

      <PricingTable
        rows={projecto}
        cotaBo={cotaBo}
        diasUteis={diasUteis}
        horasDia={horasDia}
        margemGlobal={margemGlobal}
      />
    </div>
  );
}

function sumVBG(rows: Row[]) {
  return rows.reduce((acc, r) => {
    const s = r.effective ?? r.proposed;
    return acc + (s ? computeSnapshot(s).custoVBG : 0);
  }, 0);
}

function Kpi({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function anosCarreira(inicio: string | null): string {
  if (!inicio) return "—";
  const start = new Date(inicio);
  if (isNaN(start.getTime())) return "—";
  const now = new Date();
  let anos = now.getFullYear() - start.getFullYear();
  const m = now.getMonth() - start.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < start.getDate())) anos -= 1;
  return `${anos} anos`;
}

function RhTable({
  title,
  rows,
  totalLabel,
}: {
  title: string;
  rows: Row[];
  totalLabel: string;
}) {
  // Totais sobre VBG e Bruto anual (como no Excel)
  let totalBrutoAnual = 0;
  let totalVbg = 0;
  rows.forEach((r) => {
    const ref = r.effective ?? r.proposed;
    if (!ref) return;
    const c = computeSnapshot(ref);
    totalBrutoAnual += c.brutoAnual;
    totalVbg += c.custoVBG;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {rows.length} colaborador(es) · valores baseados na ficha efectiva (ou proposta se não houver efectiva)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cód.</TableHead>
              <TableHead className="text-right">Bruto anual</TableHead>
              <TableHead className="text-right">Base contractual</TableHead>
              <TableHead className="text-right">Bruto mensal</TableHead>
              <TableHead className="text-right">Alimentação</TableHead>
              <TableHead className="text-right">Ajudas de custo</TableHead>
              <TableHead className="text-right">Líquido mensal</TableHead>
              <TableHead className="text-right">Benefícios anual</TableHead>
              <TableHead className="text-right font-semibold">VBG</TableHead>
              <TableHead className="text-right">Anos</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  Sem colaboradores neste departamento.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, idx) => {
              const ref = r.effective ?? r.proposed;
              const c = ref ? computeSnapshot(ref) : null;
              return (
                <TableRow key={r.collab.id}>
                  <TableCell className="font-medium">
                    <Link to="/colaborador/$id" params={{ id: r.collab.id }}>
                      {r.collab.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.brutoAnual) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.base) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.brutoMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.alimentacaoMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.ajudasMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.liquidoTotalMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.beneficiosAnual) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {c ? fmtEUR(c.custoVBG) : "—"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {anosCarreira(r.collab.inicio_carreira)}
                  </TableCell>
                  <TableCell>
                    <Link to="/colaborador/$id" params={{ id: r.collab.id }}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">
                {totalLabel}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {fmtEUR(totalBrutoAnual)}
              </TableCell>
              <TableCell colSpan={6} />
              <TableCell className="text-right tabular-nums font-semibold">
                {fmtEUR(totalVbg)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function PricingTable({
  rows,
  cotaBo,
  diasUteis,
  horasDia,
}: {
  rows: Row[];
  cotaBo: number;
  diasUteis: number;
  horasDia: number;
  margemGlobal?: number;
}) {
  const [customPct, setCustomPct] = useState<number>(75);
  const customMargem = customPct / 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pricing — Equipa Projecto</CardTitle>
        <CardDescription>
          Custo/hora = (VBG + cota BO) ÷ ({diasUteis}×{horasDia}) h, depois ×1.20 (desperdício) e × (1
          + margem)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead className="text-right">VBG</TableHead>
              <TableHead className="text-right">+ Cota BO</TableHead>
              <TableHead className="text-right">Custo/h</TableHead>
              <TableHead className="text-right">×1.20</TableHead>
              <TableHead className="text-right">@ 30%</TableHead>
              <TableHead className="text-right">@ 50%</TableHead>
              <TableHead className="text-right">@ 100%</TableHead>
              <TableHead className="text-right text-primary">
                <div className="flex items-center justify-end gap-1.5">
                  <span>@</span>
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={customPct}
                    onChange={(e) => setCustomPct(Number(e.target.value) || 0)}
                    className="h-7 w-16 text-right tabular-nums"
                  />
                  <span>%</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Sem colaboradores.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const ref = r.effective ?? r.proposed;
              const c = ref ? computeSnapshot(ref) : null;
              const baseArgs = c
                ? { vbgColaborador: c.custoVBG, cotaBoAnual: cotaBo, diasUteis, horasDia }
                : null;
              const p30 = baseArgs ? computePricing({ ...baseArgs, margemLucroPct: 0.3 }) : null;
              const p50 = baseArgs ? computePricing({ ...baseArgs, margemLucroPct: 0.5 }) : null;
              const p100 = baseArgs ? computePricing({ ...baseArgs, margemLucroPct: 1.0 }) : null;
              const pCustom = baseArgs
                ? computePricing({ ...baseArgs, margemLucroPct: customMargem })
                : null;
              return (
                <TableRow key={r.collab.id}>
                  <TableCell className="font-medium">
                    <Link to="/colaborador/$id" params={{ id: r.collab.id }}>
                      {r.collab.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.custoVBG) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtEUR(cotaBo)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p30 ? fmtEUR(p30.custoHora) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p30 ? fmtEUR(p30.custoHoraDesperdicio) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p30 ? fmtEUR(p30.vendaHora) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p50 ? fmtEUR(p50.vendaHora) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p100 ? fmtEUR(p100.vendaHora) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">
                    {pCustom ? fmtEUR(pCustom.vendaHora) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
