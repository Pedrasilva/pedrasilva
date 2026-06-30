import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarDays, Plus, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { countWeekdays } from "@/lib/dates";
import type { Collaborator } from "@/lib/salary";
import type { Holiday } from "@/lib/workdays";

import { PermissionGate } from "@/components/PermissionGate";

type FeriasSearch = { scope?: "meus" | "colaborador" | "calendario" };

export const Route = createFileRoute("/_app/hr/ferias")({
  validateSearch: (search: Record<string, unknown>): FeriasSearch => {
    const s = search.scope;
    if (s === "colaborador" || s === "calendario" || s === "meus") return { scope: s };
    return {};
  },
  component: () => (
    <PermissionGate permission="hr.ferias.own">
      <FeriasPage />
    </PermissionGate>
  ),
});

type AbsenceType =
  | "ferias"
  | "casamento"
  | "falecimento_familiar"
  | "assistencia_filho"
  | "nascimento_filho"
  | "trabalhador_estudante"
  | "doacao_sangue"
  | "autorizada_paga"
  | "autorizada_nao_paga";

const ABSENCE_TYPES: { value: AbsenceType; label: string; paga: boolean; descontaFerias: boolean }[] = [
  { value: "ferias", label: "Férias", paga: true, descontaFerias: true },
  { value: "casamento", label: "Casamento (15 dias, paga)", paga: true, descontaFerias: false },
  { value: "falecimento_familiar", label: "Falecimento de familiar (paga)", paga: true, descontaFerias: false },
  { value: "assistencia_filho", label: "Assistência a filho (paga até limite legal)", paga: true, descontaFerias: false },
  { value: "nascimento_filho", label: "Nascimento de filho / licença parental (paga)", paga: true, descontaFerias: false },
  { value: "trabalhador_estudante", label: "Trabalhador-estudante (paga até limite)", paga: true, descontaFerias: false },
  { value: "doacao_sangue", label: "Dádiva de sangue (paga)", paga: true, descontaFerias: false },
  { value: "autorizada_paga", label: "Outra ausência autorizada — paga", paga: true, descontaFerias: false },
  { value: "autorizada_nao_paga", label: "Outra ausência autorizada — não paga", paga: false, descontaFerias: false },
];

const absenceLabel = (t: AbsenceType) => ABSENCE_TYPES.find((x) => x.value === t)?.label ?? t;

type VacationRequest = {
  id: string;
  collaborator_id: string;
  data_inicio: string;
  data_fim: string;
  dias_uteis: number;
  estado: "pendente" | "aprovada" | "rejeitada";
  tipo: AbsenceType;
  notas: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
};

function FeriasPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();

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

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["vacation_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data as VacationRequest[];
    },
  });

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

  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.data)), [holidays]);
  const holidayDateObjects = useMemo(
    () => holidays.map((h) => new Date(h.data + "T00:00:00")),
    [holidays],
  );

  // Find own collaborator (by email)
  const myCollab = useMemo(
    () => collaborators.find((c) => c.email && user?.email && c.email.toLowerCase() === user.email.toLowerCase()) ?? null,
    [collaborators, user],
  );

  // Saldos do colaborador actual (ou colaborador seleccionado pelo admin)
  const [selectedCollabId, setSelectedCollabId] = useState<string>("");
  // Admins têm 3 modos: ver só os seus, ver por colaborador individual, ou calendário anual de toda a equipa.
  const initialScope = Route.useSearch().scope ?? "meus";
  const [adminScope, setAdminScope] = useState<"meus" | "colaborador" | "calendario">(initialScope);
  const [calendarYear, setCalendarYear] = useState<number>(currentYear);
  const focusCollab =
    isAdmin && adminScope === "colaborador"
      ? collaborators.find((c) => c.id === selectedCollabId) ?? myCollab
      : myCollab;

  const usedThisYear = useMemo(() => {
    if (!focusCollab) return 0;
    return requests
      .filter(
        (r) =>
          r.collaborator_id === focusCollab.id &&
          r.estado === "aprovada" &&
          r.tipo === "ferias" &&
          new Date(r.data_inicio).getFullYear() === currentYear,
      )
      .reduce((sum, r) => sum + (r.dias_uteis || 0), 0);
  }, [requests, focusCollab, currentYear]);

  const pendingThisYear = useMemo(() => {
    if (!focusCollab) return 0;
    return requests
      .filter(
        (r) =>
          r.collaborator_id === focusCollab.id &&
          r.estado === "pendente" &&
          r.tipo === "ferias" &&
          new Date(r.data_inicio).getFullYear() === currentYear,
      )
      .reduce((sum, r) => sum + (r.dias_uteis || 0), 0);
  }, [requests, focusCollab, currentYear]);

  const totalDisponivel =
    (focusCollab?.dias_ferias_anuais ?? 0) +
    (focusCollab?.saldo_ferias_anterior ?? 0) +
    (focusCollab?.dias_ferias_extra ?? 0);
  const saldoAtual = totalDisponivel - usedThisYear - pendingThisYear;

  // Novo pedido
  const [newOpen, setNewOpen] = useState(false);
  const [newReq, setNewReq] = useState<{
    collaborator_id: string;
    tipo: AbsenceType;
    periodo: "dia_inteiro" | "manha" | "tarde" | "horas";
    data_inicio: string;
    data_fim: string;
    horas: string;
    notas: string;
  }>({
    collaborator_id: "",
    tipo: "ferias",
    periodo: "dia_inteiro",
    data_inicio: "",
    data_fim: "",
    horas: "",
    notas: "",
  });

  // Dias úteis efectivos consoante a duração escolhida.
  // - dia_inteiro: conta dias úteis no intervalo (excluindo feriados)
  // - manha / tarde: 0.5 num único dia
  // - horas: horas / 8 (assume jornada base de 8h; o desconto efectivo
  //   no saldo de férias só se aplica quando tipo === "ferias")
  const dias = useMemo(() => {
    if (newReq.periodo === "dia_inteiro") {
      return countWeekdays(newReq.data_inicio, newReq.data_fim, holidayDates);
    }
    if (!newReq.data_inicio) return 0;
    if (newReq.periodo === "manha" || newReq.periodo === "tarde") return 0.5;
    const h = parseFloat(newReq.horas);
    if (!Number.isFinite(h) || h <= 0) return 0;
    return Math.round((h / 8) * 100) / 100;
  }, [newReq.periodo, newReq.data_inicio, newReq.data_fim, newReq.horas, holidayDates]);

  // Lista de feriados que caem dentro do período seleccionado (em dias úteis)
  const feriadosNoPeriodo = useMemo(() => {
    if (!newReq.data_inicio || !newReq.data_fim) return [];
    return holidays.filter((h) => {
      if (h.data < newReq.data_inicio || h.data > newReq.data_fim) return false;
      const wd = new Date(h.data + "T00:00:00").getDay();
      return wd !== 0 && wd !== 6;
    });
  }, [holidays, newReq.data_inicio, newReq.data_fim]);

  const createReq = useMutation({
    mutationFn: async () => {
      const collab_id = isAdmin && newReq.collaborator_id ? newReq.collaborator_id : myCollab?.id;
      if (!collab_id) throw new Error("Sem colaborador associado à sua conta");
      if (!newReq.data_inicio) throw new Error("Indique a data");
      // Para período parcial (meio-dia ou horas) usamos um único dia.
      const isFullDay = newReq.periodo === "dia_inteiro";
      const dataFim = isFullDay ? (newReq.data_fim || newReq.data_inicio) : newReq.data_inicio;
      if (isFullDay && !newReq.data_fim) throw new Error("Indique as datas");
      if (dias <= 0) throw new Error("Período inválido");
      const horasNum =
        newReq.periodo === "horas"
          ? parseFloat(newReq.horas)
          : newReq.periodo === "manha" || newReq.periodo === "tarde"
            ? 4
            : null;
      const { error } = await supabase.from("vacation_requests").insert({
        collaborator_id: collab_id,
        tipo: newReq.tipo,
        data_inicio: newReq.data_inicio,
        data_fim: dataFim,
        dias_uteis: dias,
        periodo: newReq.periodo,
        horas: horasNum,
        notas: newReq.notas || null,
        estado: "pendente",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido criado");
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
      setNewOpen(false);
      setNewReq({
        collaborator_id: "",
        tipo: "ferias",
        periodo: "dia_inteiro",
        data_inicio: "",
        data_fim: "",
        horas: "",
        notas: "",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: "aprovada" | "rejeitada" }) => {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          estado,
          aprovado_por: user?.id ?? null,
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido actualizado");
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteReq = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vacation_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido eliminado");
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Lista a mostrar:
  // - User normal: vê só os seus (RLS já restringe, mas filtramos no cliente como defesa em profundidade).
  // - Admin "meus": só os próprios pedidos do admin.
  // - Admin "colaborador": pedidos do colaborador seleccionado.
  // - Admin "calendario": todos os pedidos (consumidos pelo calendário anual).
  const visibleRequests = useMemo(() => {
    if (!isAdmin) {
      return myCollab ? requests.filter((r) => r.collaborator_id === myCollab.id) : [];
    }
    if (adminScope === "meus") {
      return myCollab ? requests.filter((r) => r.collaborator_id === myCollab.id) : [];
    }
    if (adminScope === "colaborador") {
      if (!selectedCollabId) return [];
      return requests.filter((r) => r.collaborator_id === selectedCollabId);
    }
    // calendario
    return requests;
  }, [requests, isAdmin, adminScope, myCollab, selectedCollabId]);

  const collabName = (id: string) => collaborators.find((c) => c.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Mapa de Férias e Ausências
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Aprove ou rejeite pedidos de férias e outras ausências da equipa."
              : "Consulte o saldo de férias e marque férias ou outras ausências autorizadas."}
          </p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!isAdmin && !myCollab}>
              <Plus className="h-4 w-4" /> Novo pedido
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Marcação de ausência</DialogTitle>
              <DialogDescription>
                Indique o tipo de ausência e o período. O número de dias úteis (seg–sex) é
                calculado automaticamente. Apenas pedidos do tipo <em>Férias</em> descontam do
                saldo anual.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {isAdmin && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Colaborador</Label>
                  <Select
                    value={newReq.collaborator_id}
                    onValueChange={(v) => setNewReq((f) => ({ ...f, collaborator_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar colaborador…" />
                    </SelectTrigger>
                    <SelectContent>
                      {collaborators.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} · {c.departamento}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Tipo de ausência</Label>
                <Select
                  value={newReq.tipo}
                  onValueChange={(v) => setNewReq((f) => ({ ...f, tipo: v as AbsenceType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ABSENCE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Duração</Label>
                <Select
                  value={newReq.periodo}
                  onValueChange={(v) =>
                    setNewReq((f) => ({
                      ...f,
                      periodo: v as "dia_inteiro" | "manha" | "tarde" | "horas",
                      // Quando passa a parcial limpa data_fim para forçar dia único
                      data_fim: v === "dia_inteiro" ? f.data_fim : "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia_inteiro">Dia(s) inteiro(s)</SelectItem>
                    <SelectItem value="manha">Meio-dia — manhã (4h)</SelectItem>
                    <SelectItem value="tarde">Meio-dia — tarde (4h)</SelectItem>
                    <SelectItem value="horas">Algumas horas…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {newReq.periodo === "dia_inteiro" ? "Período" : "Dia"}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newReq.data_inicio && "text-muted-foreground",
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {newReq.periodo !== "dia_inteiro" ? (
                        newReq.data_inicio ? (
                          format(new Date(newReq.data_inicio + "T00:00:00"), "d MMM yyyy", { locale: pt })
                        ) : (
                          <span>Seleccionar dia…</span>
                        )
                      ) : newReq.data_inicio && newReq.data_fim ? (
                        <>
                          {format(new Date(newReq.data_inicio + "T00:00:00"), "d MMM yyyy", { locale: pt })}
                          {" → "}
                          {format(new Date(newReq.data_fim + "T00:00:00"), "d MMM yyyy", { locale: pt })}
                        </>
                      ) : newReq.data_inicio ? (
                        <>
                          {format(new Date(newReq.data_inicio + "T00:00:00"), "d MMM yyyy", { locale: pt })}
                          {" → escolher fim…"}
                        </>
                      ) : (
                        <span>Seleccionar datas…</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    {newReq.periodo === "dia_inteiro" ? (
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        locale={pt}
                        weekStartsOn={1}
                        defaultMonth={newReq.data_inicio ? new Date(newReq.data_inicio + "T00:00:00") : new Date()}
                        modifiers={{ holiday: holidayDateObjects }}
                        modifiersClassNames={{
                          holiday:
                            "relative text-destructive font-semibold after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-destructive",
                        }}
                        selected={
                          {
                            from: newReq.data_inicio ? new Date(newReq.data_inicio + "T00:00:00") : undefined,
                            to: newReq.data_fim ? new Date(newReq.data_fim + "T00:00:00") : undefined,
                          } as DateRange
                        }
                        onSelect={(range: DateRange | undefined) => {
                          setNewReq((f) => ({
                            ...f,
                            data_inicio: range?.from ? format(range.from, "yyyy-MM-dd") : "",
                            data_fim: range?.to ? format(range.to, "yyyy-MM-dd") : "",
                          }));
                        }}
                      />
                    ) : (
                      <Calendar
                        mode="single"
                        numberOfMonths={1}
                        locale={pt}
                        weekStartsOn={1}
                        defaultMonth={newReq.data_inicio ? new Date(newReq.data_inicio + "T00:00:00") : new Date()}
                        modifiers={{ holiday: holidayDateObjects }}
                        modifiersClassNames={{
                          holiday:
                            "relative text-destructive font-semibold after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-destructive",
                        }}
                        selected={newReq.data_inicio ? new Date(newReq.data_inicio + "T00:00:00") : undefined}
                        onSelect={(d: Date | undefined) => {
                          setNewReq((f) => ({
                            ...f,
                            data_inicio: d ? format(d, "yyyy-MM-dd") : "",
                            data_fim: d ? format(d, "yyyy-MM-dd") : "",
                          }));
                        }}
                      />
                    )}
                    <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                      <span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive align-middle" />
                      Feriados (não contam como dias úteis)
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {newReq.periodo === "horas" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Horas</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={8}
                    step={0.5}
                    placeholder="ex.: 2"
                    value={newReq.horas}
                    onChange={(e) => setNewReq((f) => ({ ...f, horas: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Indique o número de horas autorizadas (até 8h por dia).
                  </p>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Notas (opcional)</Label>
                <Textarea
                  rows={2}
                  value={newReq.notas}
                  onChange={(e) => setNewReq((f) => ({ ...f, notas: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 space-y-2 rounded-md bg-muted px-3 py-2 text-sm">
                <div>
                  Dias úteis: <span className="font-semibold">{dias}</span>
                  {feriadosNoPeriodo.length > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({feriadosNoPeriodo.length} feriado(s) excluído(s))
                    </span>
                  )}
                </div>
                {feriadosNoPeriodo.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {feriadosNoPeriodo.map((h) => (
                      <li key={h.id} className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                        {format(new Date(h.data + "T00:00:00"), "EEE, d MMM", { locale: pt })}
                        {" — "}
                        {h.nome}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => createReq.mutate()} disabled={createReq.isPending}>
                Submeter pedido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!myCollab && !isAdmin && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            A sua conta Google ({user?.email}) ainda não está associada a nenhum colaborador.
            Peça a um administrador para definir o seu email no perfil de colaborador.
          </CardContent>
        </Card>
      )}

      {/* Saldo (escondido no modo Calendário) */}
      {focusCollab && !(isAdmin && adminScope === "calendario") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Saldo de férias — {focusCollab.nome} · {currentYear}
            </CardTitle>
            <CardDescription>
              Direito anual + saldo do ano anterior, descontando aprovadas e pendentes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin && adminScope === "colaborador" && (
              <div className="mb-4 max-w-sm">
                <Label className="text-xs text-muted-foreground">Ver saldo de…</Label>
                <Select value={selectedCollabId} onValueChange={setSelectedCollabId}>
                  <SelectTrigger>
                    <SelectValue placeholder={myCollab?.nome ?? "Seleccionar…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {collaborators.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Anuais" value={focusCollab.dias_ferias_anuais} />
              <Stat label="Saldo anterior" value={focusCollab.saldo_ferias_anterior} />
              <Stat label="Disponível total" value={totalDisponivel} highlight />
              <Stat label="Usados / pendentes" value={`${usedThisYear} / ${pendingThisYear}`} />
              <Stat label="Saldo actual" value={saldoAtual} highlight />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pedidos / Calendário */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {isAdmin
              ? adminScope === "meus"
                ? "Os meus pedidos"
                : adminScope === "colaborador"
                  ? selectedCollabId
                    ? `Pedidos de ${collabName(selectedCollabId)}`
                    : "Seleccione um colaborador"
                  : `Calendário anual da equipa · ${calendarYear}`
              : "Os meus pedidos"}
          </CardTitle>
          {isAdmin && (
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setAdminScope("meus")}
                className={cn(
                  "rounded-sm px-2.5 py-1 transition-colors",
                  adminScope === "meus"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Só os meus
              </button>
              <button
                type="button"
                onClick={() => setAdminScope("colaborador")}
                className={cn(
                  "rounded-sm px-2.5 py-1 transition-colors",
                  adminScope === "colaborador"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Por colaborador
              </button>
              <button
                type="button"
                onClick={() => setAdminScope("calendario")}
                className={cn(
                  "rounded-sm px-2.5 py-1 transition-colors",
                  adminScope === "calendario"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Calendário anual
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isAdmin && adminScope === "colaborador" && !selectedCollabId && (
            <div className="mb-4 max-w-sm">
              <Label className="text-xs text-muted-foreground">Colaborador</Label>
              <Select value={selectedCollabId} onValueChange={setSelectedCollabId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar colaborador…" />
                </SelectTrigger>
                <SelectContent>
                  {collaborators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isAdmin && adminScope === "calendario" ? (
            <YearCalendar
              year={calendarYear}
              onYearChange={setCalendarYear}
              requests={requests}
              collaborators={collaborators}
              holidayDates={holidayDates}
            />
          ) : isLoading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : visibleRequests.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem pedidos.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRequests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{absenceLabel(r.tipo)}</TableCell>
                    <TableCell>{r.data_inicio}</TableCell>
                    <TableCell>{r.data_fim}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.dias_uteis}</TableCell>
                    <TableCell>
                      <EstadoBadge estado={r.estado} />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {r.notas ?? ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {isAdmin && r.estado === "pendente" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEstado.mutate({ id: r.id, estado: "aprovada" })}
                            >
                              <Check className="h-3 w-3" /> Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEstado.mutate({ id: r.id, estado: "rejeitada" })}
                            >
                              <X className="h-3 w-3" /> Rejeitar
                            </Button>
                          </>
                        )}
                        {(isAdmin || r.estado === "pendente") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteReq.mutate(r.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: VacationRequest["estado"] }) {
  const styles = {
    pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    aprovada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    rejeitada: "bg-red-500/15 text-red-700 dark:text-red-400",
  }[estado];
  const labels = { pendente: "Pendente", aprovada: "Aprovada", rejeitada: "Rejeitada" }[estado];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{labels}</span>;
}

function YearCalendar({
  year,
  onYearChange,
  requests,
  collaborators,
  holidayDates,
}: {
  year: number;
  onYearChange: (y: number) => void;
  requests: VacationRequest[];
  collaborators: Collaborator[];
  holidayDates: Set<string>;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, { collaborator_id: string; estado: VacationRequest["estado"] }[]>();
    for (const r of requests) {
      if (r.tipo !== "ferias") continue;
      if (r.estado === "rejeitada") continue;
      const start = new Date(r.data_inicio + "T00:00:00");
      const end = new Date(r.data_fim + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() !== year) continue;
        const key = format(d, "yyyy-MM-dd");
        const arr = map.get(key) ?? [];
        arr.push({ collaborator_id: r.collaborator_id, estado: r.estado });
        map.set(key, arr);
      }
    }
    return map;
  }, [requests, year]);

  const collabColor = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `hsl(${h} 70% 55%)`;
  };
  const collabName = (id: string) => collaborators.find((c) => c.id === id)?.nome ?? "—";

  const months = Array.from({ length: 12 }, (_, i) => i);
  const monthLabel = (m: number) => format(new Date(year, m, 1), "LLLL", { locale: pt });

  const presentCollabIds = useMemo(() => {
    const ids = new Set<string>();
    byDay.forEach((arr) => arr.forEach((e) => ids.add(e.collaborator_id)));
    return Array.from(ids);
  }, [byDay]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onYearChange(year - 1)}>
            ←
          </Button>
          <div className="min-w-[5rem] text-center text-sm font-medium tabular-nums">{year}</div>
          <Button variant="outline" size="sm" onClick={() => onYearChange(year + 1)}>
            →
          </Button>
        </div>
        {presentCollabIds.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {presentCollabIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: collabColor(id) }}
                />
                {collabName(id)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((m) => {
          const firstOfMonth = new Date(year, m, 1);
          const daysInMonth = new Date(year, m + 1, 0).getDate();
          const startWeekday = (firstOfMonth.getDay() + 6) % 7;
          const cells: (number | null)[] = [
            ...Array(startWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          return (
            <div key={m} className="rounded-md border p-2">
              <div className="mb-1 px-1 text-xs font-semibold capitalize">{monthLabel(m)}</div>
              <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground">
                {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
                  <div key={i} className="text-center">{d}</div>
                ))}
              </div>
              <div className="mt-0.5 grid grid-cols-7 gap-0.5">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={idx} className="aspect-square" />;
                  const dateStr = format(new Date(year, m, day), "yyyy-MM-dd");
                  const wd = new Date(year, m, day).getDay();
                  const isWeekend = wd === 0 || wd === 6;
                  const isHoliday = holidayDates.has(dateStr);
                  const entries = byDay.get(dateStr) ?? [];
                  const tooltip =
                    entries.length > 0
                      ? entries
                          .map(
                            (e) => `${collabName(e.collaborator_id)}${e.estado === "pendente" ? " (pendente)" : ""}`,
                          )
                          .join("\n")
                      : "";
                  return (
                    <div
                      key={idx}
                      title={tooltip}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-start rounded-sm px-0.5 pt-0.5 text-[10px] tabular-nums",
                        isWeekend && "text-muted-foreground/60",
                        isHoliday && "text-destructive font-semibold",
                        !isWeekend && !isHoliday && "bg-muted/30",
                      )}
                    >
                      <span>{day}</span>
                      {entries.length > 0 && (
                        <div className="mt-auto flex w-full flex-wrap justify-center gap-[1px] pb-0.5">
                          {entries.slice(0, 4).map((e, i) => (
                            <span
                              key={i}
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                e.estado === "pendente" && "ring-1 ring-offset-[1px] ring-offset-background ring-current",
                              )}
                              style={{ backgroundColor: collabColor(e.collaborator_id) }}
                            />
                          ))}
                          {entries.length > 4 && (
                            <span className="text-[8px] leading-none">+{entries.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-muted-foreground">
        Cada ponto representa um colaborador com férias nesse dia. Pontos com anel são pedidos pendentes.
      </div>
    </div>
  );
}
