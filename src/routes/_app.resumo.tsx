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

      <DeptCard title="Projecto" rows={projecto} />
      <DeptCard title="Backoffice" rows={backoffice} />
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

function DeptCard({ title, rows }: { title: string; rows: Row[] }) {
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
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{rows.length} colaborador(es)</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Ref. efectiva</TableHead>
              <TableHead className="text-right">Bruto Anual</TableHead>
              <TableHead className="text-right">Bruto Mensal</TableHead>
              <TableHead className="text-right">Líquido/mês</TableHead>
              <TableHead className="text-right">Alimentação</TableHead>
              <TableHead className="text-right">Ajudas/mês</TableHead>
              <TableHead className="text-right">Custo VBG</TableHead>
              <TableHead className="text-right">Δ Proposto</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Sem colaboradores neste departamento.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const ref = r.effective ?? r.proposed;
              const c = ref ? computeSnapshot(ref) : null;
              const cP = r.proposed ? computeSnapshot(r.proposed) : null;
              const delta = cP && r.effective ? cP.custoVBG - computeSnapshot(r.effective).custoVBG : null;
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
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.alimentacaoMensal) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c ? fmtEUR(c.ajudasMensal) : "—"}
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
              <TableCell colSpan={7} className="text-right font-semibold">
                Total {title} (VBG)
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
