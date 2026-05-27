import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  type Collaborator,
  type Snapshot,
  computeSnapshot,
  fmtEUR,
} from "@/lib/salary";
import { computeValorBO } from "./_app.hr.valor-bo";
import { computePricing, cotaBoPorColabProjecto } from "@/lib/pricing";
import { computeCollaboratorFte, effectiveDailyHours } from "@/lib/hr/fte";
import {
  computeWeeklyCapacity,
  computeRecoverableHours,
  formatChargeabilityPct,
  formatHoursPerWeek,
} from "@/lib/hr/chargeability";
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
import { PermissionGate } from "@/components/PermissionGate";
import { useHasPermission } from "@/hooks/use-permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResumoComparativoTab } from "@/components/ResumoComparativoTab";
import { cn } from "@/lib/utils";
import { computeAverageBenefits } from "@/lib/hr/compensation-liquidity";
import type { BenefitExpense } from "@/lib/benefits";

export const Route = createFileRoute("/_app/hr/resumo")({
  component: () => (
    <PermissionGate permission="hr.resumo">
      <ResumoPage />
    </PermissionGate>
  ),
});

type Row = {
  collab: Collaborator;
  effective: Snapshot | null;
  proposed: Snapshot | null;
};

function ResumoPage() {
  const { t, i18n } = useTranslation(["hr", "common", "glossary"]);
  const { allowed: canViewResumoCompensation } = useHasPermission("hr.resumo.compensation.view");

  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("*")
        .is("archived_at", null)
        .order("nome");
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

  const { data: benefitExpenses12m = [] } = useQuery({
    queryKey: ["all-benefit-expenses-12m"],
    queryFn: async () => {
      const from = new Date();
      from.setMonth(from.getMonth() - 12);
      const { data, error } = await supabase
        .from("benefit_expenses")
        .select("*")
        .gte("data_despesa", from.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as BenefitExpense[];
    },
  });

  const avgBenefitsByCollab = useMemo(() => {
    const byCollab = new Map<string, BenefitExpense[]>();
    for (const e of benefitExpenses12m) {
      const arr = byCollab.get(e.collaborator_id) ?? [];
      arr.push(e);
      byCollab.set(e.collaborator_id, arr);
    }
    const out = new Map<string, number>();
    for (const [cid, arr] of byCollab) {
      out.set(cid, computeAverageBenefits(arr));
    }
    return out;
  }, [benefitExpenses12m]);

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

  // FTE-weighted overhead allocation: part-timers absorb proportionally less.
  const fteTotalProjecto = projecto.reduce(
    (acc, r) => acc + computeCollaboratorFte(r.collab.daily_hours, r.collab.days_per_week, horasDia),
    0,
  );

  const cotaBo = cotaBoPorColabProjecto({
    custosOperacionais: custosOp,
    custoBackofficeVbg: totalBackoffice,
    numColabProjecto: projecto.length,
    fteTotalProjecto,
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
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(n);
  const fmtPct = (n: number) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n) + "%";

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

  if (!canViewResumoCompensation) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("hr:resumo.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("hr:resumo.subtitle")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("hr:resumoCompensationGate.title")}</CardTitle>
            <CardDescription>{t("hr:resumoCompensationGate.description")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 print-area">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("hr:resumo.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("hr:resumo.subtitle")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          className="no-print shrink-0"
        >
          <Printer className="mr-2 h-4 w-4" />
          {t("hr:resumo.exportPdf")}
        </Button>
      </div>

      <Tabs defaultValue="geral" className="space-y-4">
        <TabsList className="no-print">
          <TabsTrigger value="geral">{t("hr:resumo.tabs.general")}</TabsTrigger>
          <TabsTrigger value="comparativo">{t("hr:resumo.tabs.comparative")}</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi title={t("hr:resumo.kpis.totalProjectTeam")} value={fmtEUR(totalProjecto)} />
            <Kpi
              title={t("hr:resumo.kpis.totalBackofficeTeam")}
              value={fmtEUR(totalBackoffice)}
            />
            <Kpi
              title={t("hr:resumo.kpis.totalAtelierAnnualCost")}
              value={fmtEUR(totalAtelier)}
              highlight
            />
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
              <CardTitle className="text-base">{t("hr:resumo.composition.title")}</CardTitle>
              <CardDescription>
                {t("hr:resumo.composition.description")}
                <span className="font-medium tabular-nums text-foreground">
                  {fmtEUR(totalAtelier)}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <CompositionView
                  title={t("hr:resumo.composition.hrVsOperational")}
                  bar={[
                    {
                      color: "bg-clay-complement",
                      pct: pctRH,
                      title: t("hr:resumo.composition.humanResourcesPct", {
                        pct: fmtPct(pctRH),
                      }),
                    },
                    {
                      color: "bg-clay",
                      pct: pctOp,
                      title: t("hr:resumo.composition.operationalPct", {
                        pct: fmtPct(pctOp),
                      }),
                    },
                  ]}
                  rows={[
                    {
                      color: "bg-clay-complement",
                      label: t("hr:resumo.composition.humanResourcesTgv"),
                      value: totalGeral,
                      pct: pctRH,
                    },
                    {
                      color: "bg-clay",
                      label: t("hr:resumo.composition.operationalCost"),
                      value: custosOp,
                      pct: pctOp,
                    },
                  ]}
                  hoursLabel={t("hr:resumo.composition.wholeTeamHours", {
                    count: numTotalEquipa,
                    days: diasUteis,
                    hours: horasDia,
                  })}
                  hours={horasCaso1}
                  costPerHour={custoHoraCaso1}
                  costColor="text-primary"
                  fmtH={fmtH}
                  fmtPct={fmtPct}
                  t={t}
                />
                <CompositionView
                  title={t("hr:resumo.composition.productionVsStructure")}
                  subtitle={t("hr:resumo.composition.structureSubtitle")}
                  bar={[
                    {
                      color: "bg-sage",
                      pct: pctProj,
                      title: t("hr:resumo.composition.projectResourcesPct", {
                        pct: fmtPct(pctProj),
                      }),
                    },
                    {
                      color: "bg-clay",
                      pct: pctEstr,
                      title: t("hr:resumo.composition.structurePct", {
                        pct: fmtPct(pctEstr),
                      }),
                    },
                  ]}
                  rows={[
                    {
                      color: "bg-sage",
                      label: t("hr:resumo.composition.projectResources"),
                      value: totalProjecto,
                      pct: pctProj,
                    },
                    {
                      color: "bg-clay",
                      label: t("hr:resumo.composition.structureLabel", {
                        backoffice: fmtEUR(totalBackoffice),
                        operational: fmtEUR(custosOp),
                      }),
                      value: estrutura,
                      pct: pctEstr,
                    },
                  ]}
                  hoursLabel={t("hr:resumo.composition.projectOnlyHours", {
                    count: projecto.length,
                    days: diasUteis,
                    hours: horasDia,
                  })}
                  hours={horasCaso2}
                  costPerHour={custoHoraCaso2}
                  costColor="text-sage"
                  fmtH={fmtH}
                  fmtPct={fmtPct}
                  t={t}
                />
              </div>
            </CardContent>
          </Card>

          <RhTable
            title={t("hr:landing.departments.backoffice")}
            rows={backoffice}
            totalLabel={t("hr:resumo.rhTable.totals.backoffice")}
            avgBenefitsByCollab={avgBenefitsByCollab}
          />
          <RhTable
            title={t("hr:landing.departments.project")}
            rows={projecto}
            totalLabel={t("hr:resumo.rhTable.totals.production")}
            avgBenefitsByCollab={avgBenefitsByCollab}
          />

          <CapacityOverviewTable
            rows={[...projecto, ...backoffice]}
            standardDailyHours={horasDia}
          />

          <PricingTable
            rows={projecto}
            cotaBo={cotaBo}
            diasUteis={diasUteis}
            horasDia={horasDia}
            margemGlobal={margemGlobal}
          />
        </TabsContent>

        <TabsContent value="comparativo">
          <ResumoComparativoTab rows={rows} expensesByCollab={benefitExpenses12m} />
        </TabsContent>
      </Tabs>
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
  const { t, i18n } = useTranslation(["hr"]);
  const precoDia = diasUteis > 0 ? totalAtelier / diasUteis : 0;
  const precoHora = diasUteis > 0 && horasDia > 0 ? totalAtelier / (diasUteis * horasDia) : 0;
  const precoMinuto = precoHora / 60;
  const precoSegundo = precoMinuto / 60;

  const cells: { label: string; value: number; unit: string }[] = [
    {
      label: t("hr:resumo.valorBo.perDayLabel"),
      value: precoDia,
      unit: t("hr:resumo.valorBo.perDayUnit"),
    },
    {
      label: t("hr:resumo.valorBo.perHourLabel"),
      value: precoHora,
      unit: t("hr:resumo.valorBo.perHourUnit"),
    },
    {
      label: t("hr:resumo.valorBo.perMinuteLabel"),
      value: precoMinuto,
      unit: t("hr:resumo.valorBo.perMinuteUnit"),
    },
    {
      label: t("hr:resumo.valorBo.perSecondLabel"),
      value: precoSegundo,
      unit: t("hr:resumo.valorBo.perSecondUnit"),
    },
  ];

  const fmtPct1 = (n: number) =>
    new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n) + "%";

  return (
    <Card className="border-primary">
      <CardHeader className="pb-2 flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base">{t("hr:resumo.valorBo.title")}</CardTitle>
          <CardDescription>
            {t("hr:resumo.valorBo.description", {
              total: fmtEUR(totalAtelier),
              days: diasUteis,
              hours: horasDia,
            })}
          </CardDescription>
        </div>
        <Link
          to="/hr/valor-bo"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("hr:resumo.valorBo.editParams")}
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cells.map((c) => (
            <div key={c.unit} className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-primary">
                {fmtEUR(c.value)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t("hr:resumo.valorBo.perUnit", { unit: c.unit })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t("hr:resumo.valorBo.footer", {
            cota: fmtEUR(cotaBo),
            margin: fmtPct1(margemGlobal * 100),
          })}
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
  fmtPct,
  t,
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
  fmtPct: (n: number) => string;
  t: (k: string, opts?: Record<string, unknown>) => string;
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
            {b.pct >= 8 && fmtPct(b.pct)}
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
              <span className="text-sm font-semibold">{fmtPct(r.pct)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-1.5 text-[11px]">
        <span className="text-muted-foreground">{hoursLabel}</span>
        <span className="tabular-nums">
          <span className="font-medium text-foreground">
            {t("hr:resumo.composition.hoursPerYear", { value: fmtH(hours) })}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className={`font-semibold ${costColor}`}>
            {t("hr:resumo.composition.costPerHour", { value: fmtEUR(costPerHour) })}
          </span>
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
  | "monthlyLiquidity"
  | "beneficios"
  | "vbg"
  | "anos";

function rhValue(
  r: Row,
  k: RhSortKey,
  avgBenefitsByCollab?: Map<string, number>,
): number | string | null {
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
    case "monthlyLiquidity": {
      if (!c) return null;
      const avg = avgBenefitsByCollab?.get(r.collab.id) ?? 0;
      return c.liquidoTotalMensal + c.passeMensal + avg;
    }
    case "beneficios":
      return avgBenefitsByCollab?.get(r.collab.id) ?? 0;
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
  avgBenefitsByCollab,
}: {
  title: string;
  rows: Row[];
  totalLabel: string;
  avgBenefitsByCollab?: Map<string, number>;
}) {
  const { t, i18n } = useTranslation(["hr"]);
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
        const av = rhValue(a, sortKey, avgBenefitsByCollab);
        const bv = rhValue(b, sortKey, avgBenefitsByCollab);
        return compareValues(av, bv, sortDir, i18n.language);
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
          {t("hr:resumo.rhTable.subtitle", { count: rows.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label={t("hr:resumo.rhTable.headers.name")} k="nome" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <TableHead>{t("hr:resumo.rhTable.headers.code")}</TableHead>
              <TableHead>{t("hr:resumo.rhTable.headers.contractStatus")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.dailyHours")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.daysPerWeek")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.fte")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.targetChargeability")}</TableHead>
              <SortHead align="right" label={t("hr:resumo.rhTable.headers.grossAnnual")} k="brutoAnual" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.contractualBase")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.grossMonthly")}</TableHead>
              <TableHead>{t("hr:resumo.rhTable.headers.subsidiosMode")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.monthsPaid")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.ssEmployer")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.ssEmployee")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.irsPct")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.mealAllowance")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.perDiem")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.transportPass")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.netMonthly")}</TableHead>
              <SortHead align="right" label={t("hr:resumo.rhTable.headers.monthlyLiquidity")} k="monthlyLiquidity" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.avgBenefitsMonthly")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.carBenefit")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.ticketBenefit")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.associatePrize")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.otherBenefits")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.variableBenefit")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.retirementPlan")}</TableHead>
              <TableHead>{t("hr:resumo.rhTable.headers.location")}</TableHead>
              <TableHead>{t("hr:resumo.rhTable.headers.maritalStatus")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.titulares")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.dependents")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.dependentsDisability")}</TableHead>
              <TableHead className="text-right">{t("hr:resumo.rhTable.headers.fiscalYear")}</TableHead>
              <SortHead align="right" label={t("hr:resumo.rhTable.headers.tgv")} k="vbg" sortKey={sortKey} dir={sortDir} onClick={toggleSort} bold />
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={36} className="text-center text-muted-foreground py-8">
                  {t("hr:resumo.rhTable.emptyDepartment")}
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((r, idx) => {
              const ref = r.effective ?? r.proposed;
              const c = ref ? computeSnapshot(ref) : null;
              const fte = computeCollaboratorFte(r.collab.daily_hours, r.collab.days_per_week, 8);
              const fteFmt = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fte);
              const pct = (n: number | null | undefined) =>
                n == null ? "—" : `${(n * 100).toLocaleString(i18n.language, { maximumFractionDigits: 2 })}%`;
              const mealDaily = ref
                ? ref.subsidio_alimentacao_manual
                  ? ref.subsidio_alimentacao_diario_manual
                  : ref.subsidio_alimentacao_diario
                : 0;
              return (
                <TableRow key={r.collab.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link to="/hr/colaborador/$id" params={{ id: r.collab.id }}>{r.collab.nome}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.collab.situacao_contractual ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.daily_hours ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.days_per_week ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fteFmt}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.target_chargeability_pct != null ? `${r.collab.target_chargeability_pct}%` : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c ? fmtEUR(c.brutoAnual) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c ? fmtEUR(c.base) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c ? fmtEUR(c.brutoMensal) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{ref?.subsidios_modo ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref?.meses_pagos ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(ref?.ss_atelier_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(ref?.ss_colaborador_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(ref?.irs_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums" title={ref ? fmtEUR(mealDaily) + "/dia" : ""}>{c ? fmtEUR(c.alimentacaoMensal) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c ? fmtEUR(c.ajudasMensal) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.passe_anual) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c ? fmtEUR(c.liquidoTotalMensal) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {c ? fmtEUR(c.liquidoTotalMensal + c.passeMensal + (avgBenefitsByCollab?.get(r.collab.id) ?? 0)) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtEUR(avgBenefitsByCollab?.get(r.collab.id) ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.beneficio_carro) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.beneficio_ticket) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.premio_associado) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.outros_beneficios) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.beneficio_variavel) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ref ? fmtEUR(ref.plano_reforma ?? 0) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.collab.localizacao || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.collab.estado_civil || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.numero_titulares}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.numero_dependentes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.dependentes_com_deficiencia}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.collab.ano_fiscal}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{c ? fmtEUR(c.custoVBG) : "—"}</TableCell>
                  <TableCell>
                    <Link to="/hr/colaborador/$id" params={{ id: r.collab.id }}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={7} className="font-semibold">{totalLabel}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{fmtEUR(totalBrutoAnual)}</TableCell>
              <TableCell colSpan={26} />
              <TableCell className="text-right tabular-nums font-semibold">{fmtEUR(totalVbg)}</TableCell>
              <TableCell />
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
  const { t, i18n } = useTranslation(["hr"]);
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

  

  const computeRow = (r: Row) => {
    const ref = r.effective ?? r.proposed;
    const c = ref ? computeSnapshot(ref) : null;
    // Per-collaborator productive hours. The collaborator's salary (VBG) is
    // already their actual annual cost — never grossed up to full-time. Only
    // the BO share is FTE-weighted: a 0.5 FTE absorbs half a 1.0 FTE share.
    const collabHorasDia = effectiveDailyHours(r.collab.daily_hours, horasDia);
    const collabHorasAno = diasUteis * collabHorasDia;
    const fte = computeCollaboratorFte(r.collab.daily_hours, r.collab.days_per_week, horasDia);
    const cotaBoColab = cotaBo * fte;
    const chargeabilityPct =
      r.collab.target_chargeability_pct != null
        ? Number(r.collab.target_chargeability_pct) / 100
        : undefined;
    const baseArgs = c
      ? { vbgColaborador: c.custoVBG, cotaBoAnual: cotaBoColab, diasUteis, horasDia: collabHorasDia, chargeabilityPct }
      : null;
    const horasFacturaveis = collabHorasAno * (chargeabilityPct ?? 1);
    return {
      c,
      vbgH: c && horasFacturaveis > 0 ? c.custoVBG / horasFacturaveis : null,
      cotaBoH: horasFacturaveis > 0 ? cotaBoColab / horasFacturaveis : 0,
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
        return compareValues(av, bv, sortDir, i18n.language);
      })
    : rows;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("hr:resumo.pricing.title")}</CardTitle>
        <CardDescription>
          {t("hr:resumo.pricing.description", { days: diasUteis, hours: horasDia })}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead
                label={t("hr:resumo.pricing.headers.collaborator")}
                k="nome"
                sortKey={sortKey}
                dir={sortDir}
                onClick={toggleSort}
              />
              <TableHead className="text-right">
                {t("hr:resumo.pricing.headers.tgvPerHour")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.pricing.headers.boSharePerHour")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.pricing.headers.costPerHour")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.pricing.headers.at30")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.pricing.headers.at50")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.pricing.headers.at100")}
              </TableHead>
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
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {t("hr:resumo.pricing.empty")}
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((r) => {
              const { vbgH, cotaBoH, p30, p50, p100, pCustom } = computeRow(r);
              return (
                <TableRow key={r.collab.id}>
                  <TableCell className="font-medium">
                    <Link to="/hr/colaborador/$id" params={{ id: r.collab.id }}>
                      {r.collab.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vbgH != null ? fmtEUR(vbgH) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtEUR(cotaBoH)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p30 ? fmtEUR(p30.custoHora) : "—"}
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
  lang: string,
): number {
  // null/undefined sempre no fim
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const mult = dir === "asc" ? 1 : -1;
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, lang, { sensitivity: "base" }) * mult;
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
        {align === "right" && (
          <Icon className={`h-3 w-3 ${active ? "opacity-70" : "opacity-50"}`} />
        )}
        {label}
        {align === "left" && (
          <Icon className={`h-3 w-3 ${active ? "opacity-70" : "opacity-50"}`} />
        )}
      </button>
    </TableHead>
  );
}

function CapacityOverviewTable({
  rows,
  standardDailyHours,
}: {
  rows: Row[];
  standardDailyHours: number;
}) {
  const { t, i18n } = useTranslation(["hr"]);
  const notDefined = t("hr:resumo.capacityOverview.notDefined");

  const enriched = rows.map((r) => {
    const dh = Number(r.collab.daily_hours ?? 8);
    const dpw = Number(r.collab.days_per_week ?? 5);
    const weekly = computeWeeklyCapacity(dh, dpw);
    const fte = computeCollaboratorFte(dh, dpw, standardDailyHours);
    const target = r.collab.target_chargeability_pct ?? null;
    const recoverable = computeRecoverableHours(weekly, target);
    return { r, dh, dpw, weekly, fte, target, recoverable };
  });

  const totalRecoverable = enriched.reduce(
    (acc, e) => acc + (e.recoverable ?? 0),
    0,
  );
  const definedCount = enriched.filter((e) => e.target != null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("hr:resumo.capacityOverview.title")}
        </CardTitle>
        <CardDescription>
          {t("hr:resumo.capacityOverview.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("hr:resumo.capacityOverview.headers.collaborator")}</TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.capacityOverview.headers.fte")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.capacityOverview.headers.weeklyCapacity")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.capacityOverview.headers.targetChargeability")}
              </TableHead>
              <TableHead className="text-right">
                {t("hr:resumo.capacityOverview.headers.recoverableHours")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enriched.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {t("hr:resumo.capacityOverview.empty")}
                </TableCell>
              </TableRow>
            )}
            {enriched.map((e) => {
              const targetStr = formatChargeabilityPct(e.target, i18n.language);
              return (
                <TableRow key={e.r.collab.id}>
                  <TableCell className="font-medium">
                    <Link to="/hr/colaborador/$id" params={{ id: e.r.collab.id }}>
                      {e.r.collab.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {new Intl.NumberFormat(i18n.language, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(e.fte)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatHoursPerWeek(e.weekly, i18n.language)} h
                  </TableCell>
                  <TableCell className="text-right tabular-nums p-1">
                    <EditableChargeabilityCell
                      collaboratorId={e.r.collab.id}
                      value={e.target}
                      notDefinedLabel={notDefined}
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      e.recoverable == null && "text-muted-foreground italic",
                    )}
                  >
                    {e.recoverable == null
                      ? notDefined
                      : `${formatHoursPerWeek(e.recoverable, i18n.language)} h`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold" colSpan={3}>
                {t("hr:resumo.capacityOverview.totals.label", {
                  defined: definedCount,
                  total: enriched.length,
                })}
              </TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums font-semibold">
                {formatHoursPerWeek(totalRecoverable, i18n.language)} h
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <p className="px-4 pb-4 pt-2 text-[11px] text-muted-foreground">
          {t("hr:resumo.capacityOverview.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
}

