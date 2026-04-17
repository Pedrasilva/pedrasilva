import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_app/ferias")({
  component: FeriasPage,
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
    queryKey: ["collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators").select("*").order("nome");
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

  // Find own collaborator (by email)
  const myCollab = useMemo(
    () => collaborators.find((c) => c.email && user?.email && c.email.toLowerCase() === user.email.toLowerCase()) ?? null,
    [collaborators, user],
  );

  // Saldos do colaborador actual (ou colaborador seleccionado pelo admin)
  const [selectedCollabId, setSelectedCollabId] = useState<string>("");
  const focusCollab = isAdmin
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

  const totalDisponivel = (focusCollab?.dias_ferias_anuais ?? 0) + (focusCollab?.saldo_ferias_anterior ?? 0);
  const saldoAtual = totalDisponivel - usedThisYear - pendingThisYear;

  // Novo pedido
  const [newOpen, setNewOpen] = useState(false);
  const [newReq, setNewReq] = useState<{
    collaborator_id: string;
    tipo: AbsenceType;
    data_inicio: string;
    data_fim: string;
    notas: string;
  }>({
    collaborator_id: "",
    tipo: "ferias",
    data_inicio: "",
    data_fim: "",
    notas: "",
  });

  const dias = useMemo(
    () => countWeekdays(newReq.data_inicio, newReq.data_fim),
    [newReq.data_inicio, newReq.data_fim],
  );

  const createReq = useMutation({
    mutationFn: async () => {
      const collab_id = isAdmin && newReq.collaborator_id ? newReq.collaborator_id : myCollab?.id;
      if (!collab_id) throw new Error("Sem colaborador associado à sua conta");
      if (!newReq.data_inicio || !newReq.data_fim) throw new Error("Indique as datas");
      if (dias <= 0) throw new Error("Período inválido");
      const { error } = await supabase.from("vacation_requests").insert({
        collaborator_id: collab_id,
        tipo: newReq.tipo,
        data_inicio: newReq.data_inicio,
        data_fim: newReq.data_fim,
        dias_uteis: dias,
        notas: newReq.notas || null,
        estado: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido criado");
      qc.invalidateQueries({ queryKey: ["vacation_requests"] });
      setNewOpen(false);
      setNewReq({ collaborator_id: "", tipo: "ferias", data_inicio: "", data_fim: "", notas: "" });
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

  // Lista a mostrar: admin vê tudo (com filtro opcional); user vê só os seus
  const visibleRequests = useMemo(() => {
    if (!isAdmin) return requests; // RLS já restringe
    if (!selectedCollabId) return requests;
    return requests.filter((r) => r.collaborator_id === selectedCollabId);
  }, [requests, isAdmin, selectedCollabId]);

  const collabName = (id: string) => collaborators.find((c) => c.id === id)?.nome ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" /> Mapa de Férias
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Aprove ou rejeite pedidos da equipa de Projecto."
              : "Consulte o seu saldo e marque os seus períodos de férias."}
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
                <Label className="text-xs text-muted-foreground">Período</Label>
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
                      {newReq.data_inicio && newReq.data_fim ? (
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
                    <Calendar
                      mode="range"
                      numberOfMonths={2}
                      locale={pt}
                      weekStartsOn={1}
                      defaultMonth={newReq.data_inicio ? new Date(newReq.data_inicio + "T00:00:00") : new Date()}
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
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Notas (opcional)</Label>
                <Textarea
                  rows={2}
                  value={newReq.notas}
                  onChange={(e) => setNewReq((f) => ({ ...f, notas: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 rounded-md bg-muted px-3 py-2 text-sm">
                Dias úteis: <span className="font-semibold">{dias}</span>
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

      {/* Saldo */}
      {focusCollab && (
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
            {isAdmin && (
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

      {/* Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isAdmin ? "Todos os pedidos" : "Os meus pedidos"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">A carregar…</div>
          ) : visibleRequests.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem pedidos.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>Colaborador</TableHead>}
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
                    {isAdmin && <TableCell>{collabName(r.collaborator_id)}</TableCell>}
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
