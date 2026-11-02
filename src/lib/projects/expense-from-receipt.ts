/**
 * Receipt → project expense. Shared by the single-add dialog and the
 * Despesas panel drop target: upload to benefit-receipts, OCR-read, create a
 * DRAFT pm_expenses row, route the receipt to Finance › Revisão (PRJ.EXP).
 * A failed read still leaves a draft with the receipt attached.
 */
import { type PaymentCard } from "@/lib/finance/use-payment-cards";
import { PSA_ENTITY_ID } from "@/lib/finance/entity";
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

