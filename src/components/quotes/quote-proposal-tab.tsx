/**
 * Proposal tab — two layers:
 *
 * 1. **Generated proposal document** (new, primary): if a
 *    quote_proposal_documents row exists for the quote, show its metadata
 *    and an ordered, read-only preview of its blocks. If none exists, show
 *    a CTA to generate one. A "Regenerate draft" button replaces drafts.
 *
 * 2. **Legacy proposal preview** (collapsible, fallback): the original
 *    auto-rendered client-facing summary based directly on stages /
 *    allocations / external services. Kept for comparison until the block
 *    editor is complete.
 *
 * This pass is intentionally read-only: no inline editing, no reorder, no
 * DOCX/PDF export, no snapshot-on-send.
 */
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  quoteTypeToProposalKind,
  proposalKindsForCategory,
  defaultProposalKindForCategory,
  type ConsultancyConfig,
  type ProposalKind,
  type RetainerConfig,
} from "@/lib/quotes/proposal-generator";
import { useTranslation } from "react-i18next";
import { format, parseISO, type Locale } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Lock,
  Pencil,
  Printer,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import logoPSA from "@/assets/logo-psa.png";
import proposalMarkRiba from "@/assets/proposal-mark-riba.png";
import proposalMarkOa from "@/assets/proposal-mark-oa.png";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { formatEUR } from "@/lib/crm/types";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { rollupQuote, quoteAllocationLine } from "@/lib/quotes/financial-rollups";
import { useDateLocale } from "@/i18n/use-date-locale";
import {
  QUOTE_PAYMENT_TRIGGERS,
  QUOTE_PAYMENT_AMOUNT_TYPES,
} from "@/lib/quotes/types";
import {
  useLatestQuoteProposalDocument,
  useQuoteProposalDocumentBlocks,
  type QuoteProposalDocument,
  type QuoteProposalDocumentBlock,
} from "@/lib/quotes/use-quote-proposal-document";
import {
  useUpdateBlockContent,
  useSetBlockIncluded,
  useMoveBlock,
} from "@/lib/quotes/use-quote-proposal-document-blocks";
import { useGenerateQuoteProposalDocument } from "@/lib/quotes/use-generate-quote-proposal-document";
import {
  parseTimeBasedSettings,
  retainerMonthlyEstimate,
} from "@/lib/quotes/time-based-settings";
import { QuoteProposalIntelligencePanel } from "@/components/quotes/quote-proposal-intelligence-panel";
import { ProposalAssemblyPanel } from "@/components/quotes/proposal-assembly-panel";
import {
  GanttPrintable,
  PaymentSchedulePrintable,
  hasAttachmentToken,
  splitOnAttachmentTokens,
} from "@/components/quotes/printable/quote-attachment-printables";
import {
  useResolvedProposal,
  type ProposalRenderKind,
} from "@/lib/proposal-rendering";

function toRenderKind(kind: ProposalKind): ProposalRenderKind {
  switch (kind) {
    case "phased_consultancy":
    case "consultancy_hours_package":
    case "construction_retainer":
      return kind;
    default:
      return "fee_proposal";
  }
}

interface QuoteProposalTabProps {
  quoteId: string;
  pricingMultiplier: number;
  title: string;
  description: string | null;
  clientName: string | null;
  accountName: string | null;
  /** Drives the default ProposalKind used by the generator. */
  quoteType?: string | null;
  /** Top-level category — restricts which proposal block-sets are offered. */
  quoteCategory?: "project" | "time_based" | "retainer" | "consultancy" | null;
  ontologyFamilyCode?: string | null;
  initialMode?: "edit" | "preview";
  showAssemblyTools?: boolean;
}

function safeDate(d: string, locale: Locale | undefined): string {
  try {
    return format(parseISO(d), "d MMM yyyy", { locale });
  } catch {
    return d;
  }
}

function safeDateTime(d: string | null, locale: Locale | undefined): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "d MMM yyyy HH:mm", { locale });
  } catch {
    return d;
  }
}

