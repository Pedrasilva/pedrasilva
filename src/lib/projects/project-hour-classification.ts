/** Saved billable classification, independent of resource/rate availability. */
export function projectHourClassification(
  rows: readonly { stage_id: string; hours: number; billableHours: number; nonBillableHours: number }[] | undefined,
  stageIds: ReadonlySet<string> | null,
  history: { loggedHours: number; billableHours: number; nonBillableHours: number } | undefined,
) {
  if (!rows || !history) return { logged: NaN, billable: NaN, nonBillable: NaN };
  return rows.filter(r => !stageIds || stageIds.has(r.stage_id)).reduce((sum, r) => ({
    logged: sum.logged + r.hours,
    billable: sum.billable + r.billableHours,
    nonBillable: sum.nonBillable + r.nonBillableHours,
  }), stageIds ? { logged: 0, billable: 0, nonBillable: 0 } : {
    logged: history.loggedHours, billable: history.billableHours, nonBillable: history.nonBillableHours,
  });
}