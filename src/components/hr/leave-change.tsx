/**
 * Leave change requests (staff, on own approved requests) and direct edits
 * by leave approvers. All writes go through SECURITY DEFINER database
 * functions (leave_change_submit / leave_change_decide / leave_direct_change)
 * which enforce ownership, no self-approval and no overlaps; the existing
 * vacation_request_sync_timesheet trigger then rebuilds the timesheet leave
 * hours. Emails are sent afterwards by sendLeaveChangeEmails.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { History, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendLeaveChangeEmails } from "@/lib/hr/leave-change-email.functions";
import { countWeekdays } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Kind = "cancel" | "dates" | "type";
type Periodo = "dia_inteiro" | "manha" | "tarde" | "horas";

export interface LeaveRow {
  id: string;
  collaborator_id: string;
  data_inicio: string;
  data_fim: string;
  estado: string;
  tipo: string;
}

export interface PendingChange {
  id: string;
  request_id: string;
  kind: Kind;
  new_data_inicio: string | null;
  new_data_fim: string | null;
  new_tipo: string | null;
  explanation: string;
  recipient_id: string;
  requested_by: string;
}

export function useLeaveApproval(userId: string | null) {
  const canApprove = useQuery({
    queryKey: ["can_approve_leave", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("can_approve_leave", { _uid: userId! });
      return !!data;
    },
  });
  const pending = useQuery({
    queryKey: ["vacation_change_requests", "pending"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_change_requests")
        .select("id, request_id, kind, new_data_inicio, new_data_fim, new_tipo, explanation, recipient_id, requested_by")
        .eq("status", "pendente");
      if (error) throw error;
      return (data ?? []) as PendingChange[];
    },
  });
  const byRequest = useMemo(() => new Map((pending.data ?? []).map((c) => [c.request_id, c])), [pending.data]);
  return { canApprove: !!canApprove.data, pendingByRequest: byRequest };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["vacation_requests"] });
    qc.invalidateQueries({ queryKey: ["vacation_change_requests"] });
    qc.invalidateQueries({ queryKey: ["vacation_request_history"] });
  };
}

function errText(t: (k: string) => string, e: unknown) {
  const m = (e as Error)?.message ?? "";
  for (const code of ["overlap", "not_owner", "not_approved", "explanation_required", "invalid_recipient", "invalid_dates", "reason_required", "own_approved", "not_recipient", "not_pending"]) {
    if (m.includes(code)) return t(`leaveChange.errors.${code}`);
  }
  return m;
}

function notifyEmails(requestId: string) {
  sendLeaveChangeEmails({ data: { requestId } }).catch((e) => console.error("[leave-email]", e));
}

/** Shared field block: what to change + new dates/type. */
function ChangeFields({
  kind, setKind, start, setStart, end, setEnd, periodo, setPeriodo, horas, setHoras, tipo, setTipo, types,
}: {
  kind: Kind; setKind: (k: Kind) => void;
  start: string; setStart: (v: string) => void;
  end: string; setEnd: (v: string) => void;
  periodo: Periodo; setPeriodo: (v: Periodo) => void;
  horas: string; setHoras: (v: string) => void;
  tipo: string; setTipo: (v: string) => void;
  types: { value: string; label: string }[];
}) {
  const { t } = useTranslation("hr");
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("leaveChange.what")}</Label>
        <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cancel">{t("leaveChange.kind.cancel")}</SelectItem>
            <SelectItem value="dates">{t("leaveChange.kind.dates")}</SelectItem>
            <SelectItem value="type">{t("leaveChange.kind.type")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {kind === "dates" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("leaveChange.duration")}</Label>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dia_inteiro">{t("leaveChange.periodo.dia_inteiro")}</SelectItem>
                <SelectItem value="manha">{t("leaveChange.periodo.manha")}</SelectItem>
                <SelectItem value="tarde">{t("leaveChange.periodo.tarde")}</SelectItem>
                <SelectItem value="horas">{t("leaveChange.periodo.horas")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("leaveChange.start")}</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          {periodo === "dia_inteiro" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("leaveChange.end")}</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          ) : periodo === "horas" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("leaveChange.hours")}</Label>
              <Input type="number" min={0.5} max={8} step={0.5} value={horas} onChange={(e) => setHoras(e.target.value)} />
            </div>
          ) : null}
        </div>
      )}
      {kind === "type" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("leaveChange.newType")}</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {types.map((x) => (
                <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function useChangeState(r: LeaveRow) {
  const [kind, setKind] = useState<Kind>("dates");
  const [start, setStart] = useState(r.data_inicio);
  const [end, setEnd] = useState(r.data_fim);
  const [periodo, setPeriodo] = useState<Periodo>("dia_inteiro");
  const [horas, setHoras] = useState("");
  const [tipo, setTipo] = useState(r.tipo);
  return { kind, setKind, start, setStart, end, setEnd, periodo, setPeriodo, horas, setHoras, tipo, setTipo };
}

function computeArgs(s: ReturnType<typeof useChangeState>, holidays: Set<string>) {
  const single = s.periodo !== "dia_inteiro";
  const endDate = single ? s.start : s.end;
  const h = parseFloat(s.horas);
  const dias =
    s.periodo === "dia_inteiro"
      ? countWeekdays(s.start, endDate, holidays)
      : s.periodo === "horas"
        ? Math.round(((Number.isFinite(h) ? h : 0) / 8) * 100) / 100
        : 0.5;
  return {
    _kind: s.kind,
    _start: s.kind === "dates" ? s.start : null,
    _end: s.kind === "dates" ? endDate : null,
    _periodo: s.kind === "dates" ? s.periodo : null,
    _horas: s.kind === "dates" ? (s.periodo === "horas" ? h : s.periodo === "dia_inteiro" ? null : 4) : null,
    _tipo: s.kind === "type" ? s.tipo : null,
    _dias: s.kind === "dates" ? dias : null,
  };
}

export function RequestChangeDialog({
  open, onOpenChange, request, types, holidays,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; request: LeaveRow;
  types: { value: string; label: string }[]; holidays: Set<string>;
}) {
  const { t } = useTranslation("hr");
  const s = useChangeState(request);
  const [explanation, setExplanation] = useState("");
  const [recipient, setRecipient] = useState("");
  const invalidate = useInvalidate();
  const { data: approvers = [] } = useQuery({
    queryKey: ["leave_approvers"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_leave_approvers");
      if (error) throw error;
      return (data ?? []) as { user_id: string; nome: string; email: string; is_default: boolean }[];
    },
  });
  const chosen = recipient || approvers.find((a) => a.is_default)?.user_id || approvers[0]?.user_id || "";
  const submit = useMutation({
    mutationFn: async () => {
      const a = computeArgs(s, holidays);
      const { error } = await supabase.rpc("leave_change_submit", {
        _req: request.id, ...a, _explanation: explanation, _recipient: chosen,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("leaveChange.sent"));
      notifyEmails(request.id);
      invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errText(t, e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("leaveChange.requestTitle")}</DialogTitle>
          <DialogDescription>{t("leaveChange.requestSub")}</DialogDescription>
        </DialogHeader>
        <ChangeFields {...s} types={types} />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("leaveChange.explanation")}</Label>
          <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("leaveChange.sendTo")}</Label>
          <Select value={chosen} onValueChange={setRecipient}>
            <SelectTrigger><SelectValue placeholder={t("leaveChange.noApprovers")} /></SelectTrigger>
            <SelectContent>
              {approvers.map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.nome}{a.is_default ? ` · ${t("leaveChange.yourApprover")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("leaveChange.cancelBtn")}</Button>
          <Button disabled={!explanation.trim() || !chosen || submit.isPending} onClick={() => submit.mutate()}>
            {t("leaveChange.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DirectChangeDialog({
  open, onOpenChange, request, types, holidays,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; request: LeaveRow;
  types: { value: string; label: string }[]; holidays: Set<string>;
}) {
  const { t } = useTranslation("hr");
  const s = useChangeState(request);
  const [reason, setReason] = useState("");
  const invalidate = useInvalidate();
  const apply = useMutation({
    mutationFn: async () => {
      const a = computeArgs(s, holidays);
      const { error } = await supabase.rpc("leave_direct_change", { _req: request.id, ...a, _reason: reason } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("leaveChange.applied"));
      notifyEmails(request.id);
      invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(errText(t, e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("leaveChange.directTitle")}</DialogTitle>
          <DialogDescription>{t("leaveChange.directSub")}</DialogDescription>
        </DialogHeader>
        <ChangeFields {...s} types={types} />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("leaveChange.reason")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("leaveChange.cancelBtn")}</Button>
          <Button disabled={!reason.trim() || apply.isPending} onClick={() => apply.mutate()}>
            {t("leaveChange.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Badge + proposal + (for the recipient) Aceitar / Recusar. */
export function PendingChangeBadge({
  change, userId, typeLabel,
}: { change: PendingChange; userId: string | null; typeLabel: (t: string) => string }) {
  const { t } = useTranslation("hr");
  const invalidate = useInvalidate();
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const decide = useMutation({
    mutationFn: async (accept: boolean) => {
      const { error } = await supabase.rpc("leave_change_decide", {
        _change: change.id, _accept: accept, _reason: accept ? "" : reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("leaveChange.decided"));
      notifyEmails(change.request_id);
      invalidate();
      setRefuseOpen(false);
    },
    onError: (e) => toast.error(errText(t, e)),
  });
  const proposal =
    change.kind === "cancel"
      ? t("leaveChange.kind.cancel")
      : change.kind === "dates"
        ? `${change.new_data_inicio} → ${change.new_data_fim}`
        : typeLabel(change.new_tipo ?? "");
  const isRecipient = userId === change.recipient_id && userId !== change.requested_by;
  return (
    <div className="mt-1 space-y-1 text-left">
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        {t("leaveChange.pendingBadge")}
      </span>
      <div className="text-[11px] text-muted-foreground">
        {proposal} · “{change.explanation}”
      </div>
      {isRecipient && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => decide.mutate(true)} disabled={decide.isPending}>
            <Check className="h-3 w-3" /> {t("leaveChange.accept")}
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setRefuseOpen(true)}>
            <X className="h-3 w-3" /> {t("leaveChange.refuse")}
          </Button>
        </div>
      )}
      <Dialog open={refuseOpen} onOpenChange={setRefuseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("leaveChange.refuseTitle")}</DialogTitle>
          </DialogHeader>
          <Label className="text-xs text-muted-foreground">{t("leaveChange.reason")}</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button disabled={!reason.trim() || decide.isPending} onClick={() => decide.mutate(false)}>
              {t("leaveChange.refuse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function LeaveHistoryButton({ requestId }: { requestId: string }) {
  const { t } = useTranslation("hr");
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["vacation_request_history", requestId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_request_history")
        .select("id, actor_id, action, after, reason, created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: names = {} } = useQuery({
    queryKey: ["leave_actor_names"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.rpc("list_collaborators_basic" as never);
      const map: Record<string, string> = {};
      for (const c of ((data ?? []) as { user_id?: string; nome?: string }[])) if (c.user_id && c.nome) map[c.user_id] = c.nome;
      return map;
    },
  });
  return (
    <>
      <Button size="sm" variant="ghost" title={t("leaveChange.history")} onClick={() => setOpen(true)}>
        <History className="h-3 w-3" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("leaveChange.history")}</DialogTitle>
          </DialogHeader>
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("leaveChange.noHistory")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.map((h) => (
                <li key={h.id} className="rounded-md border p-2">
                  <div className="font-medium">{t(`leaveChange.action.${h.action}`, { defaultValue: h.action })}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString()} · {(h.actor_id && names[h.actor_id]) || "—"}
                  </div>
                  {h.reason && <div className="text-xs">“{h.reason}”</div>}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditIcon() {
  return <Pencil className="h-3 w-3" />;
}
