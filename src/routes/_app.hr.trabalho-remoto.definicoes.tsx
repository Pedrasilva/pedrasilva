import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDeleteRemoteWorkApprover,
  useMyCollaborator,
  useRemoteWorkApprovers,
  useRemoteWorkSettings,
  useSaveRemoteWorkApprover,
  useUserCollaboratorLinks,
  useUpdateRemoteWorkSettings,
} from "@/hooks/use-remote-work";

export const Route = createFileRoute("/_app/hr/trabalho-remoto/definicoes")({
  component: SettingsTab,
});

const GLOBAL = "__global__";

function SettingsTab() {
  const { t } = useTranslation(["hr", "common"]);
  const { collaborators } = useMyCollaborator();
  const settingsQ = useRemoteWorkSettings();
  const updateSettings = useUpdateRemoteWorkSettings();
  const approversQ = useRemoteWorkApprovers();
  const saveApprover = useSaveRemoteWorkApprover();
  const deleteApprover = useDeleteRemoteWorkApprover();

  const [requiresApproval, setRequiresApproval] = useState(true);
  const [noticeDays, setNoticeDays] = useState(1);
  const [allowSameDay, setAllowSameDay] = useState(false);
  const [allowAdminOverride, setAllowAdminOverride] = useState(true);

  useEffect(() => {
    const s = settingsQ.data;
    if (!s) return;
    setRequiresApproval(s.approval_required);
    setNoticeDays(s.minimum_notice_days);
    setAllowSameDay(s.allow_same_day_requests);
    setAllowAdminOverride(s.allow_admin_override);
  }, [settingsQ.data]);

  const [newApprover, setNewApprover] = useState("");
  const [newScope, setNewScope] = useState(GLOBAL);
  const [newPriority, setNewPriority] = useState(1);

  const { data: links = [] } = useUserCollaboratorLinks();

  const nameOf = (id: string | null) =>
    id ? (collaborators.find((c) => c.id === id)?.nome ?? "—") : null;

  const approverName = (userId: string) => {
    const link = links.find((l) => l.user_id === userId);
    return link?.collaborator_nome ?? link?.email ?? "—";
  };

  const savePolicy = async () => {
    try {
      await updateSettings.mutateAsync({
        approval_required: requiresApproval,
        minimum_notice_days: noticeDays,
        allow_same_day_requests: allowSameDay,
        allow_admin_override: allowAdminOverride,
      });
      toast.success(t("hr:remoteWork.settingsSaved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const addApprover = async () => {
    if (!newApprover) return;
    try {
      await saveApprover.mutateAsync({
        approver_user_id: newApprover,
        collaborator_id: newScope === GLOBAL ? null : newScope,
        priority: newPriority,
        active: true,
      });
      setNewApprover("");
      setNewScope(GLOBAL);
      setNewPriority(1);
      toast.success(t("hr:remoteWork.approverAdded"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.policyTitle")}
        </h2>
        <div className="space-y-4">
          <SettingRow
            label={t("hr:remoteWork.requiresApproval")}
            hint={t("hr:remoteWork.requiresApprovalHint")}
          >
            <Switch
              checked={requiresApproval}
              onCheckedChange={setRequiresApproval}
            />
          </SettingRow>
          <SettingRow
            label={t("hr:remoteWork.noticeDays")}
            hint={t("hr:remoteWork.noticeDaysHint")}
          >
            <Input
              type="number"
              min={0}
              className="w-24"
              value={noticeDays}
              onChange={(e) => setNoticeDays(Number(e.target.value) || 0)}
            />
          </SettingRow>
          <SettingRow
            label={t("hr:remoteWork.allowSameDay")}
            hint={t("hr:remoteWork.allowSameDayHint")}
          >
            <Switch checked={allowSameDay} onCheckedChange={setAllowSameDay} />
          </SettingRow>
          <SettingRow
            label={t("hr:remoteWork.allowAdminOverride")}
            hint={t("hr:remoteWork.allowAdminOverrideHint")}
          >
            <Switch
              checked={allowAdminOverride}
              onCheckedChange={setAllowAdminOverride}
            />
          </SettingRow>
          <div className="flex justify-end">
            <Button onClick={savePolicy} disabled={updateSettings.isPending}>
              {t("common:save")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t("hr:remoteWork.approversTitle")}
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {t("hr:remoteWork.approversHint")}
        </p>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.approver")}</Label>
            <Select value={newApprover} onValueChange={setNewApprover}>
              <SelectTrigger>
                <SelectValue placeholder={t("hr:remoteWork.selectPerson")} />
              </SelectTrigger>
              <SelectContent>
                {links.map((l) => (
                  <SelectItem key={l.user_id} value={l.user_id}>
                    {l.collaborator_nome ?? l.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.scope")}</Label>
            <Select value={newScope} onValueChange={setNewScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>
                  {t("hr:remoteWork.scopeGlobal")}
                </SelectItem>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("hr:remoteWork.priority")}</Label>
            <Input
              type="number"
              min={1}
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={addApprover}
              disabled={!newApprover || saveApprover.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("hr:remoteWork.addApprover")}
            </Button>
          </div>
        </div>

        {(approversQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("hr:remoteWork.noApprovers")}
          </p>
        ) : (
          <ul className="divide-y">
            {(approversQ.data ?? []).map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {approverName(a.approver_user_id)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.collaborator_id
                      ? `${t("hr:remoteWork.scopeFor")} ${nameOf(a.collaborator_id)}`
                      : t("hr:remoteWork.scopeGlobal")}{" "}
                    · {t("hr:remoteWork.priority")} {a.priority}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={a.active}
                    onCheckedChange={(v) =>
                      saveApprover.mutate({ id: a.id, active: v })
                    }
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteApprover.mutate(a.id)}
                    aria-label={t("common:delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}
