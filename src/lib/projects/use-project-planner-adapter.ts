/**
 * Project-mode planner adapter — wraps the existing pm_* hooks and exposes
 * them through the PlannerAdapter contract so GanttChart, AllocationEditor,
 * and StageDependencyEditor stay mode-agnostic.
 */
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

export function useProjectPlannerAdapter(resources: Resource[]): PlannerAdapter {
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

  return {
    mode: "project",
    dependencies: (deps ?? []) as StageDependency[],
    defaultRates,
    resources,
    updateStage: (a) => updateStageCascade.mutateAsync(a),
    deleteStage: (a) => deleteStage.mutateAsync(a),
    createAllocation: (a) => createAlloc.mutateAsync(a),
    updateAllocation: (a) => updateAlloc.mutateAsync(a),
    deleteAllocation: (a) => deleteAlloc.mutateAsync(a),
    setAllocationStatus: (a) => setStatusMut.mutateAsync(a),
    createDependency: (a) =>
      createDep.mutateAsync({
        predecessor_id: a.predecessor_id,
        successor_id: a.successor_id,
        type: a.type,
        lag_days: a.lag_days,
      }),
    updateDependency: (a) => updateDep.mutateAsync(a),
    deleteDependency: (id) => deleteDep.mutateAsync(id),
    pending: {
      stage: updateStageCascade.isPending || deleteStage.isPending,
      allocation: updateAlloc.isPending || createAlloc.isPending || deleteAlloc.isPending,
      dependency: createDep.isPending || updateDep.isPending || deleteDep.isPending,
    },
    features: PROJECT_FEATURES,
  };
}
