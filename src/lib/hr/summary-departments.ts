/** Partition stored departments before translating their display labels. */
export function summaryDepartments<T extends { collab: { departamento: string } }>(rows: T[]) {
  return {
    projecto: rows.filter((row) => row.collab.departamento === "Projecto"),
    backoffice: rows.filter((row) => row.collab.departamento === "Backoffice"),
  };
}