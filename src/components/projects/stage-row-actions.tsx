/**
 * Interactive row controls for the project Overview "Milestones & Tasks"
 * table: stage status switching (planned / active / done / cancelled),
 * assigning a responsible resource to a stage, and removing allocations.
 */
import { useState } from "react";
import { MoreVertical, Pencil, UserPlus, Trash2, Check, ListPlus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateStageTaskDialog } from "@/components/projects/create-stage-task-dialog";
import {
  useCreateAllocation,
  useDeleteAllocation,
  useResources,
  useUpdateStage,
} from "@/lib/projects/use-planner";
import { cn } from "@/lib/utils";


export type StageStatus = "planned" | "active" | "done" | "cancelled";

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  planned: "Planned",
  active: "Active",
  done: "Concluded",
  cancelled: "Cancelled",
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
  const updateStage = useUpdateStage();

  const set = (next: StageStatus) => {
    if (next === status) return;
    updateStage.mutate(
      { id: stageId, projectId, patch: { status: next } },
      {
        onSuccess: () => toast.success(`Status: ${STAGE_STATUS_LABEL[next]}`),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className={cn("inline-block h-2 w-2 rounded-full", DOT[status])} />
        <span className={TEXT[status]}>{STAGE_STATUS_LABEL[status]}</span>
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
          <span className={TEXT[status]}>{STAGE_STATUS_LABEL[status]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel className="text-[11px]">Stage status</DropdownMenuLabel>
        {(["planned", "active", "done", "cancelled"] as const).map((s) => (
          <DropdownMenuItem key={s} onSelect={() => set(s)} className="text-xs">
            <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", DOT[s])} />
            {STAGE_STATUS_LABEL[s]}
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
  assignedResourceIds,
  onEdit,
}: {
  stageId: string;
  projectId: string;
  status: StageStatus;
  startDate: string;
  endDate: string;
  stageName?: string;
  assignedResourceIds: string[];
  onEdit?: () => void;
}) {
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
        onSuccess: () => toast.success("Resource assigned to stage"),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );
  };

  const setStatus = (next: StageStatus) =>
    updateStage.mutate(
      { id: stageId, projectId, patch: { status: next } },
      {
        onSuccess: () => toast.success(`Status: ${STAGE_STATUS_LABEL[next]}`),
        onError: (e: unknown) => toast.error((e as Error).message),
      },
    );

  return (
    <div className="inline-flex items-center gap-1 text-muted-foreground">
      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 hover:bg-accent hover:text-foreground"
        aria-label="Editar"
        title="Edit plan"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
            aria-label="Atribuir"
            title="Assign responsible"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
          <DropdownMenuLabel className="text-[11px]">Assign responsible</DropdownMenuLabel>
          {active.length === 0 && (
            <DropdownMenuItem disabled className="text-xs">
              No resources
            </DropdownMenuItem>
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
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
            aria-label="Mais"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-[11px]">Stage status</DropdownMenuLabel>
          {(["planned", "active", "done", "cancelled"] as const).map((s) => (
            <DropdownMenuItem key={s} onSelect={() => setStatus(s)} className="text-xs">
              <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", DOT[s])} />
              {STAGE_STATUS_LABEL[s]}
              {s === status && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTaskOpen(true)} className="text-xs">
            <ListPlus className="mr-2 h-3.5 w-3.5" /> Add task
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit?.()} className="text-xs">
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit plan
          </DropdownMenuItem>
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
      />
    </div>
  );
}


/** Kebab controls on an allocation (resource) row. */
export function AllocationRowActions({
  allocationId,
  projectId,
  onEdit,
}: {
  allocationId: string;
  projectId: string;
  onEdit?: () => void;
}) {
  const deleteAllocation = useDeleteAllocation();

  return (
    <div className="inline-flex items-center gap-1 text-muted-foreground">
      <button
        type="button"
        onClick={onEdit}
        className="rounded p-1 hover:bg-accent hover:text-foreground"
        aria-label="Editar"
        title="Edit plan"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent hover:text-foreground"
            aria-label="Mais"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => onEdit?.()} className="text-xs">
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit plan
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-destructive focus:text-destructive"
            disabled={deleteAllocation.isPending}
            onSelect={() =>
              deleteAllocation.mutate(
                { id: allocationId, projectId },
                {
                  onSuccess: () => toast.success("Allocation removed"),
                  onError: (e: unknown) => toast.error((e as Error).message),
                },
              )
            }
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove allocation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
