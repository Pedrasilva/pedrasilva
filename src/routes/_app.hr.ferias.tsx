import uiI18n from "@/i18n/index";
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
import { useDateLocale } from "@/i18n/use-date-locale";
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
import { notifyBaixaMedicaSubmitted } from "@/lib/hr/baixa-medica-notify.functions";
import { countWeekdays } from "@/lib/dates";
import type { Collaborator } from "@/lib/salary";
import type { Holiday } from "@/lib/workdays";

import { PermissionGate } from "@/components/PermissionGate";
import { YearLeaveCalendar } from "@/components/hr/year-leave-calendar";
import { useApprovalInbox } from "@/lib/hr/use-approval-inbox";
import { useLeaveBalances } from "@/lib/hr/use-leave-balances";
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
  head: () => ({meta:[{title:"Mapa de férias | PSA Hub"},{name:"description",content:"Mapa de ausências, pedidos e saldos de férias da equipa."},{property:"og:title",content:"Mapa de férias | PSA Hub"},{property:"og:description",content:"Consulta dos pedidos de ausência e saldos de férias."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
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
  | "consulta_medica"
  | "baixa_medica";

const ABSENCE_TYPES: { value: AbsenceType; label: string; paga: boolean; descontaFerias: boolean }[] = [
  { value: "ferias", label: uiI18n.t("glossary:hr.vacation"), paga: true, descontaFerias: true },
  { value: "casamento", label: uiI18n.t("hr:batchFive.labels.marriageLeaveDaysPaid"), paga: true, descontaFerias: false },
  { value: "falecimento_familiar", label: uiI18n.t("hr:batchFive.labels.familyBereavementLeavePaid"), paga: true, descontaFerias: false },
  { value: "assistencia_filho", label: uiI18n.t("hr:batchFive.labels.childCareLeavePaidUpToThe"), paga: true, descontaFerias: false },
  { value: "nascimento_filho", label: uiI18n.t("hr:batchFive.labels.birthParentalLeavePaid"), paga: true, descontaFerias: false },
  { value: "trabalhador_estudante", label: uiI18n.t("hr:batchFive.labels.studentWorkerLeavePaidUpToThe"), paga: true, descontaFerias: false },
  { value: "doacao_sangue", label: uiI18n.t("hr:batchFive.labels.bloodDonationLeavePaid"), paga: true, descontaFerias: false },
  { value: "autorizada_paga", label: uiI18n.t("hr:batchFive.labels.otherAuthorizedAbsencePaid"), paga: true, descontaFerias: false },
  { value: "autorizada_nao_paga", label: uiI18n.t("hr:batchFive.labels.otherAuthorizedAbsenceUnpaid"), paga: false, descontaFerias: false },
  { value: "consulta_medica", label: uiI18n.t("hr:approvalInbox.types.consulta_medica"), paga: false, descontaFerias: false },
  { value: "baixa_medica", label: uiI18n.t("hr:availability.types.baixa_medica"), paga: false, descontaFerias: false },
];

const absenceLabel = (tipo: AbsenceType) => uiI18n.t(`hr:leave.types.${tipo}`);

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
  if (error || !data) return toast.error(error?.message ?? uiI18n.t("common:error"));
  window.open(data.signedUrl, "_blank", "noopener");
}

function FeriasPage() {
  const dateLocale = useDateLocale();
  const { user, isAdmin: isAdminRole } = useAuth();
  const qc = useQueryClient();
  const { t } = useTranslation("hr");
  const { canApprove, pendingByRequest } = useLeaveApproval(user?.id ?? null);
  // Leave approvers (hr.leave.approve · All) get the team views; admins keep everything else.
  const isAdmin = isAdminRole || canApprove;
  const approvalInbox = useApprovalInbox(undefined, isAdmin);
  const [changeTarget, setChangeTarget] = useState<{ row: VacationRequest; mode: "request" | "direct" } | null>(null);
  const typeOptions = ABSENCE_TYPES.map((x) => ({ value: x.value, label: absenceLabel(x.value) }));
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
  const balances = useLeaveBalances(currentYear);
  const focusCollab =
    isAdmin && adminScope === "colaborador"
      ? collaborators.find((c) => c.id === selectedCollabId) ?? myCollab
      : myCollab;

  const leaveBalance = balances.data?.find(b => b.collaborator_id === focusCollab?.id);
  const usedThisYear = leaveBalance?.approved ?? "—";
  const pendingThisYear = leaveBalance?.pending ?? "—";
  const totalDisponivel = leaveBalance?.total ?? "—";
  const saldoAtual = leaveBalance?.balance ?? "—";

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
      if (!collab_id) throw new Error(uiI18n.t("hr:batchFive.labels.noCollaboratorLinkedToYourAccount"));
      if (!newReq.data_inicio) throw new Error(uiI18n.t("hr:batchFive.labels.enterTheDate"));
      // Para período parcial (meio-dia ou horas) usamos um único dia.
      const isFullDay = newReq.periodo === "dia_inteiro";
      const dataFim = isFullDay ? (newReq.data_fim || newReq.data_inicio) : newReq.data_inicio;
      if (isFullDay && !newReq.data_fim) throw new Error(uiI18n.t("hr:batchFive.labels.enterTheDates"));
      if (dias <= 0) throw new Error(uiI18n.t("hr:batchFive.labels.invalidPeriod"));
      const horasNum =
        newReq.periodo === "horas"
          ? parseFloat(newReq.horas)
          : newReq.periodo === "manha" || newReq.periodo === "tarde"
            ? 4
            : null;
      let attachment_path: string | null = null;
      if (newReq.tipo === "baixa_medica" && !attachFile) throw new Error(t("leaveChange.sickCertRequired"));
      if ((newReq.tipo === "consulta_medica" || newReq.tipo === "baixa_medica") && attachFile) {
        const ext = attachFile.name.split(".").pop()?.toLowerCase() || "pdf";
        attachment_path = `${collab_id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("leave-attachments").upload(attachment_path, attachFile);
        if (up.error) throw up.error;
      }
      const { data: inserted, error } = await supabase.from("vacation_requests").insert({
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
      } as never).select("id").single();
      if (error) throw error;
      const insertedId = (inserted as { id?: string } | null)?.id;
      if (insertedId && newReq.tipo === "baixa_medica") {
        void notifyBaixaMedicaSubmitted({ data: { requestId: insertedId } }).catch(() => undefined);
      }
    },
    onSuccess: () => {
      toast.success(uiI18n.t("hr:batchFive.labels.requestCreated"));
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
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
      toast.success(uiI18n.t("hr:batchFive.labels.requestDeleted"));
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
      qc.invalidateQueries({ queryKey: ["leave-balances"] });
      qc.invalidateQueries({ queryKey: ["availability"] });
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
            <CalendarDays className="h-6 w-6" />  {uiI18n.t("hr:batchFive.labels.vacationAndAbsenceCalendar")} </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? uiI18n.t("hr:batchFive.labels.approveOrRejectTheTeamSVacation")
              : uiI18n.t("hr:batchFive.labels.checkYourVacationBalanceAndRequestVacation")}
          </p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!isAdminRole && !myCollab}>
              <Plus className="h-4 w-4" />  {uiI18n.t("hr:remoteWork.newRequest")} </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle> {uiI18n.t("hr:batchFive.labels.requestAbsence")} </DialogTitle>
              <DialogDescription>{uiI18n.t("hr:leave.requestHint")}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {isAdminRole && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground"> {uiI18n.t("glossary:hr.employee")} </Label>
                  <Select
                    value={newReq.collaborator_id}
                    onValueChange={(v) => setNewReq((f) => ({ ...f, collaborator_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={uiI18n.t("hr:batchFive.labels.selectCollaborator")} />
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
                <Label className="text-xs text-muted-foreground"> {uiI18n.t("hr:batchFive.labels.absenceType")} </Label>
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
                        {absenceLabel(t.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground"> {uiI18n.t("hr:leaveChange.duration")} </Label>
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
                    <SelectItem value="dia_inteiro"> {uiI18n.t("hr:batchFive.labels.fullDayS")} </SelectItem>
                    <SelectItem value="manha"> {uiI18n.t("hr:batchFive.labels.halfDayMorningHours")} </SelectItem>
                    <SelectItem value="tarde"> {uiI18n.t("hr:batchFive.labels.halfDayAfternoonHours")} </SelectItem>
                    <SelectItem value="horas"> {uiI18n.t("hr:batchFive.labels.someHours")} </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">
                  {newReq.periodo === "dia_inteiro" ? uiI18n.t("hr:remoteWork.period") : uiI18n.t("common:day")}
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
                          format(new Date(newReq.data_inicio + "T00:00:00"), "d MMM yyyy", { locale: dateLocale })
                        ) : (
                          <span> {uiI18n.t("hr:batchFive.labels.selectDay")} </span>
                        )
                      ) : newReq.data_inicio && newReq.data_fim ? (
                        <>
                          {format(new Date(newReq.data_inicio + "T00:00:00"), "d MMM yyyy", { locale: dateLocale })}
                          {" → "}
                          {format(new Date(newReq.data_fim + "T00:00:00"), "d MMM yyyy", { locale: dateLocale })}
                        </>
                      ) : newReq.data_inicio ? (
                        <>
                          {format(new Date(newReq.data_inicio + "T00:00:00"), "d MMM yyyy", { locale: dateLocale })}
                          {uiI18n.t("hr:batchFive.labels.chooseEndDate")}
                        </>
                      ) : (
                        <span> {uiI18n.t("hr:batchFive.labels.selectDates")} </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    {newReq.periodo === "dia_inteiro" ? (
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        locale={dateLocale}
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
                        locale={dateLocale}
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
                       {uiI18n.t("hr:batchFive.labels.publicHolidaysExcludedFromWorkingDays")} </div>
                  </PopoverContent>
                </Popover>
              </div>
              {newReq.periodo === "horas" && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground"> {uiI18n.t("common:hours")} </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={8}
                    step={0.5}
                    placeholder={uiI18n.t("hr:batchFive.labels.eG")}
                    value={newReq.horas}
                    onChange={(e) => setNewReq((f) => ({ ...f, horas: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                     {uiI18n.t("hr:batchFive.labels.enterTheAuthorizedHoursUpToHours")} </p>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground"> {uiI18n.t("common:notesOptional")} </Label>
                <Textarea
                  rows={2}
                  value={newReq.notas}
                  onChange={(e) => setNewReq((f) => ({ ...f, notas: e.target.value }))}
                />
                {(newReq.tipo === "consulta_medica" || newReq.tipo === "baixa_medica") && (
                  <p className="text-[11px] text-muted-foreground">{t("leaveChange.medicalHint")}</p>
                )}
              </div>
              {(newReq.tipo === "consulta_medica" || newReq.tipo === "baixa_medica") && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">
                    {newReq.tipo === "baixa_medica" ? t("leaveChange.sickCert") : t("leaveChange.attachment")}
                  </Label>
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
                       {uiI18n.t("hr:batchFive.labels.hours")} <span className="font-semibold">{newReq.horas || 0}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (= {dias}  {uiI18n.t("hr:batchFive.labels.workingDayS")} </span>
                    </>
                  ) : (
                    <>
                       {uiI18n.t("hr:batchFive.labels.workingDays")} <span className="font-semibold">{dias}</span>
                      {feriadosNoPeriodo.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({feriadosNoPeriodo.length}  {uiI18n.t("hr:batchFive.labels.publicHolidaySExcluded")} </span>
                      )}
                    </>
                  )}
                </div>
                {feriadosNoPeriodo.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {feriadosNoPeriodo.map((h) => (
                      <li key={h.id} className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                        {format(new Date(h.data + "T00:00:00"), "EEE, d MMM", { locale: dateLocale })}
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
                 {uiI18n.t("common:cancel")} </Button>
              <Button onClick={() => createReq.mutate()} disabled={createReq.isPending}>
                 {uiI18n.t("hr:batchFive.labels.submitRequest")} </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!myCollab && !isAdmin && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
             {uiI18n.t("hr:leave.accountNotLinked", { email: user?.email })} </CardContent>
        </Card>
      )}

      {/* Saldo (escondido no modo Calendário) */}
      {focusCollab && !(isAdmin && adminScope === "calendario") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
               {uiI18n.t("hr:batchFive.labels.vacationBalance")} {focusCollab.nome} · {currentYear}
            </CardTitle>
            <CardDescription>
              {t("leaveOpening.balanceSub")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin && adminScope === "colaborador" && (
              <div className="mb-4 max-w-sm">
                <Label className="text-xs text-muted-foreground"> {uiI18n.t("hr:batchFive.labels.viewBalanceFor")} </Label>
                <Select value={selectedCollabId} onValueChange={setSelectedCollabId}>
                  <SelectTrigger>
                    <SelectValue placeholder={myCollab?.nome ?? uiI18n.t("hr:collaborator.placeholders.selectOption")} />
                  </SelectTrigger>
                  <SelectContent>
                    {collaborators.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} · {t("approvalInbox.pendingCount", {count: approvalInbox.counts[c.id] ?? 0})}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label={t("availability.balance.allowance")} value={leaveBalance?.allowance ?? "—"} />
              <Stat label={t("leaveOpening.previous")} value={leaveBalance?.carry_over ?? "—"} sub={leaveBalance?.reference_date ? t("leaveOpening.asOf", { date: format(new Date(leaveBalance.reference_date + "T00:00:00"), "d/M/yyyy") }) : undefined} />
              <Stat label={t("leaveOpening.total")} value={totalDisponivel} highlight />
              <Stat label={t("leaveOpening.usedPending")} value={`${usedThisYear} / ${pendingThisYear}`} />
              <Stat label={t("approvalInbox.balance")} value={saldoAtual} highlight />
            </div>
            {balances.isError && <p role="alert" className="mt-2 text-sm text-destructive">{t("leaveOpening.loadError")}</p>}
          </CardContent>
        </Card>
      )}

      {/* Pedidos / Calendário */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            {isAdmin
              ? adminScope === "meus"
                ? uiI18n.t("hr:remoteWork.myRequests")
                : adminScope === "colaborador"
                  ? selectedCollabId
                    ? uiI18n.t("hr:batchFive.labels.requestsForWithValues", { value1: collabName(selectedCollabId) })
                    : uiI18n.t("hr:batchFive.labels.selectACollaborator")
                  : uiI18n.t("hr:batchFive.labels.annualTeamCalendarWithValues", { value1: calendarYear })
              : uiI18n.t("hr:remoteWork.myRequests")}
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
                 {uiI18n.t("hr:batchFive.labels.onlyMine")} </button>
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
                 {uiI18n.t("hr:remoteWork.comparisonTitle")} </button>
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
                 {uiI18n.t("hr:batchFive.labels.annualCalendar")} </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isAdmin && adminScope === "colaborador" && !selectedCollabId && (
            <div className="mb-4 max-w-sm">
              <Label className="text-xs text-muted-foreground"> {uiI18n.t("glossary:hr.employee")} </Label>
              <Select value={selectedCollabId} onValueChange={setSelectedCollabId}>
                <SelectTrigger>
                  <SelectValue placeholder={uiI18n.t("hr:batchFive.labels.selectCollaborator")} />
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
            <div className="text-sm text-muted-foreground"> {uiI18n.t("common:loading")} </div>
          ) : visibleRequests.length === 0 ? (
            <div className="text-sm text-muted-foreground"> {uiI18n.t("hr:batchFive.labels.noRequests")} </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead> {uiI18n.t("common:type")} </TableHead>
                  <TableHead> {uiI18n.t("common:home")} </TableHead>
                  <TableHead> {uiI18n.t("common:admin.imports.stages.cols.end")} </TableHead>
                  <TableHead className="text-right"> {uiI18n.t("common:days")} </TableHead>
                  <TableHead> {uiI18n.t("common:status")} </TableHead>
                  <TableHead> {uiI18n.t("common:notes")} </TableHead>
                  <TableHead className="text-right"> {uiI18n.t("common:actions")} </TableHead>
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
                      <EstadoBadge estado={uiI18n.t(`hr:leave.status.${r.estado}`)} />
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

function Stat({ label, value, highlight, sub }: { label: string; value: number | string; highlight?: boolean; sub?: string }) {
  useTranslation();
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/30" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: VacationRequest["estado"] }) {
  useTranslation();
  const styles = {
    pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    aprovada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    rejeitada: "bg-red-500/15 text-red-700 dark:text-red-400",
    cancelada: "bg-muted text-muted-foreground",
  }[estado];
  const labels = { pendente: "Pendente", aprovada: "Aprovada", rejeitada: "Rejeitada", cancelada: "Cancelada" }[estado];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{labels}</span>;
}
