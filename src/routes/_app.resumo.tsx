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
import { ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminOnly } from "@/components/AdminOnly";

export const Route = createFileRoute("/_app/resumo")({
  component: () => (
    <AdminOnly>
      <ResumoPage />
    </AdminOnly>
  ),
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

  const totalAtelier = totalGeral + custosOp;
  const pctRH = totalAtelier > 0 ? (totalGeral / totalAtelier) * 100 : 0;
  const pctOp = totalAtelier > 0 ? (custosOp / totalAtelier) * 100 : 0;
  const estrutura = totalBackoffice + custosOp;
  const pctProj = totalAtelier > 0 ? (totalProjecto / totalAtelier) * 100 : 0;
  const pctEstr = totalAtelier > 0 ? (estrutura / totalAtelier) * 100 : 0;
  const numTotalEquipa = projecto.length + backoffice.length;
  const horasCaso1 = numTotalEquipa * diasUteis * horasDia;
  const horasCaso2 = projecto.length * diasUteis * horasDia;
  const custoHoraCaso1 = horasCaso1 > 0 ? totalAtelier / horasCaso1 : 0;
  const custoHoraCaso2 = horasCaso2 > 0 ? totalAtelier / horasCaso2 : 0;
  const fmtH = (n: number) =>
    new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(n);

  const handlePrint = () => {
    const styleId = "print-landscape-style";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = "@media print { @page { size: A4 landscape; margin: 10mm; } }";
      document.head.appendChild(styleEl);
    }
    const cleanup = () => {
      styleEl?.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  return (
    <div className="space-y-6 print-area">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resumo geral</h1>
          <p className="text-sm text-muted-foreground">
            Formato espelhado do mapa Excel — Equipa Backoffice + Equipa Projecto.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="no-print shrink-0"
        >
          <Printer className="mr-2 h-4 w-4" />
          Exportar PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi title="Total Equipa Projecto (VBG)" value={fmtEUR(totalProjecto)} />
        <Kpi title="Total Equipa Backoffice (VBG)" value={fmtEUR(totalBackoffice)} />
        <Kpi title="Custo total anual do atelier" value={fmtEUR(totalAtelier)} highlight />
      </div>

      <ValorBoCard
        cotaBo={cotaBo}
        margemGlobal={margemGlobal}
        totalAtelier={totalAtelier}
        diasUteis={diasUteis}
        horasDia={horasDia}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição do custo total do atelier</CardTitle>
          <CardDescription>
            Custo total = Recursos Humanos (VBG) + Custo Operacional ={" "}
            <span className="font-medium tabular-nums text-foreground">
              {fmtEUR(totalAtelier)}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <CompositionView
              title="Recursos Humanos vs Operacional"
              bar={[
                { color: "bg-clay-complement", pct: pctRH, title: `Recursos Humanos: ${pctRH.toFixed(1)}%` },
                { color: "bg-clay", pct: pctOp, title: `Custo Operacional: ${pctOp.toFixed(1)}%` },
              ]}
              rows={[
                { color: "bg-clay-complement", label: "Recursos Humanos (VBG)", value: totalGeral, pct: pctRH },
                { color: "bg-clay", label: "Custo Operacional", value: custosOp, pct: pctOp },
              ]}
              hoursLabel={`Toda a equipa (${numTotalEquipa} × ${diasUteis} × ${horasDia} h)`}
              hours={horasCaso1}
              costPerHour={custoHoraCaso1}
              costColor="text-primary"
              fmtH={fmtH}
            />
            <CompositionView
              title="Produção vs Estrutura"
              subtitle="Estrutura = Backoffice + Operacional"
              bar={[
                { color: "bg-sage", pct: pctProj, title: `Recursos Projecto: ${pctProj.toFixed(1)}%` },
                { color: "bg-clay", pct: pctEstr, title: `Estrutura: ${pctEstr.toFixed(1)}%` },
              ]}
              rows={[
                { color: "bg-sage", label: "Recursos Projecto", value: totalProjecto, pct: pctProj },
                { color: "bg-clay", label: `Backoffice (${fmtEUR(totalBackoffice)}) + Operacional (${fmtEUR(custosOp)})`, value: estrutura, pct: pctEstr },
              ]}
              hoursLabel={`Só Projecto (${projecto.length} × ${diasUteis} × ${horasDia} h)`}
              hours={horasCaso2}
              costPerHour={custoHoraCaso2}
              costColor="text-sage"
              fmtH={fmtH}
            />
          </div>
        </CardContent>
      </Card>

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

function ValorBoCard({
  cotaBo,
  margemGlobal,
  totalAtelier,
  diasUteis,
  horasDia,
}: {
  cotaBo: number;
  margemGlobal: number;
  totalAtelier: number;
  diasUteis: number;
  horasDia: number;
}) {
  const precoDia = diasUteis > 0 ? totalAtelier / diasUteis : 0;
  const precoHora = diasUteis > 0 && horasDia > 0 ? totalAtelier / (diasUteis * horasDia) : 0;
  const precoMinuto = precoHora / 60;
  const precoSegundo = precoMinuto / 60;

  const cells: { label: string; value: number; unit: string }[] = [
    { label: "Valor / dia", value: precoDia, unit: "dia" },
    { label: "Valor / hora", value: precoHora, unit: "hora" },
    { label: "Valor / minuto", value: precoMinuto, unit: "min" },
    { label: "Valor / segundo", value: precoSegundo, unit: "seg" },
  ];

  return (
    <Card className="border-primary">
      <CardHeader className="pb-2 flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base">Custo do atelier por unidade de tempo</CardTitle>
          <CardDescription>
            Custo total ({fmtEUR(totalAtelier)}) ÷ {diasUteis} dias úteis × {horasDia} h/dia
          </CardDescription>
        </div>
        <Link
          to="/valor-bo"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Editar parâmetros →
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cells.map((c) => (
            <div
              key={c.unit}
              className="rounded-lg border bg-muted/30 p-3"
            >
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                {fmtEUR(c.value)}
              </div>
              <div className="text-[11px] text-muted-foreground">por {c.unit}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Cota BO/colab/ano: {fmtEUR(cotaBo)} · Margem global:{" "}
          {(margemGlobal * 100).toFixed(1)}% · Desperdício:{" "}
          {(TAXA_DESPERDICIO * 100).toFixed(0)}%
        </p>
      </CardContent>
    </Card>
  );
}


function CompositionView({
  title,
  subtitle,
  bar,
  rows,
  hoursLabel,
  hours,
  costPerHour,
  costColor,
  fmtH,
}: {
  title: string;
  subtitle?: string;
  bar: { color: string; pct: number; title: string }[];
  rows: { color: string; label: string; value: number; pct: number }[];
  hoursLabel: string;
  hours: number;
  costPerHour: number;
  costColor: string;
  fmtH: (n: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
      </div>
      <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted text-[11px] font-semibold text-white">
        {bar.map((b, i) => (
          <div
            key={i}
            className={`flex items-center justify-center ${b.color}`}
            style={{ width: `${b.pct}%` }}
            title={b.title}
          >
            {b.pct >= 8 && `${b.pct.toFixed(1)}%`}
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${r.color}`} />
              <span className="text-xs font-medium truncate">{r.label}</span>
            </div>
            <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
              <span className="text-xs text-muted-foreground">{fmtEUR(r.value)}</span>
              <span className="text-sm font-semibold">{r.pct.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground">{hoursLabel}</span>
        <span className="tabular-nums">
          <span className="font-medium text-foreground">{fmtH(hours)} h/ano</span>
          <span className="text-muted-foreground"> · </span>
          <span className={`font-semibold ${costColor}`}>{fmtEUR(costPerHour)}/h</span>
        </span>
      </div>
    </div>
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

type RhSortKey =
  | "nome"
  | "brutoAnual"
  | "base"
  | "brutoMensal"
  | "alimentacao"
  | "ajudas"
  | "liquido"
  | "beneficios"
  | "vbg"
  | "anos";

function rhValue(r: Row, k: RhSortKey): number | string | null {
  const ref = r.effective ?? r.proposed;
  const c = ref ? computeSnapshot(ref) : null;
  switch (k) {
    case "nome":
      return r.collab.nome;
    case "brutoAnual":
      return c?.brutoAnual ?? null;
    case "base":
      return c?.base ?? null;
    case "brutoMensal":
      return c?.brutoMensal ?? null;
    case "alimentacao":
      return c?.alimentacaoMensal ?? null;
    case "ajudas":
      return c?.ajudasMensal ?? null;
    case "liquido":
      return c?.liquidoTotalMensal ?? null;
    case "beneficios":
      return c?.beneficiosAnual ?? null;
    case "vbg":
      return c?.custoVBG ?? null;
    case "anos": {
      if (!r.collab.inicio_carreira) return null;
      const start = new Date(r.collab.inicio_carreira);
      if (isNaN(start.getTime())) return null;
      return Date.now() - start.getTime();
    }
  }
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
  const [sortKey, setSortKey] = useState<RhSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (k: RhSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "nome" ? "asc" : "desc");
    }
  };

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = rhValue(a, sortKey);
        const bv = rhValue(b, sortKey);
        return compareValues(av, bv, sortDir);
      })
    : rows;

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
              <SortHead label="Nome" k="nome" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <TableHead>Cód.</TableHead>
              <SortHead align="right" label="Bruto anual" k="brutoAnual" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <TableHead className="text-right">Base contractual</TableHead>
              <TableHead className="text-right">Bruto mensal</TableHead>
              <TableHead className="text-right">Alimentação</TableHead>
              <TableHead className="text-right">Ajudas de custo</TableHead>
              <TableHead className="text-right">Líquido mensal</TableHead>
              <TableHead className="text-right">Benefícios anual</TableHead>
              <SortHead align="right" label="VBG" k="vbg" sortKey={sortKey} dir={sortDir} onClick={toggleSort} bold />
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Sem colaboradores neste departamento.
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((r, idx) => {
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
              <TableCell colSpan={1} />
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
  const [sortKey, setSortKey] = useState<PricingSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (k: PricingSortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "nome" ? "asc" : "desc");
    }
  };

  const totalH = diasUteis * horasDia;
  const cotaBoH = totalH > 0 ? cotaBo / totalH : 0;

  const computeRow = (r: Row) => {
    const ref = r.effective ?? r.proposed;
    const c = ref ? computeSnapshot(ref) : null;
    const baseArgs = c
      ? { vbgColaborador: c.custoVBG, cotaBoAnual: cotaBo, diasUteis, horasDia }
      : null;
    return {
      c,
      vbgH: c && totalH > 0 ? c.custoVBG / totalH : null,
      cotaBoH,
      p30: baseArgs ? computePricing({ ...baseArgs, margemLucroPct: 0.3 }) : null,
      p50: baseArgs ? computePricing({ ...baseArgs, margemLucroPct: 0.5 }) : null,
      p100: baseArgs ? computePricing({ ...baseArgs, margemLucroPct: 1.0 }) : null,
      pCustom: baseArgs
        ? computePricing({ ...baseArgs, margemLucroPct: customMargem })
        : null,
    };
  };

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const ra = computeRow(a);
        const rb = computeRow(b);
        const av = pricingValue(a, ra, sortKey);
        const bv = pricingValue(b, rb, sortKey);
        return compareValues(av, bv, sortDir);
      })
    : rows;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pricing — Equipa Projecto</CardTitle>
        <CardDescription>
          VBG/h e Cota BO/h = valor anual ÷ ({diasUteis}×{horasDia}) h. Custo/h soma os dois,
          depois ×1.20 (desperdício) e × (1 + margem).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Colaborador" k="nome" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <TableHead className="text-right">VBG/h</TableHead>
              <TableHead className="text-right">+ Cota BO/h</TableHead>
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
            {sortedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Sem colaboradores.
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((r) => {
              const { c, p30, p50, p100, pCustom } = computeRow(r);
              return (
                <TableRow key={r.collab.id}>
                  <TableCell className="font-medium">
                    <Link to="/colaborador/$id" params={{ id: r.collab.id }}>
                      {r.collab.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.custoVBG / totalH) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtEUR(cotaBoH)}
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

// ============== Sorting helpers (shared) ==============

type SortDir = "asc" | "desc";

type PricingSortKey =
  | "nome"
  | "vbgH"
  | "cotaBoH"
  | "custoH"
  | "custoHDesp"
  | "venda30"
  | "venda50"
  | "venda100"
  | "vendaCustom";

function pricingValue(
  r: Row,
  pre: ReturnType<
    (r: Row) => {
      c: ReturnType<typeof computeSnapshot> | null;
      vbgH: number | null;
      cotaBoH: number;
      p30: ReturnType<typeof computePricing> | null;
      p50: ReturnType<typeof computePricing> | null;
      p100: ReturnType<typeof computePricing> | null;
      pCustom: ReturnType<typeof computePricing> | null;
    }
  >,
  k: PricingSortKey,
): number | string | null {
  switch (k) {
    case "nome":
      return r.collab.nome;
    case "vbgH":
      return pre.vbgH;
    case "cotaBoH":
      return pre.cotaBoH;
    case "custoH":
      return pre.p30?.custoHora ?? null;
    case "custoHDesp":
      return pre.p30?.custoHoraDesperdicio ?? null;
    case "venda30":
      return pre.p30?.vendaHora ?? null;
    case "venda50":
      return pre.p50?.vendaHora ?? null;
    case "venda100":
      return pre.p100?.vendaHora ?? null;
    case "vendaCustom":
      return pre.pCustom?.vendaHora ?? null;
  }
}

function compareValues(
  a: number | string | null,
  b: number | string | null,
  dir: SortDir,
): number {
  // null/undefined sempre no fim
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const mult = dir === "asc" ? 1 : -1;
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "pt", { sensitivity: "base" }) * mult;
  }
  return ((a as number) - (b as number)) * mult;
}

function SortHead<K extends string>({
  label,
  k,
  sortKey,
  dir,
  onClick,
  align = "left",
  bold = false,
}: {
  label: string;
  k: K;
  sortKey: K | null;
  dir: SortDir;
  onClick: (k: K) => void;
  align?: "left" | "right";
  bold?: boolean;
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 select-none hover:text-foreground transition-colors ${
          active ? "text-foreground" : "text-muted-foreground"
        } ${bold ? "font-semibold" : ""}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {align === "right" && <Icon className={`h-3 w-3 ${active ? "opacity-70" : "opacity-50"}`} />}
        {label}
        {align === "left" && <Icon className={`h-3 w-3 ${active ? "opacity-70" : "opacity-50"}`} />}
      </button>
    </TableHead>
  );
}
