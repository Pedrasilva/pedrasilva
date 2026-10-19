export type ApprovalKind = "leave" | "change" | "remote";
export type ApprovalRow = {
  id: string; kind: ApprovalKind; collaboratorId: string; collaborator: string;
  type: string; start: string; end: string; days: number; notes: string | null;
  attachment: string | null; submitted: string; status: string;
  canDecide: boolean; canApprove: boolean; blockReason: string | null;
  balance: number | null; decidedAt: string | null; decidedBy: string | null;
  requestId: string; changeKind?: string; period?: string;
};
export function pendingApprovals(rows: ApprovalRow[]) {
  return rows.filter(r => r.status === "pendente").sort((a,b) => a.submitted.localeCompare(b.submitted) || a.id.localeCompare(b.id));
}
export function pendingByCollaborator(rows: ApprovalRow[]) {
  const counts: Record<string, number> = {};
  for (const row of pendingApprovals(rows)) counts[row.collaboratorId] = (counts[row.collaboratorId] ?? 0) + 1;
  return counts;
}
export function leaveBalance(person: {dias_ferias_anuais: number | null; saldo_ferias_anterior: number | null; dias_ferias_extra: number | null}, rows: {tipo: string; estado: string; data_inicio: string; dias_uteis: number | null}[], year: number) {
  return (person.dias_ferias_anuais ?? 0) + (person.saldo_ferias_anterior ?? 0) + (person.dias_ferias_extra ?? 0) - rows.filter(r => r.tipo === "ferias" && ["pendente","aprovada"].includes(r.estado) && Number(r.data_inicio.slice(0,4)) === year).reduce((n,r) => n + (r.dias_uteis ?? 0),0);
}