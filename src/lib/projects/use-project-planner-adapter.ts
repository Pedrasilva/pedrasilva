/**
 * Project-mode planner adapter — wraps the existing pm_* hooks and exposes
 * them through the PlannerAdapter contract so GanttChart, AllocationEditor,
 * and StageDependencyEditor stay mode-agnostic.
 *
 * Read-only mode: pass `{ readOnly: true }` to short-circuit every mutation
 * with a single toast. Used to gate non-admins out of editing the project
 * Gantt while still letting them view it. The actual security boundary is
 * RLS on the server; this is a UX guard so non-admins don't see edit
 * affordances that would always fail.
 */
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useCreateAllocation,
  useUpdateAllocation,
  useDeleteAllocation,
  useSetAllocationStatus,
  useUpdateStageWithCascade,
  useDeleteStage,
  useStageDependencies,
  useCreateDependency,
  useUpdateDependency,
  useDeleteDependency,
} from "@/lib/projects/use-planner";
import { useDefaultResourceRates } from "@/lib/projects/use-default-rates";
import type { Resource } from "@/lib/projects/types";
import type { StageDependency } from "@/lib/projects/dependencies";
import {
  PROJECT_FEATURES,
  type PlannerAdapter,
} from "@/lib/projects/planner-adapter";

export interface ProjectPlannerAdapterOptions {
  /** When true, all mutation methods become no-ops that toast a notice. */
  readOnly?: boolean;
}

export function useProjectPlannerAdapter(
  resources: Resource[],
  opts: ProjectPlannerAdapterOptions = {},
): PlannerAdapter {
  const { t } = useTranslation(["projects"]);
  const updateAlloc = useUpdateAllocation();
  const createAlloc = useCreateAllocation();
  const deleteAlloc = useDeleteAllocation();
  const setStatusMut = useSetAllocationStatus();
  const updateStageCascade = useUpdateStageWithCascade();
  const deleteStage = useDeleteStage();
  const { data: deps } = useStageDependencies();
  const createDep = useCreateDependency();
  const updateDep = useUpdateDependency();
  const deleteDep = useDeleteDependency();
  const { data: defaultRates } = useDefaultResourceRates();

  const readOnly = !!opts.readOnly;

  // Single shared denial path — toast once, return a resolved no-op so the
  // optimistic-update sites in GanttChart don't enter an error branch.
  let lastDenied = 0;
  const deny = async () => {
    const now = Date.now();
    if (now - lastDenied > 1500) {
      lastDenied = now;
      toast.error(
        t("projects:gantt.readOnly.adminOnly", {
          defaultValue: "Only admins can edit the project plan.",
        }),
      );
    }
    return null;
  };

  return {
    mode: "project",
    dependencies: (deps ?? []) as StageDependency[],
    defaultRates,
    resources,
    updateStage: readOnly
      ? deny
      : async (a) => {
          const res = await updateStageCascade.mutateAsync(a);
          if (res?.dependentCount > 0) {
            toast.success(
              t("projects:gantt.dependency.cascadeToast", { count: res.dependentCount }),
            );
          }
          return res;
        },
    deleteStage: readOnly ? deny : (a) => deleteStage.mutateAsync(a),
    // Allocation mutations are NOT gated by the admin read-only flag —
    // RLS on pm_allocations allows each user to manage their OWN allocation
    // (needed for timesheet self-staffing and editing % / hours per day).
    // Cross-resource edits fail at the DB and surface as an error toast.
    createAllocation: (a) => createAlloc.mutateAsync(a),
    updateAllocation: (a) => updateAlloc.mutateAsync(a),
    deleteAllocation: (a) => deleteAlloc.mutateAsync(a),
    setAllocationStatus: (a) => setStatusMut.mutateAsync(a),

    createDependency: readOnly
      ? deny
      : (a) =>
          createDep.mutateAsync({
            predecessor_id: a.predecessor_id,
            successor_id: a.successor_id,
            type: a.type,
            lag_days: a.lag_days,
          }),
    updateDependency: readOnly ? deny : (a) => updateDep.mutateAsync(a),
    deleteDependency: readOnly ? deny : (id) => deleteDep.mutateAsync(id),
    pending: {
      stage: updateStageCascade.isPending || deleteStage.isPending,
      allocation: updateAlloc.isPending || createAlloc.isPending || deleteAlloc.isPending,
      dependency: createDep.isPending || updateDep.isPending || deleteDep.isPending,
    },
    features: PROJECT_FEATURES,
  };
}

