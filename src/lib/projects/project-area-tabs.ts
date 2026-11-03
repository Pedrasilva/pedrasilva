export type ProjectArea = 'financials' | 'budget_cost' | 'expenses' | 'supplier_fees';
export type ProjectViewerAreas = { active: boolean } & Record<ProjectArea, boolean>;
const TAB_AREAS: Record<string, ProjectArea[]> = {
  billing: ['financials'], financial: ['financials'], architecture: ['financials'], incoming: ['financials'],
  financialSummary: ['financials'], paymentSchedule: ['financials', 'supplier_fees'],
  expenses: ['expenses'], consultants: ['supplier_fees'], outgoing: ['supplier_fees'], materials: ['supplier_fees'],
  rates: ['budget_cost'], insights: ['budget_cost'], ap: ['budget_cost'],
};
export function canOpenProjectTab(tab: string, access?: ProjectViewerAreas) {
  if (!access) return !TAB_AREAS[tab];
  if (!access.active) return true;
  return (TAB_AREAS[tab] ?? []).every(area => access[area]);
}