function useFirmBranding() {
  return useQuery({
    queryKey: ["pm-invoice-settings-singleton-branding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pm_invoice_settings")
        .select("company_name, company_address, company_email, company_phone")
        .is("project_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─────────────────── Generated document section ───────────────────

function statusVariant(
  status: QuoteProposalDocument["status"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "draft":
      return "outline";
    case "ready":
      return "secondary";
    case "sent":
    case "accepted":
      return "default";
    case "archived":
      return "destructive";
    default:
      return "outline";
  }
}

function isConsultancyProposalKind(kind: ProposalKind): boolean {
  return kind === "phased_consultancy" || kind === "consultancy_hours_package";
}

function isTimeBasedProposalKind(kind: ProposalKind): boolean {
  return isConsultancyProposalKind(kind) || kind === "construction_retainer";
}

function proposalKindToTimeBasedHint(kind: ProposalKind) {
  if (isConsultancyProposalKind(kind)) return "consultancy_hours_package";
  if (kind === "construction_retainer") return "construction_retainer";
  return undefined;
}

function formatCurrency(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}

const DOUBLE_BRACE_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const SINGLE_BRACE_TOKEN_RE = /\{\s*([a-z_][a-z_0-9]*)\s*\}/g;

function formatMoneyValue(value: number | null | undefined, currency = "EUR") {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function daysBetweenInclusive(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function monthsBetweenInclusive(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b < a) return null;
  return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() + 1);
}

function useQuoteBuilderPlaceholderMap(args: {
  quoteId: string;
  title: string;
  clientName: string | null;
  accountName: string | null;
}) {
  const locale = useDateLocale();
  const { data: stages = [] } = useQuoteStages(args.quoteId);
  const { data: allocations = [] } = useQuoteAllocations(args.quoteId);
  const { data: schedule = [] } = useQuotePaymentSchedule(args.quoteId);
  const { data: quoteMeta } = useQuery({
    queryKey: ["fee-proposal-live-placeholders", args.quoteId],
    enabled: Boolean(args.quoteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("titulo, valor, data_proposta, proposal_number, quote_type, time_based_settings")
        .eq("id", args.quoteId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        titulo: string | null;
        valor: number | null;
        data_proposta: string | null;
        proposal_number: string | null;
        quote_type: string | null;
        time_based_settings: unknown;
      } | null;
    },
  });

  return useMemo(() => {
    const currency = "EUR";
    const title = quoteMeta?.titulo || args.title;
    const client = args.clientName || args.accountName || "";
    const issueDate = quoteMeta?.data_proposta
      ? safeDate(quoteMeta.data_proposta, locale)
      : format(new Date(), "d MMM yyyy", { locale });
    const hoursByStage = new Map<string, number>();
    for (const allocation of allocations) {
      const stageId = allocation.stage_id;
      if (!stageId) continue;
      const { hours } = quoteAllocationLine(allocation);
      hoursByStage.set(stageId, (hoursByStage.get(stageId) ?? 0) + hours);
    }

    const parsedSettings = parseTimeBasedSettings(
      quoteMeta?.time_based_settings,
      quoteMeta?.quote_type,
    );
    const retainerMonthlyFee = parsedSettings?.kind === "construction_retainer"
      ? retainerMonthlyEstimate(parsedSettings)
      : null;
    const retainerMonthlyHours = parsedSettings?.kind === "construction_retainer"
      ? parsedSettings.monthly_resources.reduce((sum, row) => sum + Number(row.hours_per_month || 0), 0)
      : null;
    const retainerDuration = parsedSettings?.kind === "construction_retainer"
      ? parsedSettings.construction_duration_months ?? monthsBetweenInclusive(parsedSettings.start_date, parsedSettings.estimated_end_date)
      : null;

    const map: Record<string, string> = {
      "proposal.title": title,
      "proposal.date": issueDate,
      "proposal.number": quoteMeta?.proposal_number ?? "",
      "project.name": title,
      "project.location": "",
      "project.area": "",
      "client.name": client,
      project_name: title,
      project_code: quoteMeta?.proposal_number ?? "",
      client_name: client,
      proposal_date: issueDate,
      proposal_version: "v1",
      currency,
      "stages.numbered_list": stages
        .map((stage, index) => `${String(index + 1).padStart(2, "0")} — ${stage.name}`)
        .join("\n"),
      "payment.schedule": schedule
        .map((item) => {
          const raw = Number(item.amount_value ?? 0);
          const amount = item.amount_type === "percent"
            ? (Number(quoteMeta?.valor ?? 0) * raw) / 100
            : raw;
          return `• ${item.label || item.trigger_type}: ${formatMoneyValue(amount, currency)}`;
        })
        .join("\n"),
      construction_duration: retainerDuration ? `${retainerDuration} months` : "",
      construction_monthly_fee: retainerMonthlyFee ? formatMoneyValue(retainerMonthlyFee, currency) : "",
      construction_monthly_hours: retainerMonthlyHours ? `${retainerMonthlyHours}` : "",
    };

    stages.forEach((stage, index) => {
      const n = index + 1;
      const durationDays = daysBetweenInclusive(stage.start_date, stage.end_date);
      const hours = hoursByStage.get(stage.id) ?? null;
      const fee = stage.budget == null ? null : Number(stage.budget);
      map[`stage.${n}.title`] = stage.name;
      map[`stage.${n}.duration`] = durationDays ? `${durationDays} working days` : "";
      map[`stage.${n}.hours`] = hours != null ? `${Math.round(hours)}` : "";
      map[`stage.${n}.fee`] = fee != null ? formatMoneyValue(fee, currency) : "";
      map[`stage.${n}.monthly_fee`] = retainerMonthlyFee ? formatMoneyValue(retainerMonthlyFee, currency) : "";
      map[`stage.${n}.monthly_hours`] = retainerMonthlyHours ? `${retainerMonthlyHours}` : "";
      map[`stage.${n}.retainer_review_cycle`] = retainerDuration ? "Monthly" : "";
      if (stage.phase_code) {
        map[`phase_duration_${stage.phase_code}`] = map[`stage.${n}.duration`];
        map[`phase_hours_${stage.phase_code}`] = map[`stage.${n}.hours`];
        map[`phase_fee_${stage.phase_code}`] = map[`stage.${n}.fee`];
      }
    });

    return map;
  }, [allocations, args.accountName, args.clientName, args.title, locale, quoteMeta, schedule, stages]);
}

function resolveQuoteBuilderPlaceholders(text: string, map: Record<string, string>) {
  if (!text) return text;
  return text
    .replace(DOUBLE_BRACE_TOKEN_RE, (match, key: string) => {
      // Preserve attachment.* tokens — they are rendered as live React
      // components by splitOnAttachmentTokens, not as inline text.
      if (key.startsWith("attachment.")) return match;
      return map[key] ?? "";
    })
    .replace(SINGLE_BRACE_TOKEN_RE, (_match, key: string) => map[key] ?? "")
    .replace(/\[Proposal Title \/ RFP Title\]/g, map["proposal.title"] ?? "")
    .replace(/\[Issue Date\]/g, map["proposal.date"] ?? "")
    .replace(/\[Client Name\]/g, map["client.name"] ?? "");
}

// Type guards for the various generated_content shapes produced by
// proposal-generator.ts. Kept narrow so each renderer reads cleanly.
type GenContent = Record<string, unknown> | null | undefined;

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function asStr(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Strip internal provenance prefix ("Generated ") from block titles before
 * surfacing them to clients. Block titles like "Generated Stage Summary"
 * originate from the master `proposal_blocks` registry where the prefix
 * marks the row as auto-assembled; it must never leak into the
 * client-facing render or the editor card heading. Provenance metadata
 * stays intact on the underlying record — this is render-layer only.
 */
function displayBlockTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/^\s*Generated\s+/i, "").trim();
}

function GeneratedSectionRenderer({
  slug,
  content,
  locale,
}: {
  slug: string | null;
  content: GenContent;
  locale: Locale | undefined;
}) {
  const { t } = useTranslation("crm");
  const tr = (k: string, opts?: Record<string, unknown>) =>
    t(`workspace.proposal.document.renderers.${k}`, opts);

  if (!content) return null;

  switch (slug) {
    case "generated-external-services": {
      const items = asArray<Record<string, unknown>>(content.items);
      if (items.length === 0) {
        return <p className="text-sm italic text-muted-foreground">{tr("externalServicesEmpty")}</p>;
      }
      return (
        <ul className="space-y-1.5">
          {items.map((it, i) => {
            const desc = asStr(it.description) ?? "—";
            const supplier = asStr(it.supplier);
            const qty = asNum(it.quantity);
            const total = asNum(it.total);
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{desc}</div>
                  <div className="text-xs text-muted-foreground">
                    {supplier ? `${supplier} · ` : ""}
                    {tr("qty")}: {qty}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums">{formatCurrency(total)}</span>
              </li>
            );
          })}
        </ul>
      );
    }

    case "generated-fee-summary": {
      const fees = (content.fees ?? {}) as Record<string, unknown>;
      const currency = asStr(content.currency) ?? "EUR";
      const total = asNum(fees.total);
      const internal = asNum(fees.internal);
      const external = asNum(fees.external);
      return (
        <div className="space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {tr("feeTotal")}
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatCurrency(total, currency)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{tr("feeInternal")}</div>
              <div className="font-medium tabular-nums">
                {formatCurrency(internal, currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{tr("feeExternal")}</div>
              <div className="font-medium tabular-nums">
                {formatCurrency(external, currency)}
              </div>
            </div>
          </div>
        </div>
      );
    }

    case "generated-payment-schedule": {
      const schedule = asArray<Record<string, unknown>>(content.schedule);
      const currency = asStr(content.currency) ?? "EUR";
      if (schedule.length === 0) {
        return <p className="text-sm italic text-muted-foreground">{tr("scheduleEmpty")}</p>;
      }
      return (
        <div className="overflow-x-auto">
          <table className="proposal-print-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">{tr("scheduleLabel")}</th>
                <th className="py-1.5 pr-2 font-medium">{tr("scheduleDate")}</th>
                <th className="py-1.5 text-right font-medium">{tr("scheduleAmount")}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row, i) => {
                const label = asStr(row.label) ?? "—";
                const date = asStr(row.expected_invoice_date);
                const amount = asNum(row.amount);
                return (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-2">{label}</td>
                    <td className="py-1.5 pr-2 text-xs text-muted-foreground tabular-nums">
                      {date ? safeDate(date, locale) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatCurrency(amount, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    case "generated-role-summary": {
      const roles = asArray<Record<string, unknown>>(content.roles);
      if (roles.length === 0) {
        return <p className="text-sm italic text-muted-foreground">{tr("rolesEmpty")}</p>;
      }
      return (
        <table className="proposal-print-table w-full text-sm">
          <tbody>
            {roles.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{asStr(r.role) ?? "—"}</td>
                <td className="text-right text-xs text-muted-foreground tabular-nums">
                  {tr("rolesHours", { hours: asNum(r.hours) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case "generated-stage-summary": {
      const stages = asArray<Record<string, unknown>>(content.stages);
      if (stages.length === 0) {
        return <p className="text-sm italic text-muted-foreground">{tr("stagesEmpty")}</p>;
      }
      return (
        <table className="proposal-print-table w-full text-sm">
          <tbody>
            {stages.map((s, i) => {
              const start = asStr(s.start_date);
              const end = asStr(s.end_date);
              return (
                <tr key={i}>
                  <td className="font-medium">{asStr(s.name) ?? "—"}</td>
                  <td className="text-right text-xs text-muted-foreground tabular-nums">
                    {start ? safeDate(start, locale) : "—"} →{" "}
                    {end ? safeDate(end, locale) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }

    case "generated-timeline": {
      const tl = (content.timeline ?? {}) as Record<string, unknown>;
      const start = asStr(tl.start_date);
      const end = asStr(tl.end_date);
      if (!start && !end) {
        return <p className="text-sm italic text-muted-foreground">{tr("timelineEmpty")}</p>;
      }
      return (
        <p className="text-sm tabular-nums">
          {tr("timelineRange", {
            start: start ? safeDate(start, locale) : "—",
            end: end ? safeDate(end, locale) : "—",
          })}
        </p>
      );
    }

    case "generated-acceptance-block": {
      const a = (content.acceptance ?? {}) as Record<string, unknown>;
      const client = asStr(a.client_name);
      const proposal = asStr(a.proposal_title);
      const fee = asNum(a.total_fee);
      return (
        <table className="proposal-print-table w-full text-sm">
          <thead>
            <tr>
              {client && <th>{tr("acceptanceClient")}</th>}
              {proposal && <th>{tr("acceptanceProposal")}</th>}
              <th>{tr("acceptanceFee")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {client && <td className="font-medium">{client}</td>}
              {proposal && <td className="font-medium">{proposal}</td>}
              <td className="font-semibold tabular-nums">{formatCurrency(fee)}</td>
            </tr>
          </tbody>
        </table>
      );
    }

    case "generated-time-fee-consultancy": {
      const currency = asStr(content.currency) ?? "EUR";
      const hourlyRaw = content.hourly_rate;
      const blockRaw = content.hours_block;
      const minRaw = content.minimum_commitment_hours;
      const blockValRaw = content.block_value;
      const hourly = typeof hourlyRaw === "number" ? hourlyRaw : null;
      const hoursBlock = typeof blockRaw === "number" ? blockRaw : null;
      const minimum = typeof minRaw === "number" ? minRaw : null;
      const blockValue = typeof blockValRaw === "number" ? blockValRaw : null;

      if (hourly === null && hoursBlock === null && minimum === null && blockValue === null) {
        return (
          <p className="text-sm italic text-muted-foreground">{tr("consultancyFeeEmpty")}</p>
        );
      }

      return (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {hourly !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {tr("consultancyHourlyRate")}
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatCurrency(hourly, currency)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/ h</span>
              </dd>
            </div>
          )}
          {hoursBlock !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {tr("consultancyHoursBlock")}
              </dt>
              <dd className="font-medium tabular-nums">
                {tr("consultancyHoursUnit", { hours: hoursBlock })}
              </dd>
            </div>
          )}
          {minimum !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {tr("consultancyMinimumCommitment")}
              </dt>
              <dd className="font-medium tabular-nums">
                {tr("consultancyHoursUnit", { hours: minimum })}
              </dd>
            </div>
          )}
          {blockValue !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {tr("consultancyBlockValue")}
              </dt>
              <dd className="font-semibold tabular-nums">
                {formatCurrency(blockValue, currency)}
              </dd>
            </div>
          )}
        </dl>
      );
    }

    case "generated-consultancy-phases": {
      const phases = asArray<Record<string, unknown>>(content.phases);
      if (phases.length === 0) {
        return (
          <p className="text-sm italic text-muted-foreground">{tr("consultancyPhasesEmpty")}</p>
        );
      }
      return (
        <ol className="space-y-2">
          {phases.map((p, i) => {
            const label = asStr(p.label) ?? "—";
            const hoursRaw = p.estimated_hours;
            const hours = typeof hoursRaw === "number" ? hoursRaw : null;
            return (
              <li
                key={i}
                className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium leading-snug">{label}</span>
                </div>
                {hours !== null && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {tr("consultancyPhaseEstimated", { hours })}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      );
    }

    default:
      return null;
  }
}

interface GeneratedBlockCardProps {
  block: QuoteProposalDocumentBlock;
  blocks: QuoteProposalDocumentBlock[];
  index: number;
  documentId: string;
  placeholderMap: Record<string, string>;
}

function GeneratedBlockCard({ block, blocks, index, documentId, placeholderMap }: GeneratedBlockCardProps) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const isGenerated = block.block_type === "generated_section";
  const isLocked = block.is_locked || isGenerated;
  // Derive slug from optional join field or by shape inference.
  const slug =
    (block as unknown as { slug?: string | null }).slug ??
    inferSlugFromContent(block.generated_content as GenContent);

  const updateContent = useUpdateBlockContent(documentId);
  const setIncluded = useSetBlockIncluded(documentId);
  const moveBlock = useMoveBlock(documentId);

  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<string>(block.content ?? "");

  // Keep local draft in sync if server content changes (e.g. after reorder/refresh).
  useEffect(() => {
    if (!isEditing) setDraftContent(block.content ?? "");
  }, [block.content, isEditing]);

  const canEdit = !isLocked && !isGenerated;
  const isFirst = index === 0;
  const isLast = index === blocks.length - 1;
  const displayContent = useMemo(
    () => resolveQuoteBuilderPlaceholders(block.content ?? "", placeholderMap),
    [block.content, placeholderMap],
  );

  const handleSave = async () => {
    try {
      await updateContent.mutateAsync({ blockId: block.id, content: draftContent });
      setIsEditing(false);
      toast.success(t("workspace.proposal.document.editor.saved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  const handleToggleIncluded = async (checked: boolean) => {
    try {
      await setIncluded.mutateAsync({ blockId: block.id, isIncluded: checked });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  const handleMove = async (direction: "up" | "down") => {
    try {
      await moveBlock.mutateAsync({ blocks, blockId: block.id, direction });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  return (
    <article
      className={`rounded-md border p-4 ${
        block.is_included ? "bg-card" : "bg-muted/30 opacity-60"
      }`}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-semibold leading-tight">{displayBlockTitle(block.block_title)}</h3>
          {isLocked && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              {t("workspace.proposal.document.lockedBadge")}
            </Badge>
          )}
          {!block.is_included && (
            <Badge variant="outline">
              {t("workspace.proposal.document.excludedBadge")}
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center gap-2 pr-1">
            <span className="text-xs text-muted-foreground">
              {t("workspace.proposal.document.editor.included")}
            </span>
            <Switch
              checked={block.is_included}
              onCheckedChange={handleToggleIncluded}
              disabled={setIncluded.isPending}
              aria-label={t("workspace.proposal.document.editor.toggleIncluded")}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMove("up")}
            disabled={isFirst || moveBlock.isPending}
            aria-label={t("workspace.proposal.document.editor.moveUp")}
            title={t("workspace.proposal.document.editor.moveUp")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleMove("down")}
            disabled={isLast || moveBlock.isPending}
            aria-label={t("workspace.proposal.document.editor.moveDown")}
            title={t("workspace.proposal.document.editor.moveDown")}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          {canEdit && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setDraftContent(block.content ?? "");
                setIsEditing(true);
              }}
              aria-label={t("workspace.proposal.document.editor.edit")}
              title={t("workspace.proposal.document.editor.edit")}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {isGenerated ? (
        <div className="rounded border border-dashed border-border bg-muted/40 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("workspace.proposal.document.generatedSection")}
          </div>
          <GeneratedSectionRenderer
            slug={slug}
            content={block.generated_content as GenContent}
            locale={locale}
          />
        </div>
      ) : isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={Math.min(20, Math.max(4, draftContent.split("\n").length + 1))}
            className="text-sm leading-relaxed"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftContent(block.content ?? "");
                setIsEditing(false);
              }}
              disabled={updateContent.isPending}
            >
              <X className="mr-1 h-4 w-4" />
              {t("workspace.proposal.document.editor.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateContent.isPending}
            >
              {updateContent.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {t("workspace.proposal.document.editor.save")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {displayContent}
        </p>
      )}
    </article>
  );
}

// Best-effort slug inference from the generated_content shape, used when the
// per-document block row doesn't carry the master slug.
function inferSlugFromContent(content: GenContent): string | null {
  if (!content) return null;
  if ("phases" in content) return "generated-consultancy-phases";
  if ("hourly_rate" in content || "hours_block" in content || "block_value" in content)
    return "generated-time-fee-consultancy";
  if ("items" in content) return "generated-external-services";
  if ("schedule" in content) return "generated-payment-schedule";
  if ("fees" in content) return "generated-fee-summary";
  if ("roles" in content) return "generated-role-summary";
  if ("stages" in content) return "generated-stage-summary";
  if ("timeline" in content) return "generated-timeline";
  if ("acceptance" in content) return "generated-acceptance-block";
  return null;
}

function GeneratedDocumentSection({
  quoteId,
  document,
  isLoadingDocument,
  title,
  clientName,
  accountName,
  quoteType,
  quoteCategory,
  ontologyFamilyCode,
}: {
  quoteId: string;
  document: QuoteProposalDocument | null;
  isLoadingDocument: boolean;
  title: string;
  clientName: string | null;
  accountName: string | null;
  quoteType?: string | null;
  quoteCategory?: "project" | "time_based" | "retainer" | "consultancy" | null;
  ontologyFamilyCode?: string | null;
}) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const qc = useQueryClient();
  const { data: blocks = [], isLoading: isLoadingBlocks } =
    useQuoteProposalDocumentBlocks(document?.id);
  const generate = useGenerateQuoteProposalDocument();
  const placeholderMap = useQuoteBuilderPlaceholderMap({ quoteId, title, clientName, accountName });

  // Read prior choice from snapshot when regenerating; otherwise default
  // from quote_type (commercial classification chosen at quote creation).
  // Filter the offered proposal kinds by the quote's top-level category so
  // a Time-based / Retainer quote never sees Project block-sets (and vice-
  // versa). Defaults to the project set when no category is provided.
  const isWorkplaceAssemblyQuote = ontologyFamilyCode === "workplace";
  const allowedKinds = useMemo(
    () =>
      isWorkplaceAssemblyQuote || quoteCategory === "project"
        ? (["psa_interior_fitout"] as readonly ProposalKind[])
        : proposalKindsForCategory(quoteCategory ?? "project"),
    [isWorkplaceAssemblyQuote, quoteCategory],
  );
  const fallbackKind = isWorkplaceAssemblyQuote
    ? "psa_interior_fitout"
    : quoteCategory
      ? quoteCategory === "project"
        ? "psa_interior_fitout"
        : defaultProposalKindForCategory(quoteCategory)
      : quoteTypeToProposalKind(quoteType);
  const persistedRaw =
    (document?.snapshot_json as { proposal_kind?: ProposalKind } | null)
      ?.proposal_kind ?? fallbackKind;
  // If the persisted kind is not allowed for this category, snap to the
  // category default — prevents stale "fixed_project" selections leaking
  // into a time-based quote.
  const persistedKind: ProposalKind = allowedKinds.includes(persistedRaw)
    ? persistedRaw
    : fallbackKind;
  const [proposalKind, setProposalKind] = useState<ProposalKind>(persistedKind);

  useEffect(() => {
    setProposalKind(persistedKind);
  }, [persistedKind]);

  // Consultancy commercial settings. Initialised in-memory; we hydrate them
  // from fee_proposals.time_based_settings when the saved JSON exists so the
  // user does not need to re-enter rate/hours after picking the kind on the
  // Time-based tab.
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [hoursBlock, setHoursBlock] = useState<string>("");
  const [minCommitment, setMinCommitment] = useState<string>("");
  const [phase1Hours, setPhase1Hours] = useState<string>("");
  const [phase2Hours, setPhase2Hours] = useState<string>("");
  const [phase3Hours, setPhase3Hours] = useState<string>("");
  const [monthlyRetainer, setMonthlyRetainer] = useState<string>("");
  const [retainerDurationMonths, setRetainerDurationMonths] = useState<string>("");
  const [reimbursableNote, setReimbursableNote] = useState<string>("");
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);

  // Hydrate the manual fields from the quote's stored time_based_settings
  // when the row arrives, so users do not need to re-type values.
  const { data: tbsRow } = useQuery({
    queryKey: ["fee_proposal_time_based_settings_for_proposal_tab", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("time_based_settings")
        .eq("id", quoteId)
        .single();
      if (error) throw error;
      return data as { time_based_settings: unknown };
    },
  });
  useEffect(() => {
    if (!tbsRow || hasHydratedSettings) return;
    const hint = proposalKindToTimeBasedHint(document ? persistedKind : proposalKind) ?? quoteType;
    const parsed = parseTimeBasedSettings(tbsRow.time_based_settings, hint);
    if (parsed?.kind === "consultancy_hours_package") {
      if (typeof parsed.hourly_rate === "number" && hourlyRate === "")
        setHourlyRate(String(parsed.hourly_rate));
      if (typeof parsed.hours_block === "number" && hoursBlock === "")
        setHoursBlock(String(parsed.hours_block));
      if (
        typeof parsed.minimum_commitment_percent === "number" &&
        typeof parsed.hours_block === "number" &&
        minCommitment === ""
      ) {
        const min = (parsed.hours_block * parsed.minimum_commitment_percent) / 100;
        setMinCommitment(String(min));
      }
      const v = (i: number) => {
        const h = parsed.phases[i]?.estimated_hours;
        return typeof h === "number" ? String(h) : "";
      };
      if (phase1Hours === "") setPhase1Hours(v(0));
      if (phase2Hours === "") setPhase2Hours(v(1));
      if (phase3Hours === "") setPhase3Hours(v(2));
    }
    if (parsed?.kind === "construction_retainer") {
      const monthly = retainerMonthlyEstimate(parsed);
      if (monthly > 0 && monthlyRetainer === "") setMonthlyRetainer(String(monthly));
      if (
        typeof parsed.construction_duration_months === "number" &&
        retainerDurationMonths === ""
      ) {
        setRetainerDurationMonths(String(parsed.construction_duration_months));
      }
      if (parsed.reimbursable_expenses_note && reimbursableNote === "") {
        setReimbursableNote(parsed.reimbursable_expenses_note);
      }
    }
    setHasHydratedSettings(true);
  }, [
    tbsRow,
    hasHydratedSettings,
    document,
    persistedKind,
    proposalKind,
    quoteType,
    hourlyRate,
    hoursBlock,
    minCommitment,
    phase1Hours,
    phase2Hours,
    phase3Hours,
    monthlyRetainer,
    retainerDurationMonths,
    reimbursableNote,
  ]);

  const parseOptionalPositive = (s: string): number | null => {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : NaN;
  };
  const parseOptionalNonNegative = (s: string): number | null => {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  const consultancyValidation = useMemo(() => {
    const rate = parseOptionalPositive(hourlyRate);
    const block = parseOptionalPositive(hoursBlock);
    const min = parseOptionalPositive(minCommitment);
    const errors: string[] = [];
    if (Number.isNaN(rate)) errors.push("hourlyRateInvalid");
    if (Number.isNaN(block)) errors.push("hoursBlockInvalid");
    if (Number.isNaN(min)) errors.push("minCommitmentInvalid");
    if (
      typeof block === "number" &&
      typeof min === "number" &&
      min > block
    )
      errors.push("minCommitmentExceedsBlock");
    return {
      rate: typeof rate === "number" ? rate : null,
      block: typeof block === "number" ? block : null,
      min: typeof min === "number" ? min : null,
      errors,
    };
  }, [hourlyRate, hoursBlock, minCommitment]);

  const phaseValidation = useMemo(() => {
    const p1 = parseOptionalNonNegative(phase1Hours);
    const p2 = parseOptionalNonNegative(phase2Hours);
    const p3 = parseOptionalNonNegative(phase3Hours);
    const errors: string[] = [];
    if (Number.isNaN(p1)) errors.push("phase1Invalid");
    if (Number.isNaN(p2)) errors.push("phase2Invalid");
    if (Number.isNaN(p3)) errors.push("phase3Invalid");
    return {
      p1: typeof p1 === "number" ? p1 : null,
      p2: typeof p2 === "number" ? p2 : null,
      p3: typeof p3 === "number" ? p3 : null,
      errors,
    };
  }, [phase1Hours, phase2Hours, phase3Hours]);

  const retainerValidation = useMemo(() => {
    const monthly = parseOptionalPositive(monthlyRetainer);
    const duration = parseOptionalPositive(retainerDurationMonths);
    const errors: string[] = [];
    if (Number.isNaN(monthly)) errors.push("monthlyRetainerInvalid");
    if (Number.isNaN(duration)) errors.push("durationInvalid");
    return {
      monthly: typeof monthly === "number" ? monthly : null,
      duration: typeof duration === "number" ? duration : null,
      errors,
    };
  }, [monthlyRetainer, retainerDurationMonths]);

  const blockValuePreview =
    consultancyValidation.rate !== null && consultancyValidation.block !== null
      ? consultancyValidation.rate * consultancyValidation.block
      : null;
  const minimumFeePreview =
    consultancyValidation.rate !== null && consultancyValidation.min !== null
      ? consultancyValidation.rate * consultancyValidation.min
      : null;

  const buildConsultancyConfig = (): ConsultancyConfig => {
    const phases = [
      {
        label: t("workspace.proposal.generator.consultancy.phase1Label"),
        estimated_hours: phaseValidation.p1,
      },
      {
        label: t("workspace.proposal.generator.consultancy.phase2Label"),
        estimated_hours: phaseValidation.p2,
      },
      {
        label: t("workspace.proposal.generator.consultancy.phase3Label"),
        estimated_hours: phaseValidation.p3,
      },
    ];
    const anyPhaseEntered = phases.some((p) => p.estimated_hours !== null);
    return {
      hourly_rate: consultancyValidation.rate,
      hours_block: consultancyValidation.block,
      minimum_commitment_hours: consultancyValidation.min,
      phases: anyPhaseEntered ? phases : undefined,
    };
  };

  const buildRetainerConfig = (): RetainerConfig => ({
    monthly_estimate: retainerValidation.monthly,
    construction_duration_months: retainerValidation.duration,
    reimbursable_expenses_note: reimbursableNote.trim() || null,
    monthly_resources: [],
  });

  const activeKind: ProposalKind = document ? persistedKind : proposalKind;
  const consultancyHasErrors =
    isConsultancyProposalKind(activeKind) &&
    (consultancyValidation.errors.length > 0 || phaseValidation.errors.length > 0);

  const retainerHasErrors =
    activeKind === "construction_retainer" &&
    retainerValidation.errors.length > 0;

  const missingRequiredFields = (kind: ProposalKind): string[] => {
    if (isConsultancyProposalKind(kind)) {
      const missing: string[] = [];
      if (consultancyValidation.rate === null && document)
        return [];
      if (consultancyValidation.rate === null)
        missing.push(t("workspace.proposal.generator.consultancy.hourlyRate"));
      if (consultancyValidation.block === null)
        missing.push(t("workspace.proposal.generator.consultancy.hoursBlock"));
      if (consultancyValidation.min === null)
        missing.push(t("workspace.proposal.generator.consultancy.minimumCommitment"));
      return missing;
    }
    if (kind === "construction_retainer") {
      const missing: string[] = [];
      if (retainerValidation.monthly === null && document)
        return [];
      if (retainerValidation.monthly === null)
        missing.push(t("workspace.proposal.generator.retainer.monthlyRetainer"));
      if (retainerValidation.duration === null)
        missing.push(t("workspace.proposal.generator.retainer.durationMonths"));
      return missing;
    }
    return [];
  };
  const missingFieldsForActiveKind = missingRequiredFields(activeKind);
  const cannotGenerateTimeBased =
    isTimeBasedProposalKind(activeKind) &&
    (consultancyHasErrors || retainerHasErrors || missingFieldsForActiveKind.length > 0);

  const handleGenerate = async (replaceExistingDraft: boolean) => {
    if (replaceExistingDraft && document) {
      const ok = window.confirm(t("workspace.proposal.generator.regenerateWarning"));
      if (!ok) return;
    }
    // Use whichever kind is currently selected (or the persisted one when
    // regenerating without the selector visible).
    const kind: ProposalKind = document ? persistedKind : proposalKind;
    if (isConsultancyProposalKind(kind) && consultancyHasErrors) {
      toast.error(t("workspace.proposal.generator.consultancy.validationError"));
      return;
    }
    if (kind === "construction_retainer" && retainerHasErrors) {
      toast.error(t("workspace.proposal.generator.retainer.validationError"));
      return;
    }
    const missing = missingRequiredFields(kind);
    if (missing.length > 0) {
      toast.warning(
        t("workspace.proposal.generator.missingRequiredFields", {
          fields: missing.join(", "),
        }),
      );
      return;
    }
    try {
      const result = await generate.mutateAsync({
        quoteId,
        replaceExistingDraft,
        proposalKind: kind,
        consultancy: isConsultancyProposalKind(kind)
          ? buildConsultancyConfig()
          : undefined,
        retainer: kind === "construction_retainer" ? buildRetainerConfig() : undefined,
        persistTimeBasedSettings: isTimeBasedProposalKind(kind),
      });
      toast.success(t("workspace.proposal.generator.success"));
      if (result.missingSlugs.length > 0) {
        toast.warning(
          t("workspace.proposal.generator.missingBlocks", {
            slugs: result.missingSlugs.join(", "),
          }),
        );
      }
      // Refresh both the latest-document and per-document-blocks queries.
      qc.invalidateQueries({ queryKey: ["quote-proposal-documents", quoteId] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "no_blocks") {
        toast.error(t("workspace.proposal.generator.emptyLibrary"));
      } else {
        toast.error(`${t("workspace.proposal.generator.error")} ${message}`);
      }
    }
  };

  if (isLoadingDocument) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("workspace.proposal.generator.generating")}
        </CardContent>
      </Card>
    );
  }

  // Empty state — no document yet.
  if (!document) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold">
              {t("workspace.proposal.generator.title")}
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {t("workspace.proposal.generator.subtitle")}
            </p>
          </div>
          <RadioGroup
            value={proposalKind}
            onValueChange={(v) => setProposalKind(v as ProposalKind)}
            className="grid w-full max-w-md gap-2 text-left"
          >
            {allowedKinds.map((kind) => {
              const meta: Record<ProposalKind, { id: string; label: string; hint: string }> = {
                fixed_project: {
                  id: "kind-fixed",
                  label: t("workspace.proposal.generator.kind.fixedProject"),
                  hint: t("workspace.proposal.generator.kind.fixedProjectHint"),
                },
                phased_consultancy: {
                  id: "kind-consultancy",
                  label: t("workspace.proposal.generator.kind.phasedConsultancy"),
                  hint: t("workspace.proposal.generator.kind.phasedConsultancyHint"),
                },
                consultancy_hours_package: {
                  id: "kind-consultancy-package",
                  label: t("workspace.proposal.generator.kind.consultancyHoursPackage"),
                  hint: t("workspace.proposal.generator.kind.consultancyHoursPackageHint"),
                },
                construction_retainer: {
                  id: "kind-construction-retainer",
                  label: t("workspace.proposal.generator.kind.constructionRetainer"),
                  hint: t("workspace.proposal.generator.kind.constructionRetainerHint"),
                },
                psa_interior_fitout: {
                  id: "kind-psa-interior",
                  label: t("workspace.proposal.generator.kind.psaInteriorFitout"),
                  hint: t("workspace.proposal.generator.kind.psaInteriorFitoutHint"),
                },
              };
              const m = meta[kind];
              return (
                <Label
                  key={kind}
                  htmlFor={m.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
                >
                  <RadioGroupItem id={m.id} value={kind} className="mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.hint}</div>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>

          {isConsultancyProposalKind(proposalKind) && (
            <div className="w-full max-w-md space-y-4 rounded-md border bg-muted/20 p-4 text-left">
              <div>
                <h4 className="text-sm font-semibold">
                  {t("workspace.proposal.generator.consultancy.sectionTitle")}
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("workspace.proposal.generator.consultancy.sectionHint")}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="consultancy-rate" className="text-xs">
                    {t("workspace.proposal.generator.consultancy.hourlyRate")}
                  </Label>
                  <Input
                    id="consultancy-rate"
                    inputMode="decimal"
                    placeholder="90"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="consultancy-block" className="text-xs">
                    {t("workspace.proposal.generator.consultancy.hoursBlock")}
                  </Label>
                  <Input
                    id="consultancy-block"
                    inputMode="decimal"
                    placeholder="50"
                    value={hoursBlock}
                    onChange={(e) => setHoursBlock(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="consultancy-min" className="text-xs">
                    {t("workspace.proposal.generator.consultancy.minimumCommitment")}
                  </Label>
                  <Input
                    id="consultancy-min"
                    inputMode="decimal"
                    placeholder="25"
                    value={minCommitment}
                    onChange={(e) => setMinCommitment(e.target.value)}
                  />
                </div>
              </div>

              {(blockValuePreview !== null || minimumFeePreview !== null) && (
                <div className="grid grid-cols-2 gap-3 rounded-md border bg-background/60 p-3 text-xs">
                  {blockValuePreview !== null && (
                    <div>
                      <div className="text-muted-foreground">
                        {t("workspace.proposal.generator.consultancy.blockValue")}
                      </div>
                      <div className="mt-0.5 font-semibold tabular-nums">
                        {formatCurrency(blockValuePreview)}
                      </div>
                    </div>
                  )}
                  {minimumFeePreview !== null && (
                    <div>
                      <div className="text-muted-foreground">
                        {t("workspace.proposal.generator.consultancy.minimumFee")}
                      </div>
                      <div className="mt-0.5 font-semibold tabular-nums">
                        {formatCurrency(minimumFeePreview)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("workspace.proposal.generator.consultancy.phasesTitle")}
                </div>
                <div className="space-y-2">
                  {[
                    {
                      id: "phase1",
                      label: t("workspace.proposal.generator.consultancy.phase1Label"),
                      value: phase1Hours,
                      setter: setPhase1Hours,
                    },
                    {
                      id: "phase2",
                      label: t("workspace.proposal.generator.consultancy.phase2Label"),
                      value: phase2Hours,
                      setter: setPhase2Hours,
                    },
                    {
                      id: "phase3",
                      label: t("workspace.proposal.generator.consultancy.phase3Label"),
                      value: phase3Hours,
                      setter: setPhase3Hours,
                    },
                  ].map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Label
                        htmlFor={`consultancy-${p.id}`}
                        className="flex-1 text-xs font-normal"
                      >
                        {p.label}
                      </Label>
                      <Input
                        id={`consultancy-${p.id}`}
                        inputMode="decimal"
                        placeholder={t(
                          "workspace.proposal.generator.consultancy.hoursPlaceholder",
                        )}
                        value={p.value}
                        onChange={(e) => p.setter(e.target.value)}
                        className="h-8 w-24"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {consultancyHasErrors && (
                <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {consultancyValidation.errors.map((e) => (
                    <li key={e}>
                      {t(`workspace.proposal.generator.consultancy.errors.${e}`)}
                    </li>
                  ))}
                  {phaseValidation.errors.map((e) => (
                    <li key={e}>
                      {t(`workspace.proposal.generator.consultancy.errors.${e}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {proposalKind === "construction_retainer" && (
            <div className="w-full max-w-md space-y-4 rounded-md border bg-muted/20 p-4 text-left">
              <div>
                <h4 className="text-sm font-semibold">
                  {t("workspace.proposal.generator.retainer.sectionTitle")}
                </h4>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("workspace.proposal.generator.retainer.sectionHint")}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="retainer-monthly" className="text-xs">
                    {t("workspace.proposal.generator.retainer.monthlyRetainer")}
                  </Label>
                  <Input
                    id="retainer-monthly"
                    inputMode="decimal"
                    placeholder="2500"
                    value={monthlyRetainer}
                    onChange={(e) => setMonthlyRetainer(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="retainer-duration" className="text-xs">
                    {t("workspace.proposal.generator.retainer.durationMonths")}
                  </Label>
                  <Input
                    id="retainer-duration"
                    inputMode="decimal"
                    placeholder="6"
                    value={retainerDurationMonths}
                    onChange={(e) => setRetainerDurationMonths(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="retainer-reimbursable" className="text-xs">
                    {t("workspace.proposal.generator.retainer.reimbursableNote")}
                  </Label>
                  <Textarea
                    id="retainer-reimbursable"
                    rows={2}
                    value={reimbursableNote}
                    onChange={(e) => setReimbursableNote(e.target.value)}
                  />
                </div>
              </div>
              {retainerHasErrors && (
                <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  {retainerValidation.errors.map((e) => (
                    <li key={e}>{t(`workspace.proposal.generator.retainer.errors.${e}`)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button
            onClick={() => handleGenerate(true)}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("workspace.proposal.generator.generating")}
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                {t("workspace.proposal.generator.generate")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Document exists — show metadata + block preview.
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Header: title + status + actions */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("workspace.proposal.document.metaTitle")}
            </p>
            <h2 className="text-lg font-semibold leading-tight">
              {document.title}
            </h2>
          </div>
          {document.status === "draft" && (
            <Badge variant="outline">{t("workspace.proposal.generator.regenerate")}</Badge>
          )}
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">
              {t("workspace.proposal.document.status")}
            </div>
            <div className="mt-0.5">
              <Badge variant={statusVariant(document.status)}>
                {t(`workspace.proposal.document.statusLabels.${document.status}`)}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">
              {t("workspace.proposal.document.revision")}
            </div>
            <div className="mt-0.5 font-medium tabular-nums">
              v{document.revision_number}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">
              {t("workspace.proposal.document.generatedAt")}
            </div>
            <div className="mt-0.5 font-medium">
              {safeDateTime(document.generated_at, locale)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">
              {t("workspace.proposal.document.language")}
            </div>
            <div className="mt-0.5 font-medium uppercase">{document.language}</div>
          </div>
        </div>

        {/* Inline consultancy values: lets the user supply hourly rate /
            hours block / minimum commitment after the document has been
            generated, so a regenerate fills in {{hourly_rate}},
            {{block_value}} and {{downpayment_amount}} in the fee block. */}
        {isConsultancyProposalKind(persistedKind) && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <div>
              <h4 className="text-sm font-semibold">
                {t("workspace.proposal.generator.consultancy.sectionTitle")}
              </h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("workspace.proposal.generator.consultancy.sectionHint")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="doc-consultancy-rate" className="text-xs">
                  {t("workspace.proposal.generator.consultancy.hourlyRate")}
                </Label>
                <Input
                  id="doc-consultancy-rate"
                  inputMode="decimal"
                  placeholder="90"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-consultancy-block" className="text-xs">
                  {t("workspace.proposal.generator.consultancy.hoursBlock")}
                </Label>
                <Input
                  id="doc-consultancy-block"
                  inputMode="decimal"
                  placeholder="50"
                  value={hoursBlock}
                  onChange={(e) => setHoursBlock(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-consultancy-min" className="text-xs">
                  {t("workspace.proposal.generator.consultancy.minimumCommitment")}
                </Label>
                <Input
                  id="doc-consultancy-min"
                  inputMode="decimal"
                  placeholder="25"
                  value={minCommitment}
                  onChange={(e) => setMinCommitment(e.target.value)}
                />
              </div>
            </div>
            {(blockValuePreview !== null || minimumFeePreview !== null) && (
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-background/60 p-3 text-xs">
                {blockValuePreview !== null && (
                  <div>
                    <div className="text-muted-foreground">
                      {t("workspace.proposal.generator.consultancy.blockValue")}
                    </div>
                    <div className="mt-0.5 font-semibold tabular-nums">
                      {formatCurrency(blockValuePreview)}
                    </div>
                  </div>
                )}
                {minimumFeePreview !== null && (
                  <div>
                    <div className="text-muted-foreground">
                      {t("workspace.proposal.generator.consultancy.minimumFee")}
                    </div>
                    <div className="mt-0.5 font-semibold tabular-nums">
                      {formatCurrency(minimumFeePreview)}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] italic text-muted-foreground">
              {t("workspace.proposal.generator.consultancy.regenerateHint")}
            </p>
          </div>
        )}

        {persistedKind === "construction_retainer" && (
          <div className="space-y-3 rounded-md border bg-muted/20 p-4">
            <div>
              <h4 className="text-sm font-semibold">
                {t("workspace.proposal.generator.retainer.sectionTitle")}
              </h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("workspace.proposal.generator.retainer.sectionHint")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="doc-retainer-monthly" className="text-xs">
                  {t("workspace.proposal.generator.retainer.monthlyRetainer")}
                </Label>
                <Input
                  id="doc-retainer-monthly"
                  inputMode="decimal"
                  placeholder="2500"
                  value={monthlyRetainer}
                  onChange={(e) => setMonthlyRetainer(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-retainer-duration" className="text-xs">
                  {t("workspace.proposal.generator.retainer.durationMonths")}
                </Label>
                <Input
                  id="doc-retainer-duration"
                  inputMode="decimal"
                  placeholder="6"
                  value={retainerDurationMonths}
                  onChange={(e) => setRetainerDurationMonths(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="doc-retainer-reimbursable" className="text-xs">
                  {t("workspace.proposal.generator.retainer.reimbursableNote")}
                </Label>
                <Textarea
                  id="doc-retainer-reimbursable"
                  rows={2}
                  value={reimbursableNote}
                  onChange={(e) => setReimbursableNote(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {document.status === "draft" && (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(true)}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t("workspace.proposal.generator.regenerate")}
            </Button>
          </div>
        )}

        <Separator />

        {/* Blocks preview */}
        <section>
          <h3 className="mb-3 text-sm font-semibold">
            {t("workspace.proposal.document.blocksTitle")}
          </h3>
          {isLoadingBlocks ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : blocks.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              {t("workspace.proposal.document.noBlocks")}
            </p>
          ) : (
            <div className="space-y-3">
              {blocks.map((b, i) => (
                <GeneratedBlockCard
                  key={b.id}
                  block={b}
                  blocks={blocks}
                  index={i}
                  documentId={document.id}
                  placeholderMap={placeholderMap}
                />
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

// ─────────────────── Legacy auto preview (existing UI) ───────────────────

function LegacyProposalPreview({
  quoteId,
  pricingMultiplier,
  title,
  description,
  clientName,
  accountName,
}: QuoteProposalTabProps) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();

  const { data: stages = [] } = useQuoteStages(quoteId);
  const { data: allocations = [] } = useQuoteAllocations(quoteId);
  const { data: external = [] } = useQuoteExternalServices(quoteId);
  const { data: schedule = [] } = useQuotePaymentSchedule(quoteId);
  const { data: branding } = useFirmBranding();

  const summary = rollupQuote({
    allocations,
    externalServices: external,
    pricingMultiplier,
  });

  const roleMap = new Map<
    string,
    { role: string; hours: number; people: Set<string> }
  >();
  for (const a of allocations) {
    const role = a.resource?.role?.trim() || t("workspace.proposal.unspecifiedRole");
    const { hours } = quoteAllocationLine(a);
    const entry =
      roleMap.get(role) ?? { role, hours: 0, people: new Set<string>() };
    entry.hours += hours;
    if (a.resource?.name) entry.people.add(a.resource.name);
    roleMap.set(role, entry);
  }
  const roles = [...roleMap.values()].sort((a, b) => b.hours - a.hours);

  const triggerLabel = (v: string) =>
    QUOTE_PAYMENT_TRIGGERS.find((x) => x.value === v)?.label ?? v;
  const amountTypeLabel = (v: string) =>
    QUOTE_PAYMENT_AMOUNT_TYPES.find((x) => x.value === v)?.label ?? v;

  const issueDate = format(new Date(), "d MMMM yyyy", { locale });
  const firmName = branding?.company_name?.trim() || null;

  return (
    <div className="legacy-proposal-preview">
      <Card>
        <div className="proposal-section flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            {firmName ? (
              <p className="text-sm font-semibold tracking-tight">{firmName}</p>
            ) : null}
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {t("workspace.proposal.documentLabel")}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground shrink-0">
            <div>{t("workspace.proposal.issueDate")}</div>
            <div className="text-foreground">{issueDate}</div>
          </div>
        </div>

        <CardContent className="space-y-6 pt-6">
          <section className="proposal-section">
            <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {clientName ?? t("workspace.proposal.noClient")}
              {accountName ? ` · ${accountName}` : ""}
            </p>
          </section>

          {description ? (
            <>
              <Separator />
              <section className="proposal-section">
                <h2 className="text-sm font-semibold mb-2">
                  {t("workspace.proposal.descriptionTitle")}
                </h2>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {description}
                </p>
              </section>
            </>
          ) : null}

          <Separator />

          <section className="proposal-section">
            <h2 className="text-sm font-semibold mb-2">
              {t("workspace.proposal.scopeTitle")}
            </h2>
            {stages.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                {t("workspace.proposal.noStages")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {stages.map((s) => (
                  <li
                    key={s.id}
                    className="proposal-row flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: s.color ?? "#22c55e" }}
                      />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {safeDate(s.start_date, locale)} → {safeDate(s.end_date, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Separator />

          <section className="proposal-section">
            <h2 className="text-sm font-semibold mb-2">
              {t("workspace.proposal.teamTitle")}
            </h2>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                {t("workspace.proposal.noTeam")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {roles.map((r) => (
                  <li
                    key={r.role}
                    className="proposal-row flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.role}</div>
                      {r.people.size > 0 && (
                        <div className="text-xs text-muted-foreground truncate">
                          {[...r.people].join(", ")}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {t("workspace.proposal.roleHours", { hours: Math.round(r.hours) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {external.length > 0 && (
            <>
              <Separator />
              <section className="proposal-section">
                <h2 className="text-sm font-semibold mb-2">
                  {t("workspace.proposal.includedServicesTitle")}
                </h2>
                <ul className="space-y-1.5">
                  {external.map((e) => {
                    const lineFee =
                      Number(e.sale_price) *
                      Number(e.quantity) *
                      (pricingMultiplier > 0 ? pricingMultiplier : 1);
                    return (
                      <li
                        key={e.id}
                        className="proposal-row flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
                      >
                        <span className="truncate">{e.description}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatEUR(lineFee)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}

          <Separator />

          <section className="proposal-section rounded-md border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                {t("workspace.proposal.totalFee")}
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {formatEUR(summary.totalFee)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("workspace.proposal.totalFeeHint")}
            </p>
          </section>

          {schedule.length > 0 && (
            <section className="proposal-section">
              <h2 className="text-sm font-semibold mb-2">
                {t("workspace.proposal.paymentScheduleTitle")}
              </h2>
              <ul className="space-y-1.5">
                {schedule.map((p) => (
                  <li
                    key={p.id}
                    className="proposal-row flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate">{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {triggerLabel(p.trigger_type)}
                        {p.expected_invoice_date
                          ? ` · ${safeDate(p.expected_invoice_date, locale)}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                      {p.amount_type === "percent"
                        ? `${Number(p.amount_value)}%`
                        : formatEUR(Number(p.amount_value))}
                      <span className="ml-1 text-muted-foreground">
                        ({amountTypeLabel(p.amount_type)})
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Separator />

          <section className="proposal-section proposal-acceptance">
            <h2 className="text-sm font-semibold mb-1">
              {t("workspace.proposal.acceptanceTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              {t("workspace.proposal.acceptanceHint")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              <div>
                <div className="h-10 border-b border-foreground/40" />
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("workspace.proposal.acceptanceClientName")}
                </div>
              </div>
              <div>
                <div className="h-10 border-b border-foreground/40" />
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("workspace.proposal.acceptanceSignature")}
                </div>
              </div>
              <div>
                <div className="h-10 border-b border-foreground/40" />
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("workspace.proposal.acceptanceDate")}
                </div>
              </div>
              <div>
                <div className="h-10 border-b border-foreground/40" />
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t("workspace.proposal.acceptanceOnBehalf")} {clientName ?? accountName ?? ""}
                </div>
              </div>
            </div>
          </section>

          {(branding?.company_email ||
            branding?.company_phone ||
            branding?.company_address ||
            firmName) && (
            <footer className="proposal-footer proposal-section pt-4 mt-2 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
              <div className="font-medium text-foreground">
                {firmName ?? t("workspace.proposal.footerContact")}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {branding?.company_email ? <span>{branding.company_email}</span> : null}
                {branding?.company_phone ? <span>· {branding.company_phone}</span> : null}
                {branding?.company_address ? <span>· {branding.company_address}</span> : null}
              </div>
            </footer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────── Client/print preview document ───────────────────

/**
 * Clean, client-facing render of a generated proposal document.
 *
 * Used by the Preview mode and by the print pipeline. Hides every editor
 * affordance (cards, badges, switches, edit buttons), drops excluded blocks
 * and empty blocks, and renders included blocks as flowing prose / tables
 * inside a single document container.
 */
/**
 * Strip leftover `{{variable}}` tokens and the awkward sentence fragments
 * they leave behind ("located in", trailing " in .", etc.). Used by the
 * client-facing Preview / PDF document so missing variables never reach
 * the printed page. Editor mode does NOT call this — authors still see
 * raw placeholders.
 */
function sanitizeProseForDisplay(text: string): string {
  if (!text) return text;
  let out = text;
  // Remove standalone `{{var}}` tokens.
  out = out.replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, "");
  out = out
    .replace(/\[\[(project_stage_fee_table|construction_stage_fee_table)\]\]/gi, "Detailed fee schedule to be confirmed.")
    .replace(/\[\[payment_schedule_table\]\]/gi, "Payment schedule to be confirmed.")
    .replace(/\[\[proposal_gantt\]\]/gi, "Programme to be confirmed following validation of project stages.")
    .replace(/\[\[[a-zA-Z_][a-zA-Z0-9_]*\]\]/g, "")
    .replace(/\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}/g, "");
  // Remove whole lines that collapse to an empty location predicate, including
  // markdown-emphasised subjects stored in older generated documents.
  out = out
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s{2,}/g, " ").trim();
      if (/^is\s+(?:located\s+in\s*)?[.,;:!?]$/i.test(trimmed)) return "";
      if (/^\S[\s\S]*?\s+is\s+(?:located\s+in\s*)?[.,;:!?]$/i.test(trimmed)) {
        return "";
      }
      return line;
    })
    .join("\n");
  // Composite empty-predicate fragments (variable resolved to empty).
  out = out.replace(/\bis\s+located\s+in\s*(?=[.,;:!?\n)]|$)/gi, "");
  out = out.replace(/,\s*located in\s*(?=[.,;:!?\n)]|$)/gi, "");
  out = out.replace(/\blocated in\s*(?=[.,;:!?\n)]|$)/gi, "");
  out = out.replace(/\s+in\s*(?=[.,;:!?\n)])/gi, "");
  // Orphan copula left dangling after removals: " is ." / " is ," / " is<EOL>".
  out = out.replace(/\s+\bis\s*(?=[.,;:!?])/gi, "");
  out = out.replace(/\s+\bis\s*$/gim, "");
  out = out
    .replace(/prepared for\s*(?=[.,;:!?\n]|$)/gi, "prepared for the client")
    .replace(/\bDear\s*(?=,)/gi, "Dear Client")
    .replace(/^requires\s+/gim, "The client requires ")
    .replace(/large corporate workplace fit-out for,?/gi, "large corporate workplace fit-out to be developed under PSA’s integrated design and coordination model")
    .replace(/\bprogramme runs for\s*working days\s*across\s*briefing,\s*design,\s*tender\s*and\s*close-out\.?/gi, "programme will be confirmed following validation of the proposed stages.")
    .replace(/\bprogramme runs for\s*working days\b/gi, "programme will be confirmed following validation of the proposed stages")
    .replace(/\bTotal duration\s+working days\.?/gi, "Programme duration to be confirmed following phase validation.")
    .replace(/\bover\s+months\s+at\s+per month\b/gi, "as a monthly retainer aligned with the confirmed construction programme")
    .replace(/\(\s*hours\/month\s*\)/gi, "")
    .replace(/\bthe\s+-day programme\b/gi, "the confirmed programme")
    .replace(/\bfor,\b/gi, "");
  // Tidy " ." → "." after removals.
  out = out.replace(/\s+([.,;:!?])/g, "$1");
  // Drop bare-subject stub lines: with emphasis allow up to 4 words,
  // without emphasis only single-word stubs are dropped so legitimate
  // short sentences are preserved.
  out = out
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s{2,}/g, " ").trimEnd();
      if (/^[\s.,;:]*$/.test(trimmed)) return "";
      if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
        const wordCount = trimmed.replace(/\*/g, "").trim().split(/\s+/).length;
        if (wordCount <= 4) return "";
      }
      const hasEmphasis = /[*_]/.test(trimmed);
      const bare = trimmed.replace(/[*_]/g, "").trim();
      if (/^[A-Za-z0-9][^.,;:!?]*\.$/.test(bare)) {
        const wordCount = bare.slice(0, -1).trim().split(/\s+/).length;
        const limit = hasEmphasis ? 4 : 1;
        if (wordCount <= limit) return "";
      }
      return trimmed;
    })
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/[ \t]{2,}/g, " ");
  return out.trim();
}

/**
 * Minimal prose renderer for editable_text / legal_reference blocks
 * inside the print document. Splits on blank lines into paragraphs and
 * renders inline **bold** / *italic* without pulling in a markdown lib.
 * Anything not recognised renders as plain text — never as raw asterisks.
 */
function ProseBlock({ text, alreadySanitized = false }: { text: string; alreadySanitized?: boolean }) {
  if (!text || !text.trim()) return null;
  // Defensive client-facing cleanup: strip leftover {{...}} tokens that
  // survived the generator (legacy documents, missing variables) and any
  // awkward fragments they leave behind. Editor mode bypasses this — it
  // uses the raw <Textarea> so authors still see the placeholders.
  const cleaned = alreadySanitized ? text.trim() : sanitizeProseForDisplay(text);
  if (!cleaned.trim()) return null;
  const paragraphs = cleaned
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Inline tokeniser: **bold**, *italic*, leave the rest as-is.
  const renderInline = (s: string) => {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      if (m[2] !== undefined) parts.push(<strong key={i++}>{m[2]}</strong>);
      else if (m[3] !== undefined) parts.push(<em key={i++}>{m[3]}</em>);
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function ProposalPrintDocument({
  document,
  blocks,
  clientName,
  accountName,
  proposalKind,
  placeholderMap,
}: {
  document: QuoteProposalDocument;
  blocks: QuoteProposalDocumentBlock[];
  clientName: string | null;
  accountName: string | null;
  proposalKind: ProposalRenderKind;
  placeholderMap: Record<string, string>;
}) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const { data: branding } = useFirmBranding();
  const firmName = branding?.company_name?.trim() || null;
  const issueDate = format(new Date(), "d MMMM yyyy", { locale });

  // Fetch proposal_number directly from fee_proposals (PSA "YYNN" sequence).
  const { data: proposalMeta } = useQuery({
    queryKey: ["fee-proposal-cover-meta", document.quote_id],
    enabled: Boolean(document.quote_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("proposal_number, ontology_family_code, titulo")
        .eq("id", document.quote_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const proposalNumber = proposalMeta?.proposal_number ?? null;
  const projectName = proposalMeta?.titulo ?? document.title ?? null;


  // Ontology-aware cover letter. When the proposal lacks ontology metadata,
  // `view.coverLetter` is undefined and the letter page is simply omitted.
  const { view } = useResolvedProposal({
    quoteId: document.quote_id,
    proposalKind,
    tokens: {
      proposalTitle: document.title,
      proposalCode: proposalNumber,
      clientName,
      accountName,
      projectName,
      firmName,
    },
  });
  const coverLetter = view?.coverLetter;
  const familyLabel = view?.cover?.familyLabel ?? null;


  // Drop excluded blocks; keep original sort order. If the document contains
  // assembled ontology rows, print/export is assembly-authoritative and must
  // not render legacy generic rows that may still be preserved in the editor.
  const hasAssemblyBlocks = useMemo(
    () => blocks.some((b) => b.assembly_section_id !== null),
    [blocks],
  );
  const visible = useMemo(
    () =>
      [...blocks]
        .filter(
          (b) =>
            b.is_included &&
            (!hasAssemblyBlocks || b.assembly_section_id !== null),
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [blocks, hasAssemblyBlocks],
  );

  const getRenderableText = (b: QuoteProposalDocumentBlock): string =>
    sanitizeProseForDisplay(resolveQuoteBuilderPlaceholders(b.content ?? "", placeholderMap));

  // Decide if a block has renderable content; used to hide empty blocks.
  function blockHasContent(b: QuoteProposalDocumentBlock): boolean {
    if (b.block_type === "generated_section") {
      const c = b.generated_content as GenContent;
      if (!c) return false;
      // Consider "non-empty" if any known payload key has data.
      const arrayKeys = ["items", "schedule", "roles", "stages", "phases"];
      if (arrayKeys.some((k) => Array.isArray(c[k]) && (c[k] as unknown[]).length > 0))
        return true;
      const objectKeys = ["fees", "timeline", "acceptance"];
      if (
        objectKeys.some(
          (k) => c[k] && typeof c[k] === "object" && Object.keys(c[k] as object).length > 0,
        )
      )
        return true;
      // Consultancy-fee shape: any of the four numeric fields present.
      if (
        typeof c.hourly_rate === "number" ||
        typeof c.hours_block === "number" ||
        typeof c.minimum_commitment_hours === "number" ||
        typeof c.block_value === "number"
      )
        return true;
      return false;
    }
    return getRenderableText(b).length > 0;
  }

  const renderable = visible.filter(blockHasContent);

  // Address fallback (Pedra Silva Lisbon HQ) until firm branding row is filled.
  const addressLines: string[] =
    branding?.company_address && branding.company_address.trim().length > 0
      ? branding.company_address.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      : [
          t("workspace.proposal.footerAddressFallback.line1", "Lisboa"),
          t(
            "workspace.proposal.footerAddressFallback.line2",
            "Travessa do Corpo Santo 10 – 1ºD",
          ),
          t("workspace.proposal.footerAddressFallback.line3", "1200-131 Lisboa"),
        ];
  const websiteLabel = "www.pedrasilva.com";

  return (
    <article className="proposal-print-document mx-auto bg-background text-foreground">
      {/* Fixed page frame — repeats on every printed page; absolute on screen. */}
      <header className="proposal-page-header" aria-hidden="true">
        <img
          src={logoPSA}
          alt={firmName ?? "Pedra Silva Architects"}
          className="proposal-page-logo"
        />
        <span className="proposal-page-website">{websiteLabel}</span>
      </header>

      <footer className="proposal-page-footer" aria-hidden="true">
        <div className="proposal-page-address">
          {addressLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div className="proposal-page-marks">
          <img
            src={proposalMarkRiba}
            alt="RIBA"
            className="proposal-mark-riba"
          />
          <img
            src={proposalMarkOa}
            alt="Ordem dos Arquitectos"
            className="proposal-mark-oa"
          />
        </div>
      </footer>

      {/* Page 1 — Cover */}
      <section className="proposal-print-block proposal-avoid-break proposal-cover proposal-page-cover">
        <p className="proposal-cover-eyebrow">
          {t("workspace.proposal.documentLabel")}
          {familyLabel ? ` · ${familyLabel}` : ""}
        </p>
        <h1 className="proposal-print-heading proposal-cover-title">{document.title}</h1>
        {proposalNumber && (
          <p className="proposal-cover-number text-sm font-medium tracking-wide">
            {t("workspace.proposal.proposalNumberLabel", "Proposal No.")} {proposalNumber}
          </p>
        )}
        {(clientName || accountName) && (
          <p className="proposal-cover-client">
            {clientName ?? t("workspace.proposal.noClient")}
            {accountName ? ` · ${accountName}` : ""}
          </p>
        )}
        {projectName && projectName !== document.title && (
          <p className="proposal-cover-project text-sm">
            {t("workspace.proposal.projectLabel", "Project")}: {projectName}
          </p>
        )}
        <p className="proposal-cover-date">
          <span className="proposal-cover-date-label">
            {t("workspace.proposal.issueDate")}:
          </span>{" "}
          {issueDate}
        </p>
      </section>

      {/* Page 2 — Cover letter (only when ontology resolves one) */}
      {coverLetter && (
        <section className="proposal-print-block proposal-avoid-break proposal-page-break-before proposal-cover-letter">
          <p className="proposal-cover-letter-greeting mb-3 text-sm">
            {coverLetter.greeting}
          </p>
          <div className="proposal-cover-letter-body space-y-3 text-sm leading-relaxed">
            {coverLetter.paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">{p}</p>
            ))}
          </div>
          <p className="proposal-cover-letter-closing mt-4 text-sm">
            {coverLetter.closing}
          </p>
          <p className="proposal-cover-letter-signatory mt-1 text-sm font-medium">
            {coverLetter.signatory}
          </p>
        </section>
      )}

      {/* Page 3+ — Editable proposal body. First block is forced to a new page
          so that ordering / editing / include-exclude of blocks below remain
          untouched by the cover + letter additions. */}
      {renderable.length === 0 ? (
        <p className="text-sm italic text-muted-foreground proposal-page-break-before">
          {t("workspace.proposal.document.noBlocks")}
        </p>
      ) : (
        <div className="space-y-7">
          {renderable.map((b, idx) => {
            const slug =
              (b as unknown as { slug?: string | null }).slug ??
              inferSlugFromContent(b.generated_content as GenContent);
            const rawContent = b.content ?? "";
            const isAttachmentBlock =
              b.block_type !== "generated_section" && hasAttachmentToken(rawContent);
            const sanitizedContent =
              b.block_type === "generated_section" || isAttachmentBlock
                ? ""
                : getRenderableText(b);
            return (
              <section
                key={b.id}
                className={`proposal-print-block${idx === 0 ? " proposal-page-break-before" : ""}`}
              >
                {b.block_title && (
                  <h2 className="proposal-print-heading mb-2 text-base font-semibold leading-snug">
                    {displayBlockTitle(b.block_title)}
                  </h2>
                )}
                {b.block_type === "generated_section" ? (
                  <GeneratedSectionRenderer
                    slug={slug}
                    content={b.generated_content as GenContent}
                    locale={locale}
                  />
                ) : isAttachmentBlock ? (
                  <div className="space-y-3">
                    {splitOnAttachmentTokens(rawContent).map((seg, i) =>
                      seg.kind === "text" ? (
                        <ProseBlock
                          key={i}
                          text={sanitizeProseForDisplay(
                            resolveQuoteBuilderPlaceholders(seg.value, placeholderMap),
                          )}
                          alreadySanitized
                        />
                      ) : seg.token === "gantt" ? (
                        <GanttPrintable key={i} quoteId={document.quote_id} />
                      ) : (
                        <PaymentSchedulePrintable key={i} quoteId={document.quote_id} />
                      ),
                    )}
                  </div>
                ) : (
                  <ProseBlock text={sanitizedContent} alreadySanitized />
                )}
              </section>
            );
          })}
        </div>

      )}

      {/* Acceptance / signature block — always shown at the end of the
          client-facing document so the proposal can be printed and signed.
          Marked `proposal-acceptance` so the print stylesheet keeps it
          intact across page breaks. */}
      <section className="proposal-print-block proposal-avoid-break proposal-acceptance proposal-signature-block mt-8">
        <h2 className="proposal-print-heading mb-2 text-base font-semibold leading-snug">
          {t("workspace.proposal.acceptanceTitle")}
        </h2>
        <p className="proposal-signature-hint text-xs text-muted-foreground mb-6">
          {t("workspace.proposal.acceptanceHint")}
        </p>
        <div className="proposal-signature-grid">
          <div className="proposal-signature-cell">
            <div className="proposal-signature-line" />
            <div className="proposal-signature-label">
              {t("workspace.proposal.acceptanceClientName")}
              {clientName || accountName ? ` — ${clientName ?? accountName}` : ""}
            </div>
          </div>
          <div className="proposal-signature-cell">
            <div className="proposal-signature-line" />
            <div className="proposal-signature-label">
              {t("workspace.proposal.acceptanceSignature")}
            </div>
          </div>
          <div className="proposal-signature-cell">
            <div className="proposal-signature-line" />
            <div className="proposal-signature-label">
              {t("workspace.proposal.acceptanceDate")}
            </div>
          </div>
          <div className="proposal-signature-cell">
            <div className="proposal-signature-line" />
            <div className="proposal-signature-label">
              {t("workspace.proposal.acceptanceOnBehalf")}
              {firmName ? ` ${firmName}` : ""}
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

// ─────────────────────────── Top-level tab ───────────────────────────

export function QuoteProposalTab(props: QuoteProposalTabProps) {
  const { quoteId, clientName, accountName, quoteType } = props;
  const { t } = useTranslation("crm");
  const qc = useQueryClient();
  const { data: document = null, isLoading: isLoadingDocument } =
    useLatestQuoteProposalDocument(quoteId);
  const { data: blocks = [] } = useQuoteProposalDocumentBlocks(document?.id);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">(props.initialMode ?? "edit");
  const placeholderMap = useQuoteBuilderPlaceholderMap({
    quoteId,
    title: props.title,
    clientName,
    accountName,
  });

  // Proposal number for the toolbar badge — purely display, no mutations.
  const { data: headerMeta } = useQuery({
    queryKey: ["fee-proposal-header-number", quoteId],
    enabled: Boolean(quoteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("proposal_number")
        .eq("id", quoteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const headerProposalNumber = headerMeta?.proposal_number ?? null;

  // Print always runs in preview mode: switch first, then trigger print on
  // the next paint so the DOM reflects the clean document.
  const handlePrint = async () => {
    if (document?.id) {
      await qc.invalidateQueries({ queryKey: ["quote-proposal-documents", quoteId] });
      await qc.invalidateQueries({ queryKey: ["quote-proposal-document-blocks", document.id] });
      await qc.refetchQueries({ queryKey: ["quote-proposal-documents", quoteId], type: "active" });
      await qc.refetchQueries({ queryKey: ["quote-proposal-document-blocks", document.id], type: "active" });
    }
    if (mode !== "preview") {
      flushSync(() => setMode("preview"));
    } else {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  const canPreview = Boolean(document);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2">
          {headerProposalNumber && (
            <Badge variant="outline" className="font-mono text-[11px]">
              {t("workspace.proposal.proposalNumberLabel", "Proposal No.")} {headerProposalNumber}
            </Badge>
          )}
          <p className="text-xs text-muted-foreground">
            {t("workspace.proposal.clientFacingHint")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canPreview && (
            <div
              role="tablist"
              aria-label={t("workspace.proposal.modeToggleLabel")}
              className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "edit"}
                onClick={() => setMode("edit")}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
                  mode === "edit"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {t("workspace.proposal.editMode")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "preview"}
                onClick={() => setMode("preview")}
                className={`inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
                  mode === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                {t("workspace.proposal.previewMode")}
              </button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-1 h-4 w-4" />
            {t("workspace.proposal.print")}
          </Button>
        </div>
      </div>

      {mode === "preview" && document ? (
        <div className="print-area">
          <ProposalPrintDocument
            document={document}
            blocks={blocks}
            clientName={clientName}
            accountName={accountName}
            proposalKind={toRenderKind(quoteTypeToProposalKind(quoteType))}
            placeholderMap={placeholderMap}
          />

        </div>
      ) : (
        <div className="no-print space-y-4">
          {props.showAssemblyTools !== false && (
            <div className="flex justify-end">
              <ProposalAssemblyPanel
                quoteId={quoteId}
                documentId={document?.id}
                quoteCode={null}
                quoteTitle={props.title ?? null}
                clientName={clientName}
                hasExistingBlocks={(blocks?.length ?? 0) > 0}
              />
            </div>
          )}
          <QuoteProposalIntelligencePanel
            quoteId={quoteId}
            documentId={document?.id}
            proposalKind={toRenderKind(
              quoteTypeToProposalKind(quoteType),
            )}
            tokens={{
              clientName,
              accountName,
              proposalTitle: props.title,
            }}
          />
          <GeneratedDocumentSection
            quoteId={quoteId}
            document={document}
            isLoadingDocument={isLoadingDocument}
            title={props.title}
            clientName={clientName}
            accountName={accountName}
            quoteType={quoteType}
            quoteCategory={props.quoteCategory ?? null}
            ontologyFamilyCode={props.ontologyFamilyCode ?? null}
          />
        </div>
      )}

    </div>
  );
}
