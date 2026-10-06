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
import { YearLeaveCalendar } from "@/components/hr/year-leave-calendar";
import { useTranslation } from "react-i18next";
import {
  useLeaveApproval,
  RequestChangeDialog,
  DecidePendingButtons,
  DirectChangeDialog,
  PendingChangeBadge,
  LeaveHistoryButton,
  EditIcon,
} from "@/components/hr/leave-change";

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
  | "autorizada_nao_paga"
  | "consulta_medica";

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
  { value: "consulta_medica", label: "Consulta médica — não paga", paga: false, descontaFerias: false },
];

const absenceLabel = (t: AbsenceType) => ABSENCE_TYPES.find((x) => x.value === t)?.label ?? t;

type VacationRequest = {
  id: string;
  collaborator_id: string;
  data_inicio: string;
  data_fim: string;
  dias_uteis: number;
  estado: "pendente" | "aprovada" | "rejeitada" | "cancelada";
  tipo: AbsenceType;
  notas: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
  attachment_path?: string | null;
};

async function openLeaveAttachment(path: string) {
  const { data, error } = await supabase.storage.from("leave-attachments").createSignedUrl(path, 300);
  if (error || !data) return toast.error(error?.message ?? "Erro");
  window.open(data.signedUrl, "_blank", "noopener");
}

function FeriasPage() {
  const { user, isAdmin: isAdminRole } = useAuth();
  const qc = useQueryClient();
  const { t } = useTranslation("hr");
  const { canApprove, pendingByRequest } = useLeaveApproval(user?.id ?? null);
  // Leave approvers (hr.leave.approve · All) get the team views; admins keep everything else.
  const isAdmin = isAdminRole || canApprove;
  const [changeTarget, setChangeTarget] = useState<{ row: VacationRequest; mode: "request" | "direct" } | null>(null);
  const typeOptions = ABSENCE_TYPES.map((x) => ({ value: x.value, label: x.label }));
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
  const [attachFile, setAttachFile] = useState<File | null>(null);
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
      const collab_id = isAdminRole && newReq.collaborator_id ? newReq.collaborator_id : myCollab?.id;
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
      let attachment_path: string | null = null;
      if (newReq.tipo === "consulta_medica" && attachFile) {
        const ext = attachFile.name.split(".").pop()?.toLowerCase() || "pdf";
        attachment_path = `${collab_id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("leave-attachments").upload(attachment_path, attachFile);
        if (up.error) throw up.error;
      }
      const { error } = await supabase.from("vacation_requests").insert({
        attachment_path,
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
      setAttachFile(null);
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
            <Button size="sm" disabled={!isAdminRole && !myCollab}>
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
              {isAdminRole && (
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
                {newReq.tipo === "consulta_medica" && (
                  <p className="text-[11px] text-muted-foreground">{t("leaveChange.medicalHint")}</p>
                )}
              </div>
              {newReq.tipo === "consulta_medica" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">{t("leaveChange.attachment")}</Label>
                  <Input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}
              <div className="sm:col-span-2 space-y-2 rounded-md bg-muted px-3 py-2 text-sm">
                <div>
                  {newReq.periodo === "horas" ? (
                    <>
                      Horas: <span className="font-semibold">{newReq.horas || 0}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (= {dias} dia(s) úteis)
                      </span>
                    </>
                  ) : (
                    <>
                      Dias úteis: <span className="font-semibold">{dias}</span>
                      {feriadosNoPeriodo.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({feriadosNoPeriodo.length} feriado(s) excluído(s))
                        </span>
                      )}
                    </>
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
            <YearLeaveCalendar
              year={calendarYear}
              onYearChange={setCalendarYear}
              requests={requests}
              collaborators={collaborators}
              holidayDates={holidayDates}
              userId={user?.id ?? null}
              myCollabId={myCollab?.id ?? null}
              typeLabel={(tipo) => absenceLabel(tipo as AbsenceType)}
              onOpenPerson={(id) => { setSelectedCollabId(id); setAdminScope("colaborador"); }}
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
                      {pendingByRequest.get(r.id) && (
                        <PendingChangeBadge
                          change={pendingByRequest.get(r.id)!}
                          userId={user?.id ?? null}
                          typeLabel={(x) => absenceLabel(x as AbsenceType)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {r.notas ?? ""}
                      {r.attachment_path && (r.collaborator_id === myCollab?.id || canApprove || isAdminRole) && (
                        <button
                          type="button"
                          className="ml-1 underline"
                          onClick={() => openLeaveAttachment(r.attachment_path!)}
                        >
                          {t("leaveChange.viewAttachment")}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {isAdmin && r.estado === "pendente" && r.collaborator_id !== myCollab?.id && (
                          <DecidePendingButtons requestId={r.id} />
                        )}
                        {r.estado === "aprovada" &&
                          r.collaborator_id === myCollab?.id &&
                          !pendingByRequest.has(r.id) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setChangeTarget({ row: r, mode: "request" })}
                            >
                              {t("leaveChange.requestBtn")}
                            </Button>
                          )}
                        {canApprove &&
                          (r.estado === "aprovada" || r.estado === "pendente") &&
                          !(r.estado === "aprovada" && r.collaborator_id === myCollab?.id) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title={t("leaveChange.directTitle")}
                              onClick={() => setChangeTarget({ row: r, mode: "direct" })}
                            >
                              <EditIcon />
                            </Button>
                          )}
                        <LeaveHistoryButton requestId={r.id} />
                        {(r.estado === "pendente" ||
                          (isAdminRole && r.estado === "rejeitada")) && (
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
      {changeTarget?.mode === "request" && (
        <RequestChangeDialog
          open
          onOpenChange={(o) => !o && setChangeTarget(null)}
          request={changeTarget.row}
          types={typeOptions}
          holidays={holidayDates}
        />
      )}
      {changeTarget?.mode === "direct" && (
        <DirectChangeDialog
          open
          onOpenChange={(o) => !o && setChangeTarget(null)}
          request={changeTarget.row}
          types={typeOptions}
          holidays={holidayDates}
        />
      )}
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
    cancelada: "bg-muted text-muted-foreground",
  }[estado];
  const labels = { pendente: "Pendente", aprovada: "Aprovada", rejeitada: "Rejeitada", cancelada: "Cancelada" }[estado];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{labels}</span>;
}
