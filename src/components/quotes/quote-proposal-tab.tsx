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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { ConsultancyConfig, ProposalKind } from "@/lib/quotes/proposal-generator";
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

interface GeneratedBlockCardProps {
  block: QuoteProposalDocumentBlock;
  blocks: QuoteProposalDocumentBlock[];
  index: number;
  documentId: string;
}

function GeneratedBlockCard({ block, blocks, index, documentId }: GeneratedBlockCardProps) {
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
          <h3 className="text-sm font-semibold leading-tight">{block.block_title}</h3>
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

  // Read prior choice from snapshot when regenerating; otherwise default.
  const persistedKind =
    (document?.snapshot_json as { proposal_kind?: ProposalKind } | null)
      ?.proposal_kind ?? "fixed_project";
  const [proposalKind, setProposalKind] = useState<ProposalKind>(persistedKind);

  // Consultancy commercial settings (in-memory only — not persisted yet).
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [hoursBlock, setHoursBlock] = useState<string>("");
  const [minCommitment, setMinCommitment] = useState<string>("");
  const [phase1Hours, setPhase1Hours] = useState<string>("");
  const [phase2Hours, setPhase2Hours] = useState<string>("");
  const [phase3Hours, setPhase3Hours] = useState<string>("");

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

  const consultancyHasErrors =
    proposalKind === "phased_consultancy" &&
    (consultancyValidation.errors.length > 0 || phaseValidation.errors.length > 0);

  const handleGenerate = async (replaceExistingDraft: boolean) => {
    if (replaceExistingDraft && document) {
      const ok = window.confirm(t("workspace.proposal.generator.regenerateWarning"));
      if (!ok) return;
    }
    // Use whichever kind is currently selected (or the persisted one when
    // regenerating without the selector visible).
    const kind: ProposalKind = document ? persistedKind : proposalKind;
    if (kind === "phased_consultancy" && consultancyHasErrors) {
      toast.error(t("workspace.proposal.generator.consultancy.validationError"));
      return;
    }
    try {
      const result = await generate.mutateAsync({
        quoteId,
        replaceExistingDraft,
        proposalKind: kind,
        consultancy:
          kind === "phased_consultancy" ? buildConsultancyConfig() : undefined,
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
            <Label
              htmlFor="kind-fixed"
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
            >
              <RadioGroupItem id="kind-fixed" value="fixed_project" className="mt-0.5" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">
                  {t("workspace.proposal.generator.kind.fixedProject")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("workspace.proposal.generator.kind.fixedProjectHint")}
                </div>
              </div>
            </Label>
            <Label
              htmlFor="kind-consultancy"
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
            >
              <RadioGroupItem
                id="kind-consultancy"
                value="phased_consultancy"
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">
                  {t("workspace.proposal.generator.kind.phasedConsultancy")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("workspace.proposal.generator.kind.phasedConsultancyHint")}
                </div>
              </div>
            </Label>
          </RadioGroup>

          {proposalKind === "phased_consultancy" && (
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

          <Button
            onClick={() => handleGenerate(true)}
            disabled={generate.isPending || consultancyHasErrors}
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
              {blocks.map((b, i) => (
                <GeneratedBlockCard
                  key={b.id}
                  block={b}
                  blocks={blocks}
                  index={i}
                  documentId={document.id}
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

// ─────────────────── Client/print preview document ───────────────────

/**
 * Clean, client-facing render of a generated proposal document.
 *
 * Used by the Preview mode and by the print pipeline. Hides every editor
 * affordance (cards, badges, switches, edit buttons), drops excluded blocks
 * and empty blocks, and renders included blocks as flowing prose / tables
 * inside a single document container.
 */
function ProposalPrintDocument({
  document,
  blocks,
  clientName,
  accountName,
}: {
  document: QuoteProposalDocument;
  blocks: QuoteProposalDocumentBlock[];
  clientName: string | null;
  accountName: string | null;
}) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const { data: branding } = useFirmBranding();
  const firmName = branding?.company_name?.trim() || null;
  const issueDate = format(new Date(), "d MMMM yyyy", { locale });

  // Drop excluded blocks; keep original sort order.
  const visible = useMemo(
    () =>
      [...blocks]
        .filter((b) => b.is_included)
        .sort((a, b) => a.sort_order - b.sort_order),
    [blocks],
  );

  // Decide if a block has rendrable content; used to hide empty blocks.
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
    return Boolean(b.content && b.content.trim().length > 0);
  }

  const renderable = visible.filter(blockHasContent);

  return (
    <article className="proposal-print-document mx-auto max-w-3xl bg-background px-8 py-10 text-foreground">
      <header className="proposal-print-block proposal-avoid-break mb-8 flex items-start justify-between gap-6 border-b border-border pb-4">
        <div className="min-w-0">
          {firmName ? (
            <p className="text-sm font-semibold tracking-tight">{firmName}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("workspace.proposal.documentLabel")}
          </p>
          <h1 className="proposal-print-heading mt-3 text-2xl font-semibold leading-tight">
            {document.title}
          </h1>
          {(clientName || accountName) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {clientName ?? t("workspace.proposal.noClient")}
              {accountName ? ` · ${accountName}` : ""}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div>{t("workspace.proposal.issueDate")}</div>
          <div className="text-foreground">{issueDate}</div>
        </div>
      </header>

      {renderable.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          {t("workspace.proposal.document.noBlocks")}
        </p>
      ) : (
        <div className="space-y-7">
          {renderable.map((b) => {
            const slug =
              (b as unknown as { slug?: string | null }).slug ??
              inferSlugFromContent(b.generated_content as GenContent);
            return (
              <section key={b.id} className="proposal-print-block proposal-avoid-break">
                {b.block_title && (
                  <h2 className="proposal-print-heading mb-2 text-base font-semibold leading-snug">
                    {b.block_title}
                  </h2>
                )}
                {b.block_type === "generated_section" ? (
                  <GeneratedSectionRenderer
                    slug={slug}
                    content={b.generated_content as GenContent}
                    locale={locale}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {b.content}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {(branding?.company_email ||
        branding?.company_phone ||
        branding?.company_address ||
        firmName) && (
        <footer className="proposal-print-block proposal-avoid-break mt-10 border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
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
    </article>
  );
}

// ─────────────────────────── Top-level tab ───────────────────────────

export function QuoteProposalTab(props: QuoteProposalTabProps) {
  const { quoteId, clientName, accountName } = props;
  const { t } = useTranslation("crm");
  const { data: document = null, isLoading: isLoadingDocument } =
    useLatestQuoteProposalDocument(quoteId);
  const { data: blocks = [] } = useQuoteProposalDocumentBlocks(document?.id);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // Print always runs in preview mode: switch first, then trigger print on
  // the next paint so the DOM reflects the clean document.
  const handlePrint = () => {
    if (mode !== "preview") {
      setMode("preview");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.print());
      });
    } else {
      window.print();
    }
  };

  const canPreview = Boolean(document);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 no-print">
        <p className="text-xs text-muted-foreground">
          {t("workspace.proposal.clientFacingHint")}
        </p>
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
          />
        </div>
      ) : (
        <div className="no-print">
          <GeneratedDocumentSection
            quoteId={quoteId}
            document={document}
            isLoadingDocument={isLoadingDocument}
          />
        </div>
      )}

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
