import i18n from "@/i18n/index";
/**
 * Interactive row controls for the project Overview "Milestones & Tasks"
 * table: stage status switching (planned / active / done / cancelled),
 * assigning a responsible resource to a stage, and removing allocations.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MoreVertical, Pencil, UserPlus, Trash2, Check, ListPlus } from "lucide-react";
import { toast } from '@/lib/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CreateStageTaskDialog,
  type StageTaskDialogStage,
} from "@/components/projects/create-stage-task-dialog";
import {
  useCreateAllocation,
  useDeleteAllocation,
  useResources,
  useUpdateStage,
} from "@/lib/projects/use-planner";
import { cn } from "@/lib/utils";
import { AllocationRemoveDialog } from "./allocation-remove-dialog";


export type StageStatus = "planned" | "active" | "done" | "cancelled";

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  planned: "common:planned",
  active: "common:active",
  done: "common:done",
  cancelled: "common:cancelled",
};

const DOT: Record<StageStatus, string> = {
  planned: "bg-muted-foreground/40",
  active: "bg-emerald-500",
  done: "bg-sky-500",
  cancelled: "bg-destructive",
};

const TEXT: Record<StageStatus, string> = {
  planned: "text-muted-foreground",
  active: "text-emerald-700 dark:text-emerald-400",
  done: "text-sky-700 dark:text-sky-400",
  cancelled: "text-destructive",
};

export function normalizeStageStatus(raw: unknown): StageStatus {
  return raw === "active" || raw === "done" || raw === "cancelled" ? raw : "planned";
}

/** Clickable status pill that writes pm_stages.status. */
export function StageStatusCell({
  stageId,
  projectId,
  status,
  disabled,
}: {
  stageId: string;
  projectId: string;
  status: StageStatus;
  disabled?: boolean;
}) {
  useTranslation();
  const updateStage = useUpdateStage();

  const set = (next: StageStatus) => {
    if (next === status) return;
    updateStage.mutate(
      { id: stageId, projectId, patch: { status: next } },
      {
        onSuccess: () => toast.success(i18n.t("projects:stageRowActions.ui.statusValue", { value1: i18n.t(STAGE_STATUS_LABEL[next]) })),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className={cn("inline-block h-2 w-2 rounded-full", DOT[status])} />
        <span className={TEXT[status]}>{i18n.t(STAGE_STATUS_LABEL[status])}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={updateStage.isPending}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          <span className={cn("inline-block h-2 w-2 rounded-full", DOT[status])} />
          <span className={TEXT[status]}>{i18n.t(STAGE_STATUS_LABEL[status])}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel className="text-[11px]"> {i18n.t("projects:stageRowActions.ui.stageStatus")} </DropdownMenuLabel>
        {(["planned", "active", "done", "cancelled"] as const).map((s) => (
          <DropdownMenuItem key={s} onSelect={() => set(s)} className="text-xs">
            <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", DOT[s])} />
            {i18n.t(STAGE_STATUS_LABEL[s])}
            {s === status && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Pencil / assign / kebab controls on a stage row. */
export function StageRowActions({
  stageId,
  projectId,
  status,
  startDate,
  endDate,
  stageName,
  stage,
  assignedResourceIds,
  onEdit,
  isSupplier = false,
}: {
  stageId: string;
  projectId: string;
  status: StageStatus;
  startDate: string;
  endDate: string;
  stageName?: string;
  /** Parent stage envelope context for the task dialog. */
  stage?: StageTaskDialogStage;
  assignedResourceIds: string[];
  onEdit?: () => void;
  /** Supplier/consultant stage: PSA staff cannot be assigned. */
  isSupplier?: boolean;
}) {
  useTranslation();
  const { data: resources } = useResources();
  const createAllocation = useCreateAllocation();
  const updateStage = useUpdateStage();
  const [taskOpen, setTaskOpen] = useState(false);


  const assigned = new Set(assignedResourceIds);
  const active = (resources ?? []).filter((r) => r.active !== false);

  const assign = (resourceId: string) => {
    createAllocation.mutate(
      {
        stage_id: stageId,
        resource_id: resourceId,
        start_date: startDate,
        end_date: endDate,
        hours_per_day: 8,
        projectId,
      },
      {
        onSuccess: () => toast.success(i18n.t("projects:stageRowActions.ui.resourceAssignedToStage")),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const setStatus = (next: StageStatus) =>
    updateStage.mutate(
      { id: stageId, projectId, patch: { status: next } },
      {
        onSuccess: () => toast.success(i18n.t("projects:stageRowActions.ui.statusValueLabel", { value1: i18n.t(STAGE_STATUS_LABEL[next]) })),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );

  return (
    <div className="inline-flex items-center gap-1 text-muted-foreground">
      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 hover:bg-accent hover:text-foreground"
        aria-label={i18n.t("common:edit")}
        title={i18n.t("projects:detail.ui.editPlan")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {!isSupplier && <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
            aria-label={i18n.t("projects:stageRowActions.ui.assign")}
            title={i18n.t("common:myActions.ownerPlaceholder")}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuLabel className="text-[11px]"> {i18n.t("common:myActions.ownerPlaceholder")} </DropdownMenuLabel>
          {active.length === 0 && (
            <DropdownMenuItem disabled className="text-xs">
               {i18n.t("projects:stageRowActions.ui.noResources")} </DropdownMenuItem>
          )}
          {active.map((r) => (
            <DropdownMenuItem
              key={r.id}
              disabled={assigned.has(r.id) || createAllocation.isPending}
              onSelect={() => assign(r.id)}
              className="text-xs"
            >
              <span
                className="mr-2 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: r.color ?? undefined }}
              />
              <span className="truncate">{r.name}</span>
              {assigned.has(r.id) && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
            aria-label={i18n.t("common:more")}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-[11px]"> {i18n.t("projects:stageRowActions.ui.stageStatus")} </DropdownMenuLabel>
          {(["planned", "active", "done", "cancelled"] as const).map((s) => (
            <DropdownMenuItem key={s} onSelect={() => setStatus(s)} className="text-xs">
              <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", DOT[s])} />
              {i18n.t(STAGE_STATUS_LABEL[s])}
              {s === status && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTaskOpen(true)} className="text-xs">
            <ListPlus className="mr-2 h-3.5 w-3.5" />  {i18n.t("projects:detail.ui.addTask")} </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit?.()} className="text-xs">
            <Pencil className="mr-2 h-3.5 w-3.5" />  {i18n.t("projects:detail.ui.editPlan")} </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateStageTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        stageId={stageId}
        projectId={projectId}
        stageName={stageName}
        stageStart={startDate}
        stageEnd={endDate}
        stage={stage}
      />
    </div>
  );
}


/** Kebab controls on an allocation (resource) row. */
export function AllocationRowActions({
  allocationId,
  projectId,
  onEdit,
  onEditTask,
  resourceName,
}: {
  allocationId: string;
  projectId: string;
  onEdit?: () => void;
  /** Opens the task dialog in edit mode (same form as Add task). */
  onEditTask?: () => void;
  resourceName?: string;
}) {
  const deleteAllocation = useDeleteAllocation();
  const [removing, setRemoving] = useState(false);
  const { t } = useTranslation("projects");

  return (
    <div className="inline-flex items-center gap-1 text-muted-foreground">
      <button
        type="button"
        onClick={onEditTask ?? onEdit}
        className="rounded p-1 hover:bg-accent hover:text-foreground"
        aria-label={i18n.t("common:edit")}
        title={onEditTask ? i18n.t("projects:stageRowActions.ui.editTask") : i18n.t("projects:detail.ui.editPlan")}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
            aria-label={i18n.t("common:more")}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onEditTask && (
            <DropdownMenuItem onSelect={() => onEditTask()} className="text-xs">
              <Pencil className="mr-2 h-3.5 w-3.5" />  {i18n.t("projects:stageRowActions.ui.editTask")} </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onEdit?.()} className="text-xs">
            <Pencil className="mr-2 h-3.5 w-3.5" />  {i18n.t("projects:detail.ui.editPlan")} </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-destructive focus:text-destructive"
            disabled={deleteAllocation.isPending}
            onSelect={() => setRemoving(true)}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("historySafety.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AllocationRemoveDialog open={removing} onOpenChange={setRemoving} allocationId={allocationId} name={resourceName ?? ""} onRemove={(mode) => deleteAllocation.mutateAsync({ id: allocationId, projectId, mode })} />
    </div>
  );
}
