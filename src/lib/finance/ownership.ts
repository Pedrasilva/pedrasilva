/**
 * Financial ownership model — single source of truth.
 *
 * Every financial record belongs to EITHER a project OR the company, never
 * both. These helpers are the canonical place to express that rule in code so
 * UI and hooks can reference one definition.
 */

export type FinancialOwner =
  | { kind: "project"; projectId: string }
  | { kind: "company" };

/** True when a record has no `project_id` and therefore belongs to the company. */
export function isCompanyExpense<T extends { project_id?: string | null }>(
  record: T,
): boolean {
  return !record.project_id;
}

/**
 * Guard for write paths on project-owned financial tables. Throws a clear
 * error if `project_id` is missing — preventing silent inserts that would
 * otherwise be rejected by the database NOT NULL constraint with a less
 * helpful message.
 */
export function assertProjectOwned(projectId: string | null | undefined): asserts projectId is string {
  if (!projectId) {
    throw new Error(
      "Project financial record requires a project_id. Use company_expenses for generic company costs.",
    );
  }
}
