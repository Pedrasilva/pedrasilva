import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type Collaborator,
  type Snapshot,
  computeSnapshot,
  fmtEUR,
  fmtDate,
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
          Última ficha efectiva vs. proposta, agrupado por departamento.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi title="Total Projecto (VBG)" value={fmtEUR(totalProjecto)} />
        <Kpi title="Total Backoffice (VBG)" value={fmtEUR(totalBackoffice)} />
        <Kpi title="Total RH (VBG)" value={fmtEUR(totalGeral)} highlight />
      </div>

      <Card className="border-primary">
        <CardHeader className="pb-2 flex-row items-end justify-between gap-4">
          <div>
            <CardDescription>
              Valor BO / hora — cota a distribuir por colaborador de Projecto
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

      <ProjectoCard
        rows={projecto}
        cotaBo={cotaBo}
        diasUteis={diasUteis}
        horasDia={horasDia}
        margemGlobal={margemGlobal}
      />
      <BackofficeCard rows={backoffice} />
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

function ProjectoCard({
  rows,
  cotaBo,
  diasUteis,
  horasDia,
  margemGlobal,
}: {
  rows: Row[];
  cotaBo: number;
  diasUteis: number;
  horasDia: number;
  margemGlobal: number;
}) {
  const totalEff = rows.reduce(
    (acc, r) => acc + (r.effective ? computeSnapshot(r.effective).custoVBG : 0),
    0,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projecto</CardTitle>
        <CardDescription>
          {rows.length} colaborador(es) · custo/hora = (VBG + cota BO) ÷ ({diasUteis}×{horasDia})
          h, depois ×1.20 (desperdício) e × (1 + margem)
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
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="text-right text-primary">Venda/h</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Sem colaboradores neste departamento.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const ref = r.effective ?? r.proposed;
              const c = ref ? computeSnapshot(ref) : null;
              const margem = r.collab.margem_lucro_pct_override ?? margemGlobal;
              const isOverride = r.collab.margem_lucro_pct_override != null;
              const p = c
                ? computePricing({
                    vbgColaborador: c.custoVBG,
                    cotaBoAnual: cotaBo,
                    diasUteis,
                    horasDia,
                    margemLucroPct: margem,
                  })
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
                    {p ? fmtEUR(p.custoHora) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p ? fmtEUR(p.custoHoraDesperdicio) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={isOverride ? "font-semibold text-primary" : ""}>
                      {(margem * 100).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">
                    {p ? fmtEUR(p.vendaHora) : "—"}
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
              <TableCell className="text-right font-semibold">Total Projecto (VBG)</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {fmtEUR(totalEff)}
              </TableCell>
              <TableCell colSpan={6} />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

function BackofficeCard({ rows }: { rows: Row[] }) {
  const totalEff = rows.reduce(
    (acc, r) => acc + (r.effective ? computeSnapshot(r.effective).custoVBG : 0),
    0,
  );
  const totalProp = rows.reduce(
    (acc, r) => acc + (r.proposed ? computeSnapshot(r.proposed).custoVBG : 0),
    0,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Backoffice</CardTitle>
        <CardDescription>
          {rows.length} colaborador(es) · entra como cota fixa nos custos de Projecto
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Ref. efectiva</TableHead>
              <TableHead className="text-right">Bruto Anual</TableHead>
              <TableHead className="text-right">Bruto Mensal</TableHead>
              <TableHead className="text-right">Líquido/mês</TableHead>
              <TableHead className="text-right">Custo VBG</TableHead>
              <TableHead className="text-right">Δ Proposto</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Sem colaboradores neste departamento.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const ref = r.effective ?? r.proposed;
              const c = ref ? computeSnapshot(ref) : null;
              const cP = r.proposed ? computeSnapshot(r.proposed) : null;
              const delta =
                cP && r.effective ? cP.custoVBG - computeSnapshot(r.effective).custoVBG : null;
              return (
                <TableRow key={r.collab.id}>
                  <TableCell className="font-medium">
                    <Link to="/colaborador/$id" params={{ id: r.collab.id }}>
                      {r.collab.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.effective ? fmtDate(r.effective.reference_date) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.brutoAnual) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.brutoMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.liquidoTotalMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {c ? fmtEUR(c.custoVBG) : "—"}
                  </TableCell>
                  <TableCell
                    className={
                      "text-right tabular-nums " +
                      (delta == null
                        ? "text-muted-foreground"
                        : delta > 0
                          ? "text-positive"
                          : delta < 0
                            ? "text-negative"
                            : "")
                    }
                  >
                    {delta == null ? "—" : (delta > 0 ? "+" : "") + fmtEUR(delta)}
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
              <TableCell colSpan={5} className="text-right font-semibold">
                Total Backoffice (VBG)
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {fmtEUR(totalEff)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-semibold">
                {totalProp ? fmtEUR(totalProp - totalEff) : "—"}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
