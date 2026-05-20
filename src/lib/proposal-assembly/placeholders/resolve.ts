/**
 * Replaces `{placeholder}` tokens against the assembly data.
 * Unknown placeholders are left literal and reported back so the UI can
 * surface them in the unresolved-placeholders banner.
 *
 * Resolution is deterministic and side-effect free.
 */
import type { AssemblyData } from "../types";

export interface ResolveResult {
  output: string;
  resolved: string[];
  unresolved: string[];
}

const TOKEN_RE = /\{([a-z_0-9]+)\}/g;
const RAW_COMPONENT_TOKEN_RE = /\[\[([a-z_0-9]+)\]\]/g;

function fmtNumber(n: number | null | undefined, fallback = ""): string {
  if (n == null || !Number.isFinite(n)) return fallback;
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
}

function fmtMoney(n: number | null | undefined, currency = "EUR"): string {
  if (n == null || !Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function stageLabel(s: AssemblyData["stages"][number]): string {
  return [s.code, s.name].filter(Boolean).join(" — ");
}

function renderProjectStageFeeTable(data: AssemblyData, currency: string): string {
  const rows = data.stages.filter((s) => s.fee != null && Number.isFinite(Number(s.fee)) && Number(s.fee) > 0);
  if (rows.length === 0) return "Detailed fee schedule to be confirmed.";
  return [
    "Phase | Fee",
    "--- | ---",
    ...rows.map((s) => `${stageLabel(s)} | ${fmtMoney(Number(s.fee), currency)}`),
  ].join("\n");
}

function renderConstructionFeeTable(data: AssemblyData, currency: string): string {
  const months = data.feeBreakdown?.constructionDurationMonths;
  const monthlyFee = data.feeBreakdown?.constructionMonthlyFee;
  const monthlyHours = data.feeBreakdown?.constructionMonthlyHours;
  if (months == null || monthlyFee == null || monthlyHours == null) {
    return "Construction Assistance, where included, will be structured as a monthly retainer aligned with the confirmed construction programme.";
  }
  return `Construction Assistance Retainer: ${fmtNumber(months)} months at ${fmtMoney(monthlyFee, currency)} per month, with an allowance of ${fmtNumber(monthlyHours)} hours/month.`;
}

function renderPaymentSchedule(data: AssemblyData, currency: string): string {
  const rows = data.paymentSchedule.filter((p) => Number.isFinite(Number(p.amount)) && Number(p.amount) > 0);
  if (rows.length === 0) return "Payment schedule to be confirmed.";
  return [
    "Milestone | Trigger | Amount",
    "--- | --- | ---",
    ...rows.map((p) => `${p.label || "Milestone"} | ${p.trigger || "To be confirmed"} | ${fmtMoney(p.amount, currency)}`),
  ].join("\n");
}

function renderProgramme(data: AssemblyData): string {
  const rows = data.stages.filter((s) => s.start_date || s.end_date || s.duration_days);
  if (rows.length === 0) return "Programme to be confirmed following validation of project stages.";
  return [
    "Phase | Start | End | Duration",
    "--- | --- | --- | ---",
    ...rows.map((s) => {
      const duration = s.duration_days != null ? `${fmtNumber(s.duration_days)} working days` : "To be confirmed";
      return `${stageLabel(s)} | ${s.start_date ?? "To be confirmed"} | ${s.end_date ?? "To be confirmed"} | ${duration}`;
    }),
  ].join("\n");
}

export function buildPlaceholderMap(data: AssemblyData): Record<string, string> {
  const currency = data.quote.currency ?? "EUR";
  const overallDuration = data.stages.reduce(
    (acc, s) => acc + (s.duration_days ?? 0),
    0,
  );

  const map: Record<string, string> = {
    project_name: data.quote.project_name ?? data.quote.title ?? "the project",
    project_code: data.quote.code ?? "",
    client_name: data.quote.client_name ?? "the client",
    proposal_date: data.quote.proposal_date ?? new Date().toISOString().slice(0, 10),
    proposal_version: data.quote.proposal_version ?? "v1",
    currency,
    language: "",
    overall_project_duration: overallDuration > 0 ? `${overallDuration}` : "",
    construction_duration: fmtNumber(data.feeBreakdown?.constructionDurationMonths),
    construction_monthly_fee: fmtMoney(data.feeBreakdown?.constructionMonthlyFee, currency),
    construction_monthly_hours: fmtNumber(data.feeBreakdown?.constructionMonthlyHours),
    project_stage_fee_table: renderProjectStageFeeTable(data, currency),
    construction_stage_fee_table: renderConstructionFeeTable(data, currency),
    payment_schedule_table: renderPaymentSchedule(data, currency),
    proposal_gantt: renderProgramme(data),
    exclusions_list: (data.exclusions ?? []).map((e) => `• ${e}`).join("\n"),
  };

  for (const s of data.stages) {
    const code = s.code;
    map[`phase_duration_${code}`] = s.duration_days != null ? `${s.duration_days}` : "";
    map[`phase_fee_${code}`] = fmtMoney(s.fee, currency);
    map[`phase_hours_${code}`] = s.estimated_hours != null ? `${s.estimated_hours}` : "";
  }

  return map;
}

export function resolvePlaceholders(text: string, map: Record<string, string>): ResolveResult {
  const resolved = new Set<string>();
  const unresolved = new Set<string>();
  let output = text.replace(TOKEN_RE, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      const value = map[key];
      if (value !== "") {
        resolved.add(key);
        return value;
      }
      // Known token, empty value → collapse gracefully (don't leave the literal
      // `{token}` in the rendered proposal, but also don't flag as unresolved).
      resolved.add(key);
      return "";
    }
    unresolved.add(key);
    return "";
  });
  output = output.replace(RAW_COMPONENT_TOKEN_RE, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      resolved.add(key);
      return map[key] || componentFallback(key);
    }
    unresolved.add(key);
    return "";
  });
  // Tidy up artefacts created by collapsed empty placeholders.
  output = output
    .replace(/prepared for\s*(?=[.,;:!?\n]|$)/gi, "prepared for the client")
    .replace(/for,\s*/gi, "")
    .replace(/for\s+[.,;:!?]/gi, "")
    .replace(/\bThe overall programme runs for\s*working days\.?/gi, "The project programme will be confirmed following validation of the proposed stages.")
    .replace(/\bOverall programme:\s*working days\.?/gi, "Programme to be confirmed.")
    .replace(/\bthroughout the\s*-day programme\b/gi, "throughout the confirmed programme")
    .replace(/\bembedded\s+throughout\s+the\s+-day\s+programme\b/gi, "embedded throughout the confirmed programme")
    .replace(/\bConstruction is supported through a monthly retainer over\s*months\s*at\s*per month\s*\(\s*hours\/month\s*\),?/gi, "Construction Assistance, where included, will be structured as a monthly retainer aligned with the confirmed construction programme,")
    .replace(/\bConstruction assistance is delivered as a monthly retainer over\s*months\s*at\s*per month\s*\(\s*hours\/month\s*\)\.?/gi, "Construction Assistance, where included, will be structured as a monthly retainer aligned with the confirmed construction programme.")
    .replace(/\bas a retainer over\s*months\s*at\s*per month\.?/gi, "as a monthly retainer aligned with the confirmed construction programme.")
    .replace(/\bfor\s+working days\b/gi, "for a duration to be confirmed")
    .replace(/\bover\s+months\b/gi, "over a duration to be confirmed")
    .replace(/\bat\s+per month\b/gi, "at a monthly fee to be confirmed")
    .replace(/\(\s*hours\/month\s*\)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:)\]])/g, "$1")
    .replace(/\(\s+\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return {
    output,
    resolved: [...resolved],
    unresolved: [...unresolved],
  };
}

function componentFallback(key: string): string {
  if (key === "proposal_gantt") return "Programme to be confirmed.";
  if (key === "payment_schedule_table") return "Payment schedule to be confirmed.";
  if (key === "project_stage_fee_table" || key === "construction_stage_fee_table") {
    return "Fee schedule to be confirmed.";
  }
  return "";
}
