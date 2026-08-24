import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import { toast } from "sonner";
import {
  PROJECT_TEAM_ROLES,
  useAddProjectTeamMember,
  useProjectTeam,
  useRemoveProjectTeamMember,
  type ProjectTeamRole,
} from "@/lib/projects/use-project-team";

type ResourceLite = {
  id: string;
  name: string;
  color?: string | null;
  collaborator_id?: string | null;
};

export function roleLabel(t: TFunction, role: ProjectTeamRole) {
  const fallback: Record<ProjectTeamRole, string> = {
    manager: "Manager",
    coordinator: "Coordinator",
    co_author: "Co-author",
    support: "Support",
  };
  return t(`projects:detail.teamRoles.${role}`, { defaultValue: fallback[role] });
}

export function ProjectTeamCard({
  projectId,
  resources,
  allocatedTeam,
}: {
  projectId: string;
  resources: ResourceLite[];
  allocatedTeam: ResourceLite[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState<string>("");
  const [role, setRole] = useState<ProjectTeamRole>("manager");

  const { data: members = [] } = useProjectTeam(projectId);
  const add = useAddProjectTeamMember();
  const remove = useRemoveProjectTeamMember();

  const byId = useMemo(() => {
    const map = new Map<string, ResourceLite>();
    [...resources, ...allocatedTeam].forEach((r) => map.set(r.id, r));
    return map;
  }, [resources, allocatedTeam]);

  const grouped = useMemo(
    () =>
      PROJECT_TEAM_ROLES.map((r) => ({
        role: r,
        people: members.filter((m) => m.role === r),
      })),
    [members],
  );

  async function handleAdd() {
    if (!resourceId) return;
    try {
      await add.mutateAsync({ project_id: projectId, resource_id: resourceId, role });
      setResourceId("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <div className="space-y-2">
        {members.length === 0 && allocatedTeam.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("projects:detail.sidebar.noTeam")}</div>
        ) : (
          <div className="space-y-1.5">
            {grouped
              .filter((g) => g.people.length > 0)
              .map((g) => (
                <div key={g.role} className="flex items-center gap-1.5">
                  <span className="w-[70px] shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {roleLabel(t, g.role)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {g.people.map((m) => {
                      const r = byId.get(m.resource_id);
                      return (
                        <CollaboratorAvatar
                          key={m.id}
                          collaboratorId={r?.collaborator_id ?? null}
                          name={r?.name ?? "?"}
                          color={r?.color ?? undefined}
                          size={22}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            {allocatedTeam.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1">
                <span className="w-[70px] shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("projects:detail.teamRoles.allocated", { defaultValue: "Allocated" })}
                </span>
                <div className="flex flex-wrap gap-1">
                  {allocatedTeam.map((r) => (
                    <CollaboratorAvatar
                      key={r.id}
                      collaboratorId={r.collaborator_id ?? null}
                      name={r.name}
                      color={r.color ?? undefined}
                      size={22}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[11px] text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("projects:detail.sidebar.manageTeam", { defaultValue: "Manage team" })}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("projects:detail.sidebar.manageTeam", { defaultValue: "Manage team" })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("projects:detail.sidebar.pickPerson", { defaultValue: "Pick a person" })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {resources.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[160px]">
                <Select value={role} onValueChange={(v) => setRole(v as ProjectTeamRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TEAM_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(t, r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={!resourceId || add.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                {t("common:actions.add", { defaultValue: "Add" })}
              </Button>
            </div>

            <div className="space-y-3">
              {grouped.map((g) => (
                <div key={g.role}>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {roleLabel(t, g.role)}
                  </div>
                  {g.people.length === 0 ? (
                    <div className="text-xs text-muted-foreground">—</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {g.people.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
                        >
                          {byId.get(m.resource_id)?.name ?? "?"}
                          <button
                            type="button"
                            onClick={() => remove.mutate({ id: m.id, project_id: projectId })}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
