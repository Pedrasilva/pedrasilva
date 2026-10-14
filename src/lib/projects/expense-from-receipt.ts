/**
 * Receipt → project expense. Shared by the single-add dialog and the
 * Despesas panel drop target: upload to benefit-receipts, OCR-read, create a
 * DRAFT pm_expenses row, route the receipt to Finance › Revisão (PRJ.EXP).
 * A failed read still leaves a draft with the receipt attached.
 */
import { supabase } from "@/integrations/supabase/client";
import { extractBenefitReceipt } from "@/lib/hr/benefit-ocr.functions";
import { routeProjectExpenseReceiptToQueue } from "@/lib/finance/project-expense-queue.functions";
import { cardLabel, type PaymentCard } from "@/lib/finance/use-payment-cards";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
import { normalizePortugueseNif } from "@/lib/finance/nif";
import type { ExpenseCategory } from "@/lib/projects/use-project-expenses";

export const CATEGORY_GUESS_MAP: Record<string, ExpenseCategory> = {
  "transporte": "transport", "transportes": "transport",
  "deslocação": "transport", "deslocações": "transport",
  "alojamento": "accommodation",
  "alimentação": "food", "refeição": "food", "refeições": "food",
  "impressão": "printing", "impressões": "printing",
};

export function mapCategoryGuess(g: string | null | undefined): ExpenseCategory | null {
  const k = (g ?? "").trim().toLowerCase();
  return k ? CATEGORY_GUESS_MAP[k] ?? null : null;
}

/** Exactly one active PSA card by last 4 / device number, else null. */
export function matchCardByLast4(cards: PaymentCard[], raw: string | null | undefined): PaymentCard | null {
  const last4 = (raw ?? "").replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) return null;
  const m = cards.filter(
    (c) => c.active && c.entity_id === PSA_ENTITY_ID &&
      (c.last4 === last4 || (c.device_last4 ?? []).some((d) => d.last4 === last4)),
  );
  return m.length === 1 ? m[0] : null;
}

export function receiptStoragePath(collaboratorId: string, projectId: string, fileName: string) {
  const ext = fileName.split(".").pop() ?? "bin";
  return `${collaboratorId}/project-expenses/${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
}

export type FromReceiptResult = { id: string; read: boolean };

export async function createProjectExpenseFromReceipt({ file, projectId, collaboratorId, cards }: {
  file: File; projectId: string; collaboratorId: string; cards: PaymentCard[];
}): Promise<FromReceiptResult> {
  const path = receiptStoragePath(collaboratorId, projectId, file.name);
  const up = await supabase.storage.from("benefit-receipts").upload(path, file, { upsert: false });
  if (up.error) throw up.error;

  const row: Record<string, unknown> = {
    project_id: projectId,
    description: file.name,
    category: "misc",
    status: "draft",
    purchase_price: 0,
    sale_price: 0,
    receipt_path: path,
    payment_source_type: "company_account",
  };
  let read = false;
  try {
    const r = await extractBenefitReceipt({ data: { storagePath: path } });
    if (r.ok && r.extracted) {
      read = true;
      const ex = r.extracted;
      const nif = ex.supplier_nif ? normalizePortugueseNif(ex.supplier_nif) : null;
      if (nif) row.supplier_nif = nif;
      if (ex.supplier_name) row.vendor = ex.supplier_name;
      if (ex.document_number) row.document_number = ex.document_number;
      if (ex.issue_date) { row.incurred_at = ex.issue_date; row.expense_date = ex.issue_date; }
      if (ex.total_amount != null) row.purchase_price = ex.total_amount;
      if (ex.amount_ex_vat != null) row.amount_ex_vat = ex.amount_ex_vat;
      if (ex.vat_amount != null) row.vat_amount = ex.vat_amount;
      if (ex.vat_rate != null) row.vat_rate = ex.vat_rate;
      const desc = [ex.supplier_name, ex.document_number].filter(Boolean).join(" · ");
      if (desc) row.description = desc;
      const cat = mapCategoryGuess(ex.category_guess);
      if (cat) row.category = cat;
      const card = matchCardByLast4(cards, ex.card_last4);
      if (card) {
        row.payment_source_type = "company_card";
        row.payment_card_id = card.id;
        row.payment_source_label = cardLabel(card, "—");
      } else if ((ex.payment_method ?? "").toLowerCase() === "cash") {
        row.payment_source_type = "cash";
      }
    }
  } catch {
    read = false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from("pm_expenses").insert(row).select("id").single();
  if (error) throw error;
  void routeProjectExpenseReceiptToQueue({ data: { expenseId: data.id } }).catch(() => undefined);
  return { id: data.id as string, read };
}
