import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { toLocalISODate } from "@/lib/dates";
import {
  addDaysISO,
  earliestInPolicyDate,
  effectiveMode,
  isLateDate,
  remoteHoursForDay,
  resolveApprover,
  todayISO,
  useCreateRemoteWorkRequests,
  useMyCollaborator,
  useRemoteWorkApprovers,
  useRemoteWorkSettings,
  validateNotice,
  type RemoteWorkDayPart,
  type RemoteWorkKind,
  type RemoteWorkLocation,
} from "@/hooks/use-remote-work";

const DAY_PARTS: RemoteWorkDayPart[] = ["full_day", "morning", "afternoon"];
const WORK_KINDS: RemoteWorkKind[] = [
  "home_office",
  "remote_elsewhere",
  "client_site",
  "external_meeting",
  "other",
];

export function RequestWfhDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation(["hr", "common"]);
  const { isAdmin } = useAuth();
  const { collaborator } = useMyCollaborator();
  const { data: settings } = useRemoteWorkSettings();
  const { data: approvers = [] } = useRemoteWorkApprovers();
  const create = useCreateRemoteWorkRequests();

  const defaultDate = useMemo(() => addDaysISO(todayISO(), 1), []);
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [dayPart, setDayPart] = useState<RemoteWorkDayPart>("full_day");
  const [locationType, setLocationType] = useState<RemoteWorkLocation>("home");
  const [locationDetail, setLocationDetail] = useState("");
  const [workKind, setWorkKind] = useState<RemoteWorkKind>("home_office");
  const [notas, setNotas] = useState("");
  const [override, setOverride] = useState(false);
  const [lateReason, setLateReason] = useState("");

  const mode = effectiveMode(settings);
  const needsApproval = mode === "approval_required";
  const singleDay = from === to;
  const effectiveDayPart: RemoteWorkDayPart = singleDay ? dayPart : "full_day";

  const approver = resolveApprover(approvers, collaborator?.id ?? null);
  const approverLabel = approver
    ? t("hr:remoteWork.approverResolved")
    : t("hr:remoteWork.approverMissing");

  const canOverride = isAdmin && (settings?.allow_admin_override ?? true);

  const noticeError =
    settings && from
      ? validateNotice(from, settings, { override: override && canOverride })
      : null;

  // Short-notice entries are allowed, but flagged as late and always approved.
  const isLate =
    settings && from
      ? isLateDate(from, settings, { override: override && canOverride })
      : false;
  const policyDate = settings ? earliestInPolicyDate(settings) : null;

  const remoteHours = remoteHoursForDay(
    collaborator?.daily_hours ?? null,
    effectiveDayPart,
  );
  const officeHours =
    remoteHours !== null && collaborator?.daily_hours
      ? collaborator.daily_hours - remoteHours
      : null;

  const submit = async () => {
    if (!collaborator) {
      toast.error(t("hr:remoteWork.noCollaborator"));
      return;
    }
    if (to < from) {
      toast.error(t("hr:remoteWork.invalidRange"));
      return;
    }
    if (noticeError) {
      toast.error(t("hr:remoteWork.pastDateBlocked"));
      return;
    }
    // A late entry always needs an approver, whatever the current mode is.
    if ((needsApproval || isLate) && !approver && !(override && canOverride)) {
      toast.error(t("hr:remoteWork.approverMissingBlocked"));
      return;
    }

    const dates: string[] = [];
    const cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) dates.push(toLocalISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    if (dates.length === 0) {
      toast.error(t("hr:remoteWork.noWeekdays"));
      return;
    }

    const lateDates = settings
      ? dates.filter((d) =>
          isLateDate(d, settings, { override: override && canOverride }),
        )
      : [];

    try {
      await create.mutateAsync({
        collaboratorId: collaborator.id,
        dates,
        notas,
        locationType,
        locationDetail: locationType === "remote" ? locationDetail : null,
        workKind,
        dayPart: effectiveDayPart,
        mode,
        override: override && canOverride,
        lateDates,
        lateReason,
      });
      setNotas("");
      setLocationDetail("");
      setLateReason("");
      setOverride(false);
      onOpenChange(false);
      toast.success(
        lateDates.length > 0
          ? t("hr:remoteWork.submittedLate")
          : needsApproval
            ? t("hr:remoteWork.submitted")
            : t("hr:remoteWork.declared"),
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {needsApproval
              ? t("hr:remoteWork.newRequest")
              : t("hr:remoteWork.newDeclaration")}
          </DialogTitle>
          <DialogDescription>
            {needsApproval
              ? t("hr:remoteWork.dialogSubtitle")
              : t("hr:remoteWork.dialogSubtitleDeclaration")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wfh-from">{t("hr:remoteWork.from")}</Label>
              <Input
                id="wfh-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (e.target.value > to) setTo(e.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wfh-to">{t("hr:remoteWork.to")}</Label>
              <Input
                id="wfh-to"
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.dayPartLabel")}</Label>
            <RadioGroup
              value={effectiveDayPart}
              onValueChange={(v) => setDayPart(v as RemoteWorkDayPart)}
              className="flex flex-wrap gap-4"
              disabled={!singleDay}
            >
              {DAY_PARTS.map((dp) => (
                <label
                  key={dp}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`dp-${dp}`}
                >
                  <RadioGroupItem id={`dp-${dp}`} value={dp} />
                  {t(`hr:remoteWork.dayPart.${dp}`)}
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {singleDay
                ? t("hr:remoteWork.dayPartHint")
                : t("hr:remoteWork.dayPartRangeHint")}
            </p>
            {effectiveDayPart !== "full_day" && remoteHours !== null && (
              <p className="text-xs text-muted-foreground">
                {t("hr:remoteWork.halfDayHours", {
                  remote: remoteHours,
                  office: officeHours,
                })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.locationType")}</Label>
            <Select
              value={locationType}
              onValueChange={(v) => setLocationType(v as RemoteWorkLocation)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="home">
                  {t("hr:remoteWork.location.home")}
                </SelectItem>
                <SelectItem value="remote">
                  {t("hr:remoteWork.location.remote")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {locationType === "remote" && (
            <div className="space-y-1.5">
              <Label htmlFor="wfh-detail">
                {t("hr:remoteWork.locationDetail")}
              </Label>
              <Input
                id="wfh-detail"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder={t("hr:remoteWork.locationDetailPlaceholder")}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.workKindLabel")}</Label>
            <Select
              value={workKind}
              onValueChange={(v) => setWorkKind(v as RemoteWorkKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`hr:remoteWork.workKind.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wfh-notes">{t("hr:remoteWork.notes")}</Label>
            <Textarea
              id="wfh-notes"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder={t("hr:remoteWork.notesPlaceholder")}
            />
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {needsApproval || isLate ? (
              <>
                <div>{t("hr:remoteWork.workflowApproval")}</div>
                <div className="mt-1">
                  {t("hr:remoteWork.approver")}: {approverLabel}
                </div>
              </>
            ) : (
              t("hr:remoteWork.workflowNotification")
            )}
          </div>

          {isLate && (
            <div
              className="space-y-2 rounded-md px-3 py-2"
              style={{
                background: "color-mix(in oklab, var(--clay) 12%, transparent)",
                border: "1px solid color-mix(in oklab, var(--clay) 35%, transparent)",
              }}
            >
              <p className="text-xs font-medium">
                {t("hr:remoteWork.lateWarning", {
                  days: settings?.minimum_notice_days ?? 1,
                  date: policyDate ?? "",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("hr:remoteWork.lateWarningSub")}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="wfh-late-reason" className="text-xs">
                  {t("hr:remoteWork.lateReason")}
                </Label>
                <Textarea
                  id="wfh-late-reason"
                  rows={2}
                  value={lateReason}
                  onChange={(e) => setLateReason(e.target.value)}
                  placeholder={t("hr:remoteWork.lateReasonPlaceholder")}
                />
              </div>
            </div>
          )}

          {noticeError && (
            <p className="text-xs text-destructive">
              {t("hr:remoteWork.pastDateBlocked")}
            </p>
          )}

          {canOverride && (needsApproval || isLate) && (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {t("hr:remoteWork.overrideLabel")}
              </span>
              <Switch checked={override} onCheckedChange={setOverride} />
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common:cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {needsApproval || isLate
              ? t("hr:remoteWork.submit")
              : t("hr:remoteWork.submitDeclaration")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
