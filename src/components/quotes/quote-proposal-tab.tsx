/**
 * Proposal tab — client-facing summary of a quote.
 *
 * Phase F (v1):
 * - HTML view (no PDF engine).
 * - "Print / Export to PDF" uses the browser's print dialog. The page already
 *   has print styles in src/styles.css that hide everything outside `.print-area`.
 *
 * Intentionally hides:
 * - Internal cost / margin / profit
 * - Per-allocation hours and rates
 * - Gantt chart visuals
 *
 * Shows:
 * - Project title, client, description
 * - Stage breakdown (name + dates)
 * - Team summary (distinct people involved)
 * - External services summary (description + sale price)
 * - Total fee + optional payment schedule list
 */
import { useTranslation } from "react-i18next";
import { format, parseISO, type Locale } from "date-fns";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { formatEUR } from "@/lib/crm/types";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { rollupQuote } from "@/lib/quotes/financial-rollups";
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

  const summary = rollupQuote({
    allocations,
    externalServices: external,
    pricingMultiplier,
  });

  // De-duplicate the team list by resource id; keep order of first appearance.
  const teamMap = new Map<string, { id: string; name: string; color: string }>();
  for (const a of allocations) {
    if (!a.resource) continue;
    if (teamMap.has(a.resource.id)) continue;
    teamMap.set(a.resource.id, {
      id: a.resource.id,
      name: a.resource.name,
      color: a.resource.color ?? "#a78bfa",
    });
  }
  const team = [...teamMap.values()];

  const triggerLabel = (v: string) =>
    QUOTE_PAYMENT_TRIGGERS.find((x) => x.value === v)?.label ?? v;
  const amountTypeLabel = (v: string) =>
    QUOTE_PAYMENT_AMOUNT_TYPES.find((x) => x.value === v)?.label ?? v;

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
          <CardHeader>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("proposal.documentLabel")}
            </p>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {clientName ?? "—"}
              {accountName ? ` · ${accountName}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {description ? (
              <section>
                <h3 className="text-sm font-semibold mb-2">
                  {t("proposal.descriptionTitle")}
                </h3>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {description}
                </p>
              </section>
            ) : null}

            <Separator />

            <section>
              <h3 className="text-sm font-semibold mb-2">
                {t("proposal.stagesTitle")}
              </h3>
              {stages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("proposal.noStages")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {stages.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
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

            <section>
              <h3 className="text-sm font-semibold mb-2">
                {t("proposal.teamTitle")}
              </h3>
              {team.length === 0 ? (
                <p className="text-sm text-muted-foreground">
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
                <section>
                  <h3 className="text-sm font-semibold mb-2">
                    {t("proposal.externalTitle")}
                  </h3>
                  <ul className="space-y-1.5">
                    {external.map((e) => {
                      const lineFee =
                        Number(e.sale_price) *
                        Number(e.quantity) *
                        (pricingMultiplier > 0 ? pricingMultiplier : 1);
                      return (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
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

            <section className="rounded-md border border-border bg-muted/40 p-4">
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
              <section>
                <h3 className="text-sm font-semibold mb-2">
                  {t("proposal.paymentScheduleTitle")}
                </h3>
                <ul className="space-y-1.5">
                  {schedule.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 text-sm border-b border-border/50 pb-1.5 last:border-0"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
