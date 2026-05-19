/**
 * Stage 6C — Collaborator capacity engine.
 *
 * Capacity hours = FTE (pm_resources.weekly_capacity / 40)
 *                  × business days in window
 *                  × 8h
 *                  × target_chargeability (default 75%)
 *
 * Utilization = allocated / capacity.
 *
 * Pure: no DB writes.
 */
import { differenceInBusinessDays, parseISO } from "date-fns";
import type { CollaboratorCapacity, ResourceRow } from "./types";

export interface CapacityWindow {
  start: string; // YYYY-MM-DD
  end: string;
  /** Default 0.75. Override per-project once a chargeability target exists. */
  targetChargeability?: number;
}

export function computeResourceCapacity(
  resource: ResourceRow,
  allocatedHours: number,
  window: CapacityWindow,
): CollaboratorCapacity {
  const start = parseISO(window.start);
  const end = parseISO(window.end);
  const businessDays = Math.max(0, differenceInBusinessDays(end, start) + 1);
  const fte = (Number(resource.weekly_capacity) || 40) / 40;
  const chargeability = window.targetChargeability ?? 0.75;
  const capacity = +(businessDays * 8 * fte * chargeability).toFixed(2);
  const utilization = capacity > 0 ? (allocatedHours / capacity) * 100 : 0;

  return {
    resource_id: resource.id,
    collaborator_id: resource.collaborator_id,
    capacity_hours: capacity,
    allocated_hours: +allocatedHours.toFixed(2),
    utilization_pct: +utilization.toFixed(1),
    overloaded: capacity > 0 && allocatedHours > capacity,
  };
}

export function summarizeCapacity(rows: CollaboratorCapacity[]): {
  overloaded: number;
  underutilized: number;
  total: number;
  avg_utilization_pct: number;
} {
  const overloaded = rows.filter((r) => r.overloaded).length;
  const underutilized = rows.filter(
    (r) => r.capacity_hours > 0 && r.utilization_pct < 40,
  ).length;
  const avg =
    rows.length > 0
      ? rows.reduce((a, r) => a + r.utilization_pct, 0) / rows.length
      : 0;
  return {
    overloaded,
    underutilized,
    total: rows.length,
    avg_utilization_pct: +avg.toFixed(1),
  };
}
