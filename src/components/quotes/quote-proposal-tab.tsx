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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO, type Locale } from "date-fns";
import { ChevronDown, FileText, Loader2, Lock, Printer, RefreshCw, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
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
import { useGenerateQuoteProposalDocument } from "@/lib/quotes/use-generate-quote-proposal-document";

interface QuoteProposalTabProps {
  quoteId: string;
  pricingMultiplier: number;
  title: string;
  description: string | null;
  clientName: string | null;
  accountName: string | null;
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
          <table className="w-full text-sm">
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
        <ul className="space-y-1.5">
          {roles.map((r, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 text-sm last:border-0"
            >
              <span className="truncate font-medium">{asStr(r.role) ?? "—"}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {tr("rolesHours", { hours: asNum(r.hours) })}
              </span>
            </li>
          ))}
        </ul>
      );
    }

    case "generated-stage-summary": {
      const stages = asArray<Record<string, unknown>>(content.stages);
      if (stages.length === 0) {
        return <p className="text-sm italic text-muted-foreground">{tr("stagesEmpty")}</p>;
      }
      return (
        <ul className="space-y-1.5">
          {stages.map((s, i) => {
            const start = asStr(s.start_date);
            const end = asStr(s.end_date);
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 text-sm last:border-0"
              >
                <span className="truncate font-medium">{asStr(s.name) ?? "—"}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {start ? safeDate(start, locale) : "—"} →{" "}
                  {end ? safeDate(end, locale) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
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
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          {client && (
            <div>
              <dt className="text-xs text-muted-foreground">{tr("acceptanceClient")}</dt>
              <dd className="font-medium">{client}</dd>
            </div>
          )}
          {proposal && (
            <div>
              <dt className="text-xs text-muted-foreground">{tr("acceptanceProposal")}</dt>
              <dd className="font-medium">{proposal}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">{tr("acceptanceFee")}</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(fee)}</dd>
          </div>
        </dl>
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

function GeneratedBlockCard({ block }: { block: QuoteProposalDocumentBlock }) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const isGenerated = block.block_type === "generated_section";
  // The master block's slug isn't stored on the per-doc row, but the generator
  // names map cleanly via block_title? Safer: derive slug from generated_content
  // shape OR from proposal_block_id join. We expose a `slug` field if present.
  const slug =
    (block as unknown as { slug?: string | null }).slug ??
    inferSlugFromContent(block.generated_content as GenContent);

  return (
    <article
      className={`rounded-md border p-4 ${
        block.is_included ? "bg-card" : "bg-muted/30 opacity-60"
      }`}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight">{block.block_title}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {isGenerated && (
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
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {block.content}
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
}: {
  quoteId: string;
  document: QuoteProposalDocument | null;
  isLoadingDocument: boolean;
}) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const qc = useQueryClient();
  const { data: blocks = [], isLoading: isLoadingBlocks } =
    useQuoteProposalDocumentBlocks(document?.id);
  const generate = useGenerateQuoteProposalDocument();

  const handleGenerate = async (replaceExistingDraft: boolean) => {
    if (replaceExistingDraft && document) {
      const ok = window.confirm(t("workspace.proposal.generator.regenerateWarning"));
      if (!ok) return;
    }
    try {
      const result = await generate.mutateAsync({
        quoteId,
        replaceExistingDraft,
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
              {blocks.map((b) => (
                <GeneratedBlockCard key={b.id} block={b} />
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
    <div className="print-area">
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

// ─────────────────────────── Top-level tab ───────────────────────────

export function QuoteProposalTab(props: QuoteProposalTabProps) {
  const { quoteId } = props;
  const { t } = useTranslation("crm");
  const { data: document = null, isLoading: isLoadingDocument } =
    useLatestQuoteProposalDocument(quoteId);
  const [legacyOpen, setLegacyOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 no-print">
        <p className="text-xs text-muted-foreground">
          {t("workspace.proposal.clientFacingHint")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4 mr-1" />
          {t("workspace.proposal.print")}
        </Button>
      </div>

      <div className="print-area">
        <GeneratedDocumentSection
          quoteId={quoteId}
          document={document}
          isLoadingDocument={isLoadingDocument}
        />
      </div>

      <Collapsible open={legacyOpen} onOpenChange={setLegacyOpen} className="no-print">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-xs text-muted-foreground"
          >
            <span>
              {t("workspace.proposal.legacyPreview.title")} ·{" "}
              <span className="text-muted-foreground/80">
                {t("workspace.proposal.legacyPreview.hint")}
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                legacyOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <LegacyProposalPreview {...props} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
