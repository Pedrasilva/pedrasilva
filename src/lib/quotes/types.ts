import type { Database } from "@/integrations/supabase/types";

// ============================================================
// Phase A — Quote-owned planning row types
// (DB-backed; mirrors pm_* row types in src/lib/projects/types.ts)
// ============================================================

export type QuoteStage = Database["public"]["Tables"]["quote_stages"]["Row"];
export type QuoteStageInsert = Database["public"]["Tables"]["quote_stages"]["Insert"];

export type QuoteStageDependency =
  Database["public"]["Tables"]["quote_stage_dependencies"]["Row"];

export type QuoteAllocation = Database["public"]["Tables"]["quote_allocations"]["Row"];
export type QuoteAllocationInsert =
  Database["public"]["Tables"]["quote_allocations"]["Insert"];

export type QuoteExternalService =
  Database["public"]["Tables"]["quote_external_services"]["Row"];

export type QuotePaymentScheduleItem =
  Database["public"]["Tables"]["quote_payment_schedule_items"]["Row"];

// ============================================================
// Enums
// ============================================================

export type QuoteDepType = Database["public"]["Enums"]["quote_dep_type"];
export type QuoteExternalServiceStatus =
  Database["public"]["Enums"]["quote_external_service_status"];
export type QuoteMarkupType = Database["public"]["Enums"]["quote_markup_type"];
export type QuotePaymentTrigger =
  Database["public"]["Enums"]["quote_payment_trigger"];
export type QuotePaymentAmountType =
  Database["public"]["Enums"]["quote_payment_amount_type"];

// ============================================================
// UI label maps (used later in Phase B; safe to import now)
// ============================================================

export const QUOTE_PAYMENT_TRIGGERS: { value: QuotePaymentTrigger; label: string }[] = [
  { value: "project_start", label: "Project start" },
  { value: "stage_start", label: "Stage start" },
  { value: "stage_end", label: "Stage end" },
  { value: "manual_date", label: "Manual date" },
  { value: "monthly", label: "Monthly" },
];

export const QUOTE_PAYMENT_AMOUNT_TYPES: { value: QuotePaymentAmountType; label: string }[] = [
  { value: "fixed", label: "Fixed amount" },
  { value: "percent", label: "Percentage" },
];

export const QUOTE_EXTERNAL_SERVICE_STATUSES: { value: QuoteExternalServiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export const QUOTE_DEP_TYPES: { value: QuoteDepType; label: string }[] = [
  { value: "FS", label: "Finish → Start" },
  { value: "SS", label: "Start → Start" },
  { value: "FF", label: "Finish → Finish" },
  { value: "SF", label: "Start → Finish" },
];
