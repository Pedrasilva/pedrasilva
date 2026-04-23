/**
 * Zod schemas + lightweight per-field validators for the External Service and
 * Project Expense dialogs. Kept framework-free so the same rules can run in
 * the dialog (inline) and in unit tests.
 *
 * Notes on date handling:
 *   The dialogs bind <input type="date"> directly, so values arrive as
 *   "YYYY-MM-DD" strings (or "" when empty). We accept empty strings as
 *   "absent" and only reject genuinely malformed dates.
 */

import { z } from "zod";

// -- shared helpers -------------------------------------------------------

/** True when `s` is empty OR a parseable YYYY-MM-DD date. */
export function isOptionalIsoDate(s: unknown): boolean {
  if (s === undefined || s === null || s === "") return true;
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

const optionalIsoDate = z
  .string()
  .refine(isOptionalIsoDate, { message: "invalidDate" })
  .or(z.literal(""))
  .or(z.null())
  .optional();

const nonNegativeNumber = z
  .number({ invalid_type_error: "mustBeNumber" })
  .refine((n) => Number.isFinite(n), { message: "mustBeNumber" })
  .refine((n) => n >= 0, { message: "mustBeNonNegative" });

// -- external services ----------------------------------------------------

export const EXTERNAL_SERVICE_STATUSES = [
  "draft",
  "approved",
  "ordered",
  "invoiced",
  "partially_paid",
  "paid",
  "cancelled",
] as const;

export const MARKUP_TYPES = ["percent", "fixed"] as const;

export const externalServiceSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, { message: "descriptionRequired" })
      .max(500, { message: "descriptionTooLong" }),
    quantity: z
      .number({ invalid_type_error: "mustBeNumber" })
      .refine((n) => Number.isFinite(n), { message: "mustBeNumber" })
      .refine((n) => n > 0, { message: "quantityMustBePositive" }),
    unit_cost: nonNegativeNumber,
    markup_type: z.enum(MARKUP_TYPES),
    markup_value: nonNegativeNumber,
    sale_price_manual: z.boolean(),
    manual_sale_price: nonNegativeNumber,
    status: z.enum(EXTERNAL_SERVICE_STATUSES),
    invoice_date: optionalIsoDate,
    due_date: optionalIsoDate,
    paid_at: optionalIsoDate,
  })
  .superRefine((val, ctx) => {
    // If pricing is automatic, manual_sale_price is irrelevant — the DB
    // trigger derives sale_price from cost + markup. We don't reject a
    // non-zero value, we simply ignore it (handled in the dialog payload).
    if (val.sale_price_manual && val.manual_sale_price < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manual_sale_price"],
        message: "mustBeNonNegative",
      });
    }
  });

export type ExternalServiceFormInput = z.infer<typeof externalServiceSchema>;

// -- expenses -------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  "travel",
  "accommodation",
  "food",
  "transport",
  "printing",
  "misc",
] as const;

export const EXPENSE_STATUSES = ["draft", "submitted", "approved", "paid"] as const;

export const projectExpenseSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, { message: "descriptionRequired" })
    .max(500, { message: "descriptionTooLong" }),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: nonNegativeNumber,
  incurred_at: optionalIsoDate,
  paid_at: optionalIsoDate,
  status: z.enum(EXPENSE_STATUSES),
  rebillable: z.boolean(),
});

export type ProjectExpenseFormInput = z.infer<typeof projectExpenseSchema>;

// -- field-level helpers used for inline messages -------------------------

/**
 * Returns a flat map of `{ fieldName: errorCode }` from a parse result.
 * Codes are stable and translatable via i18n keys.
 */
export function flattenIssues<T extends z.ZodTypeAny>(
  result: z.SafeParseReturnType<unknown, z.infer<T>>,
): Record<string, string> {
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
