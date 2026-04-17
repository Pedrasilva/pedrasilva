import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type Collaborator,
  type Snapshot,
  computeSnapshot,
  fmtEUR,
} from "@/lib/salary";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/valor-bo")({
  component: ValorBOPage,
});

type BoSettings = {
  id: string;
  custos_operacionais_anual: number;
  dias_uteis: number;
  horas_dia: number;
  margem_lucro_pct: number;
  notas: string | null;
};

export function computeValorBO(args: {
  custosOperacionais: number; // D3
  custoBackoffice: number; // D4 (soma VBG BO)
  custoProjecto: number; // D5 (soma VBG Projecto)
  numColaboradoresProjecto: number; // D11
  diasUteis: number; // D13
  horasDia: number;
}) {
  const totalAnual = args.custosOperacionais + args.custoBackoffice; // D14 = D3+D4
  const porColabAno =
    args.numColaboradoresProjecto > 0 ? totalAnual / args.numColaboradoresProjecto : 0;
  const porColabDia = args.diasUteis > 0 ? porColabAno / args.diasUteis : 0;
  const valorHora = args.horasDia > 0 ? Math.ceil(porColabDia) / args.horasDia : 0;
  return { totalAnual, porColabAno, porColabDia, valorHora };
}

function ValorBOPage() {
  const qc = useQueryClient();

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

  const { data: settings } = useQuery({
    queryKey: ["bo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bo_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as BoSettings | null;
    },
  });

  const [draft, setDraft] = useState<BoSettings | null>(null);
  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: async (s: BoSettings) => {
      const { error } = await supabase
        .from("bo_settings")
        .update({
          custos_operacionais_anual: Number(s.custos_operacionais_anual),
          dias_uteis: Number(s.dias_uteis),
          horas_dia: Number(s.horas_dia),
          margem_lucro_pct: Number(s.margem_lucro_pct),
          notas: s.notas,
        })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parâmetros guardados");
      qc.invalidateQueries({ queryKey: ["bo-settings"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  // Pega na ficha de referência (efectiva ou, se não houver, proposta) por colaborador
  const refByCollab = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const c of collaborators) {
      const sns = snapshots.filter((s) => s.collaborator_id === c.id);
      const ref = sns.find((s) => s.is_effective) ?? sns[0];
      if (ref) map.set(c.id, ref);
    }
    return map;
  }, [collaborators, snapshots]);

  const backoffice = collaborators.filter((c) => c.departamento === "Backoffice");
  const projecto = collaborators.filter((c) => c.departamento === "Projecto");

  const custoBackoffice = backoffice.reduce((acc, c) => {
    const s = refByCollab.get(c.id);
    return acc + (s ? computeSnapshot(s).custoVBG : 0);
  }, 0);

  const custoProjecto = projecto.reduce((acc, c) => {
    const s = refByCollab.get(c.id);
    return acc + (s ? computeSnapshot(s).custoVBG : 0);
  }, 0);

  const result = computeValorBO({
    custosOperacionais: Number(draft?.custos_operacionais_anual ?? 0),
    custoBackoffice,
    custoProjecto,
    numColaboradoresProjecto: projecto.length,
    diasUteis: Number(draft?.dias_uteis ?? 220),
    horasDia: Number(draft?.horas_dia ?? 8),
  });

  if (!draft) {
    return <div className="text-muted-foreground">A carregar parâmetros…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Valor BO / hora</h1>
        <p className="text-sm text-muted-foreground">
          Cálculo do valor de referência de venda à hora, distribuindo o custo da Equipa Backoffice e
          custos operacionais pelos colaboradores da Equipa Projecto.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parâmetros</CardTitle>
          <CardDescription>Campos amarelos: input manual.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Custos operacionais anuais (D3)</Label>
            <Input
              type="number"
              step="0.01"
              className="input-yellow tabular-nums"
              value={draft.custos_operacionais_anual}
              onChange={(e) =>
                setDraft({ ...draft, custos_operacionais_anual: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Dias úteis (D13)</Label>
            <Input
              type="number"
              className="input-yellow tabular-nums"
              value={draft.dias_uteis}
              onChange={(e) => setDraft({ ...draft, dias_uteis: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Horas / dia</Label>
            <Input
              type="number"
              step="0.5"
              className="input-yellow tabular-nums"
              value={draft.horas_dia}
              onChange={(e) => setDraft({ ...draft, horas_dia: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>Margem de lucro global (%)</Label>
            <Input
              type="number"
              step="0.5"
              className="input-yellow tabular-nums"
              value={(Number(draft.margem_lucro_pct) * 100).toFixed(2)}
              onChange={(e) =>
                setDraft({ ...draft, margem_lucro_pct: Number(e.target.value) / 100 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Aplicada por defeito a todos os colaboradores de Projecto. Pode ser sobreposta na ficha individual.
            </p>
          </div>
          <div className="sm:col-span-3">
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
              {save.isPending ? "A guardar…" : "Guardar parâmetros"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cálculo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Cél.</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <Row code="D3" label="Custos operacionais anuais (manual)" value={fmtEUR(Number(draft.custos_operacionais_anual))} />
              <Row code="D4" label={`Custo total Equipa Backoffice — VBG (${backoffice.length} colab.)`} value={fmtEUR(custoBackoffice)} />
              <Row code="D5" label={`Custo total Equipa Projecto — VBG (${projecto.length} colab.)`} value={fmtEUR(custoProjecto)} />
              <Row code="D11" label="Nº colaboradores Equipa Projecto" value={String(projecto.length)} />
              <Row code="D13" label="Dias úteis" value={String(draft.dias_uteis)} />
              <Row code="D14" label="Total a distribuir (D3 + D4)" value={fmtEUR(result.totalAnual)} bold />
              <Row code="D15" label="Por colaborador / ano" value={fmtEUR(result.porColabAno)} />
              <Row code="D16" label="Por colaborador / dia" value={fmtEUR(result.porColabDia)} />
              <Row
                code="D18"
                label="Valor BO / hora (referência de venda)"
                value={fmtEUR(result.valorHora)}
                highlight
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  code,
  label,
  value,
  bold,
  highlight,
}: {
  code: string;
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <TableRow className={highlight ? "bg-primary/5" : ""}>
      <TableCell className="font-mono text-xs text-muted-foreground">{code}</TableCell>
      <TableCell className={bold || highlight ? "font-medium" : ""}>{label}</TableCell>
      <TableCell
        className={
          "text-right tabular-nums " +
          (highlight ? "text-lg font-semibold text-primary" : bold ? "font-semibold" : "")
        }
      >
        {value}
      </TableCell>
    </TableRow>
  );
}
