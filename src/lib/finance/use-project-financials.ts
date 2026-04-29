/**
 * Project ↔ Finance integration (read-only aggregation).
 *
 * Builds project profitability from `financial_documents`,
 * `financial_document_lines`, and `financial_document_payments`.
 *
 * Cost classifications considered "project-attributable":
 *   - PRD.*          (procurement / direct project costs)
 *   - OPS.REP.*      (representation / travel)
 *   - REIM.*         (reimbursable scaffolding)
 *
 * A line is attributed to a project when either:
 *   - line.project_id is set, OR
 *   - line.project_id is null AND its document's project_id is set.
 *
 * Documents in `draft` or `cancelled` are excluded.
 *
 * Bank transactions are NEVER read here; cash truth comes from
 * `financial_document_payments` only.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProjectFinancialSummary = {
  project_id: string;
  project_name: string | null;
  /** Sum of cost lines (ex VAT) attributed to this project. */
  total_cost: number;
  /** Sum of issued document subtotals (ex VAT) linked to this project. */
  total_billed: number;
  /** Sum of payments received against issued docs for this project. */
  total_received: number;
  /** Sum of payments made against received docs for this project. */
  total_paid: number;
  /** total_billed - total_cost. */
  margin: number;
  /** total_received - total_paid. */
  cash_position: number;
  /** Reimbursable breakdown. */
  reimbursable_cost: number;
  reimbursable_billed: number;
  reimbursable_received: number;
  /** reimbursable_cost - reimbursable_billed (positive = unbilled). */
  reimbursable_unbilled: number;
  /** reimbursable_billed - reimbursable_received (positive = unpaid). */
  reimbursable_unpaid: number;
};

const COST_PREFIXES = ["PRD.", "OPS.REP.", "REIM."] as const;

function isProjectCostCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return COST_PREFIXES.some((p) => code.startsWith(p));
}

type LineRow = {
  document_id: string;
  project_id: string | null;
  amount_ex_vat: number | null;
  reimbursable: boolean;
  classification: { code: string | null } | null;
};

type DocRow = {
  id: string;
  direction: "issued" | "received";
  status: string;
  project_id: string | null;
  subtotal_ex_vat: number | null;
};

type PaymentRow = {
  document_id: string;
  amount: number;
};

/**
 * Aggregates finance data into per-project summaries.
 * Filter to a single project by passing `projectId`.
 */
