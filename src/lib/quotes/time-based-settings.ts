/**
 * Typed shape and helpers for `fee_proposals.time_based_settings` (JSONB).
 *
 * Used by:
 * - QuoteTimeBasedSettingsTab (UI editor)
 * - useGenerateQuoteProposalDocument (passes derived ConsultancyConfig
 *   to the proposal generator so retainer/consultancy generated blocks
 *   reflect the saved commercial terms).
 *
 * The JSON is intentionally a tagged union keyed by `kind`, so a single
 * column can host both retainer and consultancy settings without
 * cross-contamination. Older rows may be `{}` — treat that as "not set".
 */

export type TimeBasedKind = "construction_retainer" | "consultancy_hours_package";

export interface RetainerMonthlyResource {
  /** Free-text role/resource label (e.g. "Senior Architect"). */
  label: string;
  /** Monthly hours allocated to this role. */
  hours_per_month: number;
  /** Hourly rate in EUR. */
  hourly_rate: number;
}

export interface ConstructionRetainerSettings {
  kind: "construction_retainer";
  start_date: string | null; // ISO date
  estimated_end_date: string | null; // ISO date
  billing_mode: "monthly_advance";
  monthly_resources: RetainerMonthlyResource[];
  reimbursable_expenses_note: string;
}

export interface ConsultancyPhaseEstimate {
  label: string;
  estimated_hours: number | null;
}

export interface ConsultancyHoursPackageSettings {
  kind: "consultancy_hours_package";
  hourly_rate: number | null;
  hours_block: number | null;
  /** Percent (0-100) of hours_block required as upfront commitment. */
  minimum_commitment_percent: number;
  billing_mode: "monthly_actual";
  phases: ConsultancyPhaseEstimate[];
}

export type TimeBasedSettings =
  | ConstructionRetainerSettings
  | ConsultancyHoursPackageSettings;

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function numberOrZero(value: unknown): number {
  return optionalNumber(value) ?? 0;
}

// ──────────────────────── Defaults ────────────────────────

export function defaultRetainerSettings(): ConstructionRetainerSettings {
  return {
    kind: "construction_retainer",
    start_date: null,
    estimated_end_date: null,
    billing_mode: "monthly_advance",
    monthly_resources: [],
    reimbursable_expenses_note: "",
  };
}

export function defaultConsultancySettings(): ConsultancyHoursPackageSettings {
  return {
    kind: "consultancy_hours_package",
    hourly_rate: null,
    hours_block: null,
    minimum_commitment_percent: 30,
    billing_mode: "monthly_actual",
    phases: [
      { label: "Phase 1 — Preliminary Feasibility", estimated_hours: null },
      { label: "Phase 2 — Detailed Feasibility", estimated_hours: null },
      { label: "Phase 3 — PIP / Planning Confirmation", estimated_hours: null },
    ],
  };
}

// ──────────────────────── Parsing ────────────────────────

/**
 * Parse an unknown JSON value (from the DB) into a TimeBasedSettings or
 * null when empty/unrecognised. `quoteType` is used as a fallback when
 * the JSON has no `kind` discriminator — this happens for rows created
 * before settings were ever saved.
 */
export function parseTimeBasedSettings(
  raw: unknown,
  quoteType: string | null | undefined,
): TimeBasedSettings | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const kind = obj.kind ?? quoteType;
    if (kind === "construction_retainer") {
      const base = defaultRetainerSettings();
      return {
        ...base,
        start_date: typeof obj.start_date === "string" ? obj.start_date : null,
        estimated_end_date:
          typeof obj.estimated_end_date === "string" ? obj.estimated_end_date : null,
        monthly_resources: Array.isArray(obj.monthly_resources)
          ? (obj.monthly_resources as unknown[])
              .map((r) => {
                if (!r || typeof r !== "object") return null;
                const o = r as Record<string, unknown>;
                return {
                  label: typeof o.label === "string" ? o.label : "",
                  hours_per_month: numberOrZero(o.hours_per_month),
                  hourly_rate: numberOrZero(o.hourly_rate),
                };
              })
              .filter((r): r is RetainerMonthlyResource => r !== null)
          : [],
        reimbursable_expenses_note:
          typeof obj.reimbursable_expenses_note === "string"
            ? obj.reimbursable_expenses_note
            : "",
      };
    }
    if (kind === "consultancy_hours_package") {
      const base = defaultConsultancySettings();
      return {
        ...base,
        hourly_rate: optionalNumber(obj.hourly_rate) ?? base.hourly_rate,
        hours_block: optionalNumber(obj.hours_block) ?? base.hours_block,
        minimum_commitment_percent:
          optionalNumber(obj.minimum_commitment_percent) ??
          base.minimum_commitment_percent,
        phases: Array.isArray(obj.phases)
          ? (obj.phases as unknown[])
              .map((p) => {
                if (!p || typeof p !== "object") return null;
                const o = p as Record<string, unknown>;
                return {
                  label: typeof o.label === "string" ? o.label : "",
                  estimated_hours: optionalNumber(o.estimated_hours),
                };
              })
              .filter((p): p is ConsultancyPhaseEstimate => p !== null)
          : base.phases,
      };
    }
  }
  // Empty or unknown — derive default from quote type if possible.
  if (quoteType === "construction_retainer") return defaultRetainerSettings();
  if (quoteType === "consultancy_hours_package") return defaultConsultancySettings();
  return null;
}

// ──────────────────────── Computed totals ────────────────────────

export function retainerMonthlyEstimate(s: ConstructionRetainerSettings): number {
  return s.monthly_resources.reduce(
    (sum, r) => sum + (Number(r.hours_per_month) || 0) * (Number(r.hourly_rate) || 0),
    0,
  );
}

export function consultancyMinimumHours(s: ConsultancyHoursPackageSettings): number {
  if (s.hours_block == null) return 0;
  const pct = Math.max(0, Math.min(100, s.minimum_commitment_percent));
  return (s.hours_block * pct) / 100;
}

export function consultancyDownpayment(s: ConsultancyHoursPackageSettings): number {
  if (s.hourly_rate == null) return 0;
  return consultancyMinimumHours(s) * s.hourly_rate;
}

export function consultancyBlockValue(s: ConsultancyHoursPackageSettings): number {
  if (s.hourly_rate == null || s.hours_block == null) return 0;
  return s.hourly_rate * s.hours_block;
}
