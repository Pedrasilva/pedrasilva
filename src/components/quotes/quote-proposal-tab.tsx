/**
 * Proposal tab — client-facing summary of a quote.
 *
 * Phase F.1 polish:
 * - Light branding header (firm name + issue date) pulled from the singleton
 *   pm_invoice_settings row. No heavy template, no editor.
 * - Friendlier section labels: "Scope of Work", "Project Team",
 *   "Included Services".
 * - Better empty states (human, not system-like).
 * - Print-friendly: each major section sits inside a `.proposal-section`
 *   block so print CSS can keep titles with their content (page-break-inside
 *   rules live in src/styles.css).
 *
 * Still intentionally hides:
 * - Internal cost / margin / profit
 * - Per-allocation hours and rates
 * - Gantt visuals
 *
 * "Print / Export to PDF" still uses the browser's print dialog.
 */
import { useTranslation } from "react-i18next";
import { format, parseISO, type Locale } from "date-fns";
import { Printer } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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

/**
 * Singleton firm-level invoice settings — used here only for branding
 * (firm name). pm_invoice_settings is shared across the app for projects;
 * the row with `project_id IS NULL` represents the studio defaults.
 */
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

export function QuoteProposalTab({
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

  // Role-based snapshot for the client-facing proposal: clients care about
  // *what roles* are on the project (e.g. "Architect: 120h"), not which
  // individual person fills them. Aggregate hours per role; if no role is
  // defined for a resource, bucket as "Team Member" so the proposal still
  // shows commitment without exposing internal staffing decisions.
  const roleMap = new Map<string, { role: string; hours: number; people: Set<string> }>();
  for (const a of allocations) {
    const role = a.resource?.role?.trim() || t("proposal.unspecifiedRole");
    const { hours } = quoteAllocationLine(a);
    const entry = roleMap.get(role) ?? { role, hours: 0, people: new Set<string>() };
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 no-print">
        <p className="text-xs text-muted-foreground">
          {t("proposal.clientFacingHint")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4 mr-1" />
          {t("proposal.print")}
        </Button>
      </div>

      <div className="print-area">
        <Card>
          {/* ── Branded header ─────────────────────────────────────── */}
          <div className="proposal-section flex items-start justify-between gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0">
              {firmName ? (
                <p className="text-sm font-semibold tracking-tight">{firmName}</p>
              ) : null}
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {t("proposal.documentLabel")}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <div>{t("proposal.issueDate")}</div>
              <div className="text-foreground">{issueDate}</div>
            </div>
          </div>

          <CardContent className="space-y-6 pt-6">
            {/* ── Title block ─────────────────────────────────────── */}
            <section className="proposal-section">
              <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {clientName ?? t("proposal.noClient")}
                {accountName ? ` · ${accountName}` : ""}
              </p>
            </section>

            {description ? (
              <>
                <Separator />
                <section className="proposal-section">
                  <h2 className="text-sm font-semibold mb-2">
                    {t("proposal.descriptionTitle")}
                  </h2>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {description}
                  </p>
                </section>
              </>
            ) : null}

            <Separator />

            {/* ── Scope of Work ───────────────────────────────────── */}
            <section className="proposal-section">
              <h2 className="text-sm font-semibold mb-2">
                {t("proposal.scopeTitle")}
              </h2>
              {stages.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {t("proposal.noStages")}
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

            {/* ── Project Team ────────────────────────────────────── */}
            <section className="proposal-section">
              <h2 className="text-sm font-semibold mb-2">
                {t("proposal.teamTitle")}
              </h2>
              {team.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  {t("proposal.noTeam")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {team.map((m) => (
                    <li
                      key={m.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: m.color }}
                      />
                      {m.name}
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
                    {t("proposal.includedServicesTitle")}
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
                  {t("proposal.totalFee")}
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatEUR(summary.totalFee)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("proposal.totalFeeHint")}
              </p>
            </section>

            {schedule.length > 0 && (
              <section className="proposal-section">
                <h2 className="text-sm font-semibold mb-2">
                  {t("proposal.paymentScheduleTitle")}
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

            {/* ── Client acceptance / signature block ────────────────── */}
            <section className="proposal-section proposal-acceptance">
              <h2 className="text-sm font-semibold mb-1">
                {t("proposal.acceptanceTitle")}
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                {t("proposal.acceptanceHint")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <div className="h-10 border-b border-foreground/40" />
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("proposal.acceptanceClientName")}
                  </div>
                </div>
                <div>
                  <div className="h-10 border-b border-foreground/40" />
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("proposal.acceptanceSignature")}
                  </div>
                </div>
                <div>
                  <div className="h-10 border-b border-foreground/40" />
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("proposal.acceptanceDate")}
                  </div>
                </div>
                <div>
                  <div className="h-10 border-b border-foreground/40" />
                  <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t("proposal.acceptanceOnBehalf")} {clientName ?? accountName ?? ""}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Firm contact footer (print-only) ───────────────────── */}
            {(branding?.company_email ||
              branding?.company_phone ||
              branding?.company_address ||
              firmName) && (
              <footer className="proposal-footer proposal-section pt-4 mt-2 border-t border-border text-[11px] text-muted-foreground leading-relaxed">
                <div className="font-medium text-foreground">
                  {firmName ?? t("proposal.footerContact")}
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
    </div>
  );
}
