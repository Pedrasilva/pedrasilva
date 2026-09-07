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
  resolveApprover,
  todayISO,
  useCreateRemoteWorkRequests,
  useMyCollaborator,
  useRemoteWorkApprovers,
  useRemoteWorkSettings,
  validateNotice,
  type RemoteWorkLocation,
} from "@/hooks/use-remote-work";

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
  const [locationType, setLocationType] = useState<RemoteWorkLocation>("home");
  const [notas, setNotas] = useState("");
  const [override, setOverride] = useState(false);

  const approver = resolveApprover(approvers, collaborator?.id ?? null);
  const approverLabel = approver
    ? t("hr:remoteWork.approverResolved")
    : t("hr:remoteWork.approverMissing");

  const canOverride =
    isAdmin && (settings?.allow_admin_override ?? true);

  const noticeError =
    settings && from
      ? validateNotice(from, settings, { override: override && canOverride })
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
      toast.error(
        noticeError === "sameDay"
          ? t("hr:remoteWork.sameDayBlocked")
          : t("hr:remoteWork.noticeBlocked", {
              days: settings?.minimum_notice_days ?? 1,
            }),
      );
      return;
    }
    if (
      settings?.approval_required &&
      !approver &&
      !(override && canOverride)
    ) {
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

    try {
      await create.mutateAsync({
        collaboratorId: collaborator.id,
        dates,
        notas,
        locationType,
        override:
          (override && canOverride) || settings?.approval_required === false,
      });
      setNotas("");
      setOverride(false);
      onOpenChange(false);
      toast.success(t("hr:remoteWork.submitted"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hr:remoteWork.newRequest")}</DialogTitle>
          <DialogDescription>
            {t("hr:remoteWork.dialogSubtitle")}
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
            {t("hr:remoteWork.approver")}: {approverLabel}
          </div>

          {noticeError && (
            <p className="text-xs text-destructive">
              {noticeError === "sameDay"
                ? t("hr:remoteWork.sameDayBlocked")
                : t("hr:remoteWork.noticeBlocked", {
                    days: settings?.minimum_notice_days ?? 1,
                  })}
            </p>
          )}

          {canOverride && (
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
            {t("hr:remoteWork.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
