import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  computeWorkdays,
  weekdayName,
  type Holiday,
} from "@/lib/workdays";
import { fmtDate } from "@/lib/salary";

export const Route = createFileRoute("/_app/dias-uteis")({
  component: DiasUteisPage,
});

function DiasUteisPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .order("data", { ascending: true });
      if (error) throw error;
      return data as Holiday[];
    },
  });

  const { data: bo } = useQuery({
    queryKey: ["bo-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bo_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const breakdown = useMemo(() => computeWorkdays(year, holidays), [year, holidays]);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1, currentYear - 1]);
    holidays.forEach((h) => set.add(parseInt(h.data.slice(0, 4), 10)));
    return Array.from(set).sort((a, b) => a - b);
  }, [holidays, currentYear]);

  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!newDate || !newName.trim()) throw new Error("Preenche data e nome");
      const { error } = await supabase.from("holidays").insert({
        data: newDate,
        nome: newName.trim(),
        tipo: "nacional",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feriado adicionado");
      setNewDate("");
      setNewName("");
      qc.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feriado removido");
      qc.invalidateQueries({ queryKey: ["holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyToAll = useMutation({
    mutationFn: async () => {
      // Buscar todos os colaboradores e os seus dias de férias para calcular individualmente
      const { data: collabs, error: cErr } = await supabase
        .from("collaborators")
        .select("id, dias_ferias_anuais");
      if (cErr) throw cErr;
      // Para cada colaborador, atualizar TODAS as fichas do ano selecionado com dias úteis líquidos
      let updated = 0;
      for (const c of collabs ?? []) {
        const liquido = breakdown.diasUteisLiquidos(c.dias_ferias_anuais ?? 22);
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const { error: uErr, count } = await supabase
          .from("salary_snapshots")
          .update({ dias_uteis: liquido }, { count: "exact" })
          .eq("collaborator_id", c.id)
          .gte("reference_date", yearStart)
          .lte("reference_date", yearEnd);
        if (uErr) throw uErr;
        updated += count ?? 0;
      }
      // Atualizar bo_settings (singleton) com o valor LÍQUIDO (já com 22 dias de férias descontados)
      // — usado em /resumo, /valor-bo e Pricing como denominador anual de horas produtivas.
      if (bo?.id) {
        const { error: bErr } = await supabase
          .from("bo_settings")
          .update({ dias_uteis: breakdown.diasUteisLiquidos(22) })
          .eq("id", bo.id);
        if (bErr) throw bErr;
      }
      return updated;
    },
    onSuccess: (n) => {
      toast.success(`Aplicado a ${n} ficha(s) e às definições BO`);
      qc.invalidateQueries({ queryKey: ["all-snapshots"] });
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      qc.invalidateQueries({ queryKey: ["bo-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarDays className="h-5 w-5" /> Dias úteis
          </h1>
          <p className="text-sm text-muted-foreground">
            Cálculo de dias úteis por ano com base em feriados nacionais que coincidem com dias de
            trabalho. Os dias de férias do colaborador são descontados a seguir.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearsAvailable.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <RefreshCw className="h-4 w-4" /> Aplicar a todas as fichas
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Aplicar dias úteis a todas as fichas?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Vai atualizar o campo <strong>dias úteis</strong> de todas as fichas com data
                    de referência em {year}, descontando os dias de férias anuais de cada
                    colaborador. As definições BO ficam com{" "}
                    <strong>{breakdown.diasUteisLiquidos(22)} dias</strong> (já com 22 dias de
                    férias descontados — usado em /resumo, /valor-bo e Pricing).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => applyToAll.mutate()}>
                    Aplicar agora
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Dias do ano" value={breakdown.diasAno} />
        <Kpi label="Sábados + Domingos" value={`− ${breakdown.fimDeSemana}`} />
        <Kpi label="Feriados em dia útil" value={`− ${breakdown.feriadosUteis}`} />
        <Kpi label="Dias úteis (base)" value={breakdown.diasUteisBase} highlight />
        <Kpi
          label="Após 22 dias férias"
          value={breakdown.diasUteisLiquidos(22)}
        />
      </div>

      {/* Feriados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feriados nacionais {year}</CardTitle>
          <CardDescription>
            {breakdown.feriadosTotais} feriado(s) — {breakdown.feriadosUteis} em dia útil,{" "}
            {breakdown.feriadosFimDeSemana} ao fim-de-semana (sem impacto).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Dia da semana</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Conta como dia útil?</TableHead>
                {isAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.feriadosDetalhe.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground">
                    Sem feriados registados para {year}.
                  </TableCell>
                </TableRow>
              )}
              {breakdown.feriadosDetalhe.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="tabular-nums">{fmtDate(h.data)}</TableCell>
                  <TableCell>{weekdayName(h.weekday)}</TableCell>
                  <TableCell className="font-medium">{h.nome}</TableCell>
                  <TableCell className="text-right">
                    {h.emDiaUtil ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                        Sim — desconta
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Fim-de-semana
                      </span>
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteHoliday.mutate(h.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {isAdmin && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-[180px_1fr_auto]">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input
                  type="date"
                  className="input-yellow"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nome do feriado</Label>
                <Input
                  className="input-yellow"
                  placeholder="ex: Tolerância de ponto"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => addHoliday.mutate()} disabled={addHoliday.isPending}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fórmula */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como é calculado</CardTitle>
          <CardDescription>
            Mesma lógica de{" "}
            <a
              href="https://www.dias-uteis.pt"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              dias-uteis.pt
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Formula label="Dias do ano" value={breakdown.diasAno} />
          <Formula label="− Sábados e Domingos" value={`−${breakdown.fimDeSemana}`} />
          <Formula
            label="− Feriados em dia útil"
            value={`−${breakdown.feriadosUteis}`}
          />
          <Formula
            label="= Dias úteis (base, sem férias)"
            value={breakdown.diasUteisBase}
            highlight
          />
          <Formula
            label="− Dias de férias do colaborador (22)"
            value={`−22`}
          />
          <Formula
            label="= Dias efectivamente trabalhados"
            value={breakdown.diasUteisLiquidos(22)}
            highlight
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-3 " + (highlight ? "border-primary/40 bg-primary/5" : "")
      }
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Formula({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between border-b pb-1.5 " +
        (highlight ? "font-semibold text-primary" : "text-muted-foreground")
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
