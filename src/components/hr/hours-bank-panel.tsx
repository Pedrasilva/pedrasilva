/**
 * Hours bank panel.
 *
 * Shows the ledger for one collaborator — never a stored balance. Approved
 * additional hours arrive here from the weekly approval flow; compensation
 * (extra leave or payment) and HR adjustments leave from here, each as its own
 * auditable row.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDateLocale } from "@/i18n/use-date-locale";
import { formatHM } from "@/lib/projects/time-format";
import {
  describeHours,
  useAddHoursBankMovement,
  useHoursBank,
  type HoursBankType,
} from "@/lib/hr/use-hours-bank";
import { useWeeklyCapacity } from "@/lib/projects/use-timesheet-weeks";

export function HoursBankPanel({
  collaboratorId,
  canManage,
}: {
  collaboratorId: string | null;
  canManage: boolean;
}) {
  const { t } = useTranslation(["projects"]);
  const locale = useDateLocale();
  const { user } = useAuth();
  const { data } = useHoursBank(collaboratorId);
  const { data: capacity } = useWeeklyCapacity(collaboratorId);
  const addMovement = useAddHoursBankMovement();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<HoursBankType>("converted_to_leave");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [saving, setSaving] = useState(false);

  const balance = data?.balance ?? 0;
  const dailyHours = capacity?.dailyHours ?? 8;
  const inDays = useMemo(() => describeHours(balance, dailyHours), [balance, dailyHours]);

  const reset = () => {
    setKind("converted_to_leave");
    setHours("");
    setReason("");
    setLeaveDate("");
  };

  const submit = async () => {
    if (!collaboratorId) return;
    const value = Number(hours);
    if (!value || Number.isNaN(value)) return;
    if (kind === "manual_adjustment" && reason.trim().length === 0) {
      toast.error(t("hoursBank.reasonRequired"));
      return;
    }
    setSaving(true);
    try {
      let vacationRequestId: string | null = null;

      // Converting banked hours into time off creates a real leave request in
      // the existing HR flow, so the compensation is visible and approvable
      // exactly like any other absence — with its origin recorded in the notes.
      if (kind === "converted_to_leave") {
        if (!leaveDate) {
          toast.error(t("hoursBank.reasonRequired"));
          setSaving(false);
          return;
        }
        const magnitude = Math.abs(value);
        const isFullDay = magnitude >= dailyHours;
        const provenance = `${t("hoursBank.title")} — ${formatHM(magnitude)}${
          reason.trim() ? ` · ${reason.trim()}` : ""
        }`;
        const { data: inserted, error } = await supabase
          .from("vacation_requests")
          .insert({
            collaborator_id: collaboratorId,
            tipo: "autorizada_paga",
            data_inicio: leaveDate,
            data_fim: leaveDate,
            dias_uteis: isFullDay ? 1 : 0.5,
            periodo: isFullDay ? "dia_inteiro" : "horas",
            horas: isFullDay ? null : magnitude,
            notas: provenance,
            estado: "pendente",
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        vacationRequestId = (inserted as { id: string }).id;
      }

      await addMovement.mutateAsync({
        collaboratorId,
        transactionType: kind,
        hours: value,
        reason: reason.trim() || null,
        createdBy: user?.id ?? null,
        vacationRequestId,
      });
      toast.success(t("hoursBank.savedToast"));
      reset();
      setOpen(false);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("hoursBank.title")}</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {balance < 0 ? "−" : ""}
              {formatHM(Math.abs(balance)) || "0:00"}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("hoursBank.balanceInDays", {
                days: Math.abs(inDays.days),
                rest: Math.abs(inDays.rest),
              })}
            </span>
          </div>
        </div>
        {canManage && collaboratorId && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t("hoursBank.addMovement")}
          </Button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-border">
        {(data?.entries ?? []).length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {t("hoursBank.empty")}
          </p>
        ) : (
          (data?.entries ?? []).map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-0"
            >
              <div className="min-w-0">
                <div className="font-medium">{t(`hoursBank.type.${e.transaction_type}`)}</div>
                <div className="text-xs text-muted-foreground">
                  {format(parseISO(e.entry_date), "d MMM yyyy", { locale })}
                  {e.week_start
                    ? ` · ${t("hoursBank.weekOf", {
                        date: format(parseISO(e.week_start), "d MMM", { locale }),
                      })}`
                    : ""}
                  {e.reason ? ` · ${e.reason}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`tabular-nums ${
                    e.hours < 0 ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  {e.hours < 0 ? "−" : "+"}
                  {formatHM(Math.abs(e.hours))}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {e.balance < 0 ? "−" : ""}
                  {formatHM(Math.abs(e.balance))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hoursBank.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("hoursBank.kind")}</label>
              <Select value={kind} onValueChange={(v) => setKind(v as HoursBankType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="converted_to_leave">
                    {t("hoursBank.type.converted_to_leave")}
                  </SelectItem>
                  <SelectItem value="paid_compensation">
                    {t("hoursBank.type.paid_compensation")}
                  </SelectItem>
                  <SelectItem value="manual_adjustment">
                    {t("hoursBank.type.manual_adjustment")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("hoursBank.hoursLabel")}</label>
              <Input
                type="number"
                step="0.25"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1"
              />
            </div>
            {kind === "converted_to_leave" && (
              <div>
                <label className="text-xs text-muted-foreground">{t("hoursBank.date")}</label>
                <Input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">{t("hoursBank.reasonLabel")}</label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("hoursBank.cancel")}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {t("hoursBank.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
