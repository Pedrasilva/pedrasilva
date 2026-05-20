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

export function buildPlaceholderMap(data: AssemblyData): Record<string, string> {
  const currency = data.quote.currency ?? "EUR";
  const overallDuration = data.stages.reduce(
    (acc, s) => acc + (s.duration_days ?? 0),
    0,
  );

  const map: Record<string, string> = {
    project_name: data.quote.project_name ?? data.quote.title ?? "",
    project_code: data.quote.code ?? "",
    client_name: data.quote.client_name ?? "",
    proposal_date: data.quote.proposal_date ?? new Date().toISOString().slice(0, 10),
    proposal_version: data.quote.proposal_version ?? "v1",
    currency,
    language: "",
    overall_project_duration: overallDuration > 0 ? `${overallDuration}` : "",
    construction_duration: fmtNumber(data.feeBreakdown?.constructionDurationMonths),
    construction_monthly_fee: fmtMoney(data.feeBreakdown?.constructionMonthlyFee, currency),
    construction_monthly_hours: fmtNumber(data.feeBreakdown?.constructionMonthlyHours),
    project_stage_fee_table: "[[project_stage_fee_table]]",
    construction_stage_fee_table: "[[construction_stage_fee_table]]",
    payment_schedule_table: "[[payment_schedule_table]]",
    proposal_gantt: "[[proposal_gantt]]",
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
  const output = text.replace(TOKEN_RE, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(map, key) && map[key] !== "") {
      resolved.add(key);
      return map[key];
    }
    unresolved.add(key);
    return full;
  });
  return {
    output,
    resolved: [...resolved],
    unresolved: [...unresolved],
  };
}
