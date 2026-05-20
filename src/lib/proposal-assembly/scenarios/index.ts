/**
 * Operational testing scenarios for Proposal Assembly V1.
 *
 * These fixtures are NOT seed data and do NOT touch the database. They are
 * deterministic inputs used by `scripts/test-proposal-scenarios.mjs` and
 * available for in-app QA panels to dry-run assembly without depending on a
 * specific quote. Mirroring the user's V1 spec:
 *   A. Small Workplace Fit-out (compact, no Workplace Strategy, no procurement)
 *   B. Medium Corporate Workplace (BIM + procurement + consultant track)
 *   C. Large Corporate HQ (full programme, signage, full appendix package)
 *
 * Delivery modes used here map to the existing enum:
 *   psa_led          → in-house PSA delivery (default)
 *   consultant_led   → "local-led, PSA oversight" engagement
 *   design_build     → "PSA-assist, single-point delivery partner"
 */
import type { AssemblyInput } from "../types";

const PSA_DEFAULT_FLAGS = {
  showHours: true,
  showDurations: true,
  showConsultantTrack: false,
} as const;

export const SCENARIO_SMALL: AssemblyInput = {
  family: "workplace",
  preset: "small_fitout",
  deliveryMode: "psa_led",
  language: "en",
  flags: { ...PSA_DEFAULT_FLAGS },
  addOns: [],
  appendices: { I: true, II: true, III: true, IV: true, V: false, VI: false },
  assemblyKey: "scenario-small:v1",
  data: {
    quote: {
      id: "scenario-small",
      code: "PSA-2026-S01",
      project_name: "Riverside Studio Fit-out",
      client_name: "Riverside Studio Ltd",
      currency: "EUR",
      proposal_date: "2026-05-20",
      proposal_version: "v1",
    },
    // Compact: no P1 (Workplace Strategy), no P5 (Procurement).
    stages: [
      { code: "P2", name: "Concept Design", duration_days: 15, estimated_hours: 90, fee: 9000 },
      { code: "P3", name: "Schematic Design", duration_days: 20, estimated_hours: 120, fee: 12000 },
      { code: "P4", name: "Technical Design", duration_days: 25, estimated_hours: 160, fee: 18000 },
      { code: "CA", name: "Construction Assistance", duration_days: 60, estimated_hours: 60, fee: 9000 },
      { code: "P7", name: "Close Out", duration_days: 5, estimated_hours: 20, fee: 2500 },
    ],
    paymentSchedule: [
      { label: "Signing", trigger: "on_signature", amount: 9000 },
      { label: "Schematic delivery", trigger: "phase_complete", amount: 12000 },
    ],
    feeBreakdown: {
      total: 50500,
      constructionMonthlyFee: 3000,
      constructionMonthlyHours: 20,
      constructionDurationMonths: 3,
    },
    exclusions: ["VAT", "Permits", "Specialist consultants"],
  },
};

export const SCENARIO_MEDIUM: AssemblyInput = {
  family: "workplace",
  preset: "large_corporate_fitout",
  deliveryMode: "psa_led",
  language: "en",
  flags: { ...PSA_DEFAULT_FLAGS, showConsultantTrack: true },
  addOns: ["BIM Level 2", "Procurement support"],
  appendices: { I: true, II: true, III: true, IV: true, V: true, VI: true },
  assemblyKey: "scenario-medium:v1",
  data: {
    quote: {
      id: "scenario-medium",
      code: "PSA-2026-M02",
      project_name: "Northbank Corporate Offices",
      client_name: "Northbank Holdings",
      currency: "EUR",
      proposal_date: "2026-05-20",
      proposal_version: "v1",
    },
    stages: [
      { code: "P1", name: "Workplace Strategy", duration_days: 15, estimated_hours: 120, fee: 14000 },
      { code: "P2", name: "Concept Design", duration_days: 25, estimated_hours: 200, fee: 22000 },
      { code: "P3", name: "Schematic Design", duration_days: 30, estimated_hours: 260, fee: 28000 },
      { code: "P4", name: "Technical Design", duration_days: 40, estimated_hours: 360, fee: 38000 },
      { code: "P5", name: "Procurement / Tender Support", duration_days: 25, estimated_hours: 140, fee: 16000 },
      { code: "CA", name: "Construction Assistance", duration_days: 120, estimated_hours: 240, fee: 36000 },
      { code: "P7", name: "Close Out", duration_days: 10, estimated_hours: 40, fee: 5000 },
    ],
    paymentSchedule: [
      { label: "Signing", trigger: "on_signature", amount: 14000 },
      { label: "Concept delivery", trigger: "phase_complete", amount: 22000 },
      { label: "Technical delivery", trigger: "phase_complete", amount: 38000 },
    ],
    feeBreakdown: {
      total: 159000,
      constructionMonthlyFee: 6000,
      constructionMonthlyHours: 40,
      constructionDurationMonths: 6,
    },
    exclusions: ["VAT", "Permits", "Landlord fees", "Furniture procurement"],
  },
};

export const SCENARIO_LARGE: AssemblyInput = {
  family: "workplace",
  preset: "large_corporate_fitout",
  deliveryMode: "psa_led",
  language: "en",
  flags: { showHours: true, showDurations: true, showConsultantTrack: true },
  addOns: ["BIM Level 2", "Procurement support", "Signage & Wayfinding", "Sustainability advisory"],
  appendices: { I: true, II: true, III: true, IV: true, V: true, VI: true },
  assemblyKey: "scenario-large:v1",
  data: {
    quote: {
      id: "scenario-large",
      code: "PSA-2026-L03",
      project_name: "Helios Group Global HQ",
      client_name: "Helios Group",
      currency: "EUR",
      proposal_date: "2026-05-20",
      proposal_version: "v1",
    },
    stages: [
      { code: "P1", name: "Workplace Strategy", duration_days: 30, estimated_hours: 280, fee: 32000 },
      { code: "P2", name: "Concept Design", duration_days: 40, estimated_hours: 360, fee: 42000 },
      { code: "P3", name: "Schematic Design", duration_days: 50, estimated_hours: 520, fee: 58000 },
      { code: "P4", name: "Technical Design", duration_days: 70, estimated_hours: 720, fee: 82000 },
      { code: "P5", name: "Procurement / Tender Support", duration_days: 35, estimated_hours: 220, fee: 26000 },
      { code: "CA", name: "Construction Assistance", duration_days: 240, estimated_hours: 720, fee: 108000 },
      { code: "P7", name: "Close Out", duration_days: 20, estimated_hours: 80, fee: 9000 },
    ],
    paymentSchedule: [
      { label: "Signing", trigger: "on_signature", amount: 32000 },
      { label: "Concept delivery", trigger: "phase_complete", amount: 42000 },
      { label: "Schematic delivery", trigger: "phase_complete", amount: 58000 },
      { label: "Technical delivery", trigger: "phase_complete", amount: 82000 },
      { label: "Tender award", trigger: "milestone", amount: 26000 },
    ],
    feeBreakdown: {
      total: 357000,
      constructionMonthlyFee: 9000,
      constructionMonthlyHours: 60,
      constructionDurationMonths: 12,
    },
    exclusions: ["VAT", "Permits", "Landlord fees", "Specialist art procurement"],
  },
};

export const SCENARIOS = {
  small: SCENARIO_SMALL,
  medium: SCENARIO_MEDIUM,
  large: SCENARIO_LARGE,
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
