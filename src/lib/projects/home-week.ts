import { dailyHours, deriveSlots, weekDays, type BoardData, type BoardLeave, type DerivedSlot } from "./week-board";
import { formatStageLabel, numberStages } from "../quotes/stage-numbering";

export type HomeWeekSlot = { project: string; stage: string; siteVisit: boolean };
export type HomeWeekDay = { day: string; am: HomeWeekSlot | null; pm: HomeWeekSlot | null; nonWorking: BoardLeave[] };

export function homeWeekAccess(staff: boolean, loading: boolean, admin: boolean, canPlanAll: boolean) {
  return { visible: staff, planner: staff && !loading && (admin || canPlanAll) };
}

export function nextWeekStatus(data: Pick<BoardData, "plan">): "noDraft" | "draft" | "approved" {
  return data.plan?.status === "approved" ? "approved" : data.plan?.status === "draft" ? "draft" : "noDraft";
}

/** A revision draft never replaces the approved allocation-based personal plan. */
export function personalHomeWeek(data: BoardData, week: string): { approved: boolean; days: HomeWeekDay[] } {
  const approved = data.plan?.status === "approved" || Boolean(data.plan?.approved_at);
  const resources = data.resources.filter(r => data.my_collaborator_id !== null && r.collaborator_id === data.my_collaborator_id);
  const ownIds = new Set(resources.map(r => r.id));
  const leave = data.leave.filter(l => ownIds.has(l.resource_id));
  const tree = data.stage_tree ?? data.stages;
  const stageLabels = new Map(data.projects.flatMap(p => numberStages(tree.filter(s => s.project_id === p.id))).map(n => [n.stage.id, formatStageLabel(n.stage, n.number)]));
  const derived = deriveSlots(approved ? data.allocations.filter(a => ownIds.has(a.resource_id)) : [], week, Object.fromEntries(resources.map(r => [r.id, dailyHours(r)])), leave, tree);
  const slot = (s: DerivedSlot | null | undefined): HomeWeekSlot | null => s ? {
    project: data.projects.find(p => p.id === s.projectId)?.name ?? "—",
    stage: s.stageId ? stageLabels.get(s.stageId) ?? "—" : "—",
    siteVisit: s.isSiteVisit,
  } : null;
  return { approved, days: weekDays(week).map(day => {
    const nonWorking = leave.filter(l => l.day === day).filter((l, i, all) => all.findIndex(v => v.kind === l.kind && v.name === l.name) === i);
    return { day, nonWorking, am: nonWorking.length ? null : slot(resources.map(r => derived[r.id]?.[day]?.am).find(Boolean)), pm: nonWorking.length ? null : slot(resources.map(r => derived[r.id]?.[day]?.pm).find(Boolean)) };
  }) };
}