export function useProjectFinancialSummary(projectId?: string | null) {
  return useQuery({
    queryKey: ["project-financial-summary", projectId ?? "all"],
    queryFn: async (): Promise<ProjectFinancialSummary[]> => {
      // 1. Documents (header-level project link, billed totals, status filter)
      let docsQ = supabase
        .from("financial_documents")
        .select("id, direction, status, project_id, subtotal_ex_vat")
        .not("status", "in", "(draft,cancelled)");
      if (projectId) docsQ = docsQ.eq("project_id", projectId);
      const docsRes = await docsQ;
      if (docsRes.error) throw docsRes.error;
      const docs = (docsRes.data ?? []) as DocRow[];

      // 2. Lines for those documents (cost attribution + reimbursable split)
      const docIds = docs.map((d) => d.id);
      let lines: LineRow[] = [];
      if (docIds.length > 0) {
        const { data, error } = await supabase
          .from("financial_document_lines")
          .select(
            "document_id, project_id, amount_ex_vat, reimbursable, classification:financial_classifications(code)",
          )
          .in("document_id", docIds);
        if (error) throw error;
        lines = (data ?? []) as unknown as LineRow[];
      }

      // 3. Payments for those documents (cash truth)
      let payments: PaymentRow[] = [];
      if (docIds.length > 0) {
        const { data, error } = await supabase
          .from("financial_document_payments")
          .select("document_id, amount")
          .in("document_id", docIds);
        if (error) throw error;
        payments = (data ?? []) as PaymentRow[];
      }

      // 4. Project names
      const projectIdSet = new Set<string>();
      docs.forEach((d) => d.project_id && projectIdSet.add(d.project_id));
      lines.forEach((l) => l.project_id && projectIdSet.add(l.project_id));
      let projectNames = new Map<string, string>();
      if (projectIdSet.size > 0) {
        const { data, error } = await supabase
          .from("pm_projects")
          .select("id, name")
          .in("id", Array.from(projectIdSet));
        if (error) throw error;
        (data ?? []).forEach((p: { id: string; name: string }) =>
          projectNames.set(p.id, p.name),
        );
      }

      // 5. Index helpers
      const docsById = new Map<string, DocRow>();
      docs.forEach((d) => docsById.set(d.id, d));

      const acc = new Map<string, ProjectFinancialSummary>();
      const ensure = (pid: string): ProjectFinancialSummary => {
        let row = acc.get(pid);
        if (!row) {
          row = {
            project_id: pid,
            project_name: projectNames.get(pid) ?? null,
            total_cost: 0,
            total_billed: 0,
            total_received: 0,
            total_paid: 0,
            margin: 0,
            cash_position: 0,
            reimbursable_cost: 0,
            reimbursable_billed: 0,
            reimbursable_received: 0,
            reimbursable_unbilled: 0,
            reimbursable_unpaid: 0,
          };
          acc.set(pid, row);
        }
        return row;
      };

      // 6. Costs from lines (received docs only, project-cost codes)
      for (const l of lines) {
        const doc = docsById.get(l.document_id);
        if (!doc) continue;
        if (doc.direction !== "received") continue;
        if (!isProjectCostCode(l.classification?.code)) continue;
        const pid = l.project_id ?? doc.project_id;
        if (!pid) continue;
        if (projectId && pid !== projectId) continue;
        const row = ensure(pid);
        const amt = Number(l.amount_ex_vat ?? 0);
        row.total_cost += amt;
        if (l.reimbursable) row.reimbursable_cost += amt;
      }

      // 7. Billed totals from issued doc headers
      for (const d of docs) {
        if (d.direction !== "issued") continue;
        if (!d.project_id) continue;
        const row = ensure(d.project_id);
        row.total_billed += Number(d.subtotal_ex_vat ?? 0);
      }

      // 7b. Reimbursable billed: sum issued lines flagged reimbursable
      for (const l of lines) {
        if (!l.reimbursable) continue;
        const doc = docsById.get(l.document_id);
        if (!doc) continue;
        if (doc.direction !== "issued") continue;
        const pid = l.project_id ?? doc.project_id;
        if (!pid) continue;
        if (projectId && pid !== projectId) continue;
        const row = ensure(pid);
        row.reimbursable_billed += Number(l.amount_ex_vat ?? 0);
      }

      // 8. Cash from payments — split by direction of the parent doc.
      // Reimbursable received is approximated proportionally to the doc's
      // reimbursable share of subtotal.
      const reimbShareByDoc = new Map<string, number>();
      for (const l of lines) {
        if (!l.reimbursable) continue;
        const cur = reimbShareByDoc.get(l.document_id) ?? 0;
        reimbShareByDoc.set(l.document_id, cur + Number(l.amount_ex_vat ?? 0));
      }

      for (const p of payments) {
        const doc = docsById.get(p.document_id);
        if (!doc || !doc.project_id) continue;
        const row = ensure(doc.project_id);
        const amt = Number(p.amount ?? 0);
        if (doc.direction === "issued") {
          row.total_received += amt;
          const reimb = reimbShareByDoc.get(doc.id) ?? 0;
          const sub = Number(doc.subtotal_ex_vat ?? 0);
          if (reimb > 0 && sub > 0) {
            row.reimbursable_received += amt * (reimb / sub);
          }
        } else {
          row.total_paid += amt;
        }
      }

      // 9. Derived totals
      for (const row of acc.values()) {
        row.margin = row.total_billed - row.total_cost;
        row.cash_position = row.total_received - row.total_paid;
        row.reimbursable_unbilled =
          row.reimbursable_cost - row.reimbursable_billed;
        row.reimbursable_unpaid =
          row.reimbursable_billed - row.reimbursable_received;
      }

      const result = Array.from(acc.values()).sort((a, b) =>
        (a.project_name ?? "").localeCompare(b.project_name ?? ""),
      );
      return result;
    },
  });
}
