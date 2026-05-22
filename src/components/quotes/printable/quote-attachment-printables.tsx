/**
 * Live attachment renderers for the proposal print document.
 *
 * These components render the Gantt and Fee/Payment Schedule attachments
 * inline in the proposal from the SAME hooks the quote builder uses.
 * Editing a stage name, fee, payment row or external service in the
 * builder is reflected here in the next render — no data duplication.
 *
 * Used by quote-proposal-tab.tsx when a block body contains the tokens:
 *   {{attachment.gantt}}
 *   {{attachment.fee_payment_schedule}}
 */
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/i18n/use-date-locale";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useQuoteDependencies } from "@/lib/quotes/use-quote-dependencies";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { useQuoteExternalServices } from "@/lib/quotes/use-quote-external-services";
import { quoteAllocationLine } from "@/lib/quotes/financial-rollups";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const fmtMoney = (n: number | null | undefined, currency = "EUR") => {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(n));
};

const fmtHours = (h: number | null | undefined) => {
  if (h == null || !Number.isFinite(Number(h))) return "—";
  return `${Math.round(Number(h))}h`;
};

const parseDay = (s: string | null | undefined) => {
  if (!s) return null;
  try {
    return parseISO(s);
  } catch {
    return null;
  }
};

const daysBetween = (a: Date, b: Date) =>
  Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);

// ───────────────────────────── Gantt ─────────────────────────────

export function GanttPrintable({ quoteId }: { quoteId: string }) {
  const { t } = useTranslation("crm");
  const locale = useDateLocale();
  const { data: stages = [] } = useQuoteStages(quoteId);
  const { data: deps = [] } = useQuoteDependencies(quoteId);

  const bars = useMemo(() => {
    const rows = stages
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.phase_code ?? null,
        start: parseDay(s.start_date),
        end: parseDay(s.end_date),
      }))
      .filter((r) => r.start && r.end) as Array<{
        id: string;
        name: string;
        code: string | null;
        start: Date;
        end: Date;
      }>;
    if (rows.length === 0) return null;
    const min = rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start);
    const max = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
    const span = daysBetween(min, max);
    return rows.map((r) => ({
      ...r,
      offsetPct: ((daysBetween(min, r.start) - 1) / span) * 100,
      widthPct: Math.max(1.5, (daysBetween(r.start, r.end) / span) * 100),
      durationDays: daysBetween(r.start, r.end),
      hasDependency: deps.some((d) => d.successor_stage_id === r.id),
    }));
  }, [stages, deps]);

  if (!bars || bars.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">
        {t(
          "workspace.proposal.attachments.noProgramme",
          "Programme to be confirmed following validation of project stages.",
        )}
      </p>
    );
  }

  return (
    <div className="proposal-attachment-gantt">
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="border-b border-foreground/40">
            <th className="py-1 pr-2 text-left font-semibold" style={{ width: "22%" }}>
              {t("workspace.proposal.attachments.phaseCol", "Phase")}
            </th>
            <th className="py-1 pr-2 text-left font-semibold" style={{ width: "13%" }}>
              {t("workspace.proposal.attachments.startCol", "Start")}
            </th>
            <th className="py-1 pr-2 text-left font-semibold" style={{ width: "13%" }}>
              {t("workspace.proposal.attachments.endCol", "End")}
            </th>
            <th className="py-1 pr-2 text-right font-semibold" style={{ width: "10%" }}>
              {t("workspace.proposal.attachments.daysCol", "Days")}
            </th>
            <th className="py-1 pl-2 text-left font-semibold">
              {t("workspace.proposal.attachments.timelineCol", "Timeline")}
            </th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b, idx) => (
            <tr key={b.id} className="border-b border-foreground/10">
              <td className="py-1.5 pr-2 align-middle">
                <span className="font-medium">
                  {String(idx + 1).padStart(2, "0")} — {b.name}
                </span>
                {b.code && (
                  <span className="ml-1 text-[10px] text-muted-foreground">[{b.code}]</span>
                )}
              </td>
              <td className="py-1.5 pr-2 align-middle text-muted-foreground">
                {format(b.start, "d MMM yy", { locale })}
              </td>
              <td className="py-1.5 pr-2 align-middle text-muted-foreground">
                {format(b.end, "d MMM yy", { locale })}
              </td>
              <td className="py-1.5 pr-2 align-middle text-right tabular-nums">
                {b.durationDays}
              </td>
              <td className="py-1.5 pl-2 align-middle">
                <div
                  className="relative h-3 rounded-sm bg-muted/40"
                  style={{ minWidth: 120 }}
                >
                  <div
                    className="absolute top-0 h-3 rounded-sm bg-foreground/80"
                    style={{
                      left: `${b.offsetPct}%`,
                      width: `${b.widthPct}%`,
                    }}
                    title={`${format(b.start, "d MMM yy", { locale })} → ${format(b.end, "d MMM yy", { locale })}`}
                  />
                  {b.hasDependency && (
                    <div
                      className="absolute -top-0.5 h-4 w-px bg-foreground"
                      style={{ left: `calc(${b.offsetPct}% - 1px)` }}
                      title={t(
                        "workspace.proposal.attachments.dependencyMarker",
                        "Depends on previous phase",
                      )}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] italic text-muted-foreground">
        {t(
          "workspace.proposal.attachments.programmeFootnote",
          "Working programme — durations subject to client approvals and information availability.",
        )}
      </p>
    </div>
  );
}

// ────────────────────── Fee & Payment Schedule ──────────────────────

export function PaymentSchedulePrintable({ quoteId }: { quoteId: string }) {
  const { t } = useTranslation("crm");
  const { data: stages = [] } = useQuoteStages(quoteId);
  const { data: allocations = [] } = useQuoteAllocations(quoteId);
  const { data: schedule = [] } = useQuotePaymentSchedule(quoteId);
  const { data: externals = [] } = useQuoteExternalServices(quoteId);
  const { data: quoteMeta } = useQuery({
    queryKey: ["fee-proposal-attachment-meta", quoteId],
    enabled: Boolean(quoteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("valor, titulo")
        .eq("id", quoteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const currency = "EUR";
  const totalFee = Number(quoteMeta?.valor ?? 0);

  // 1. Hours by role (never by named staff).
  const rolesAgg = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const a of allocations) {
      const role =
        (a.resource?.role && a.resource.role.trim()) ||
        t("workspace.proposal.attachments.unassignedRole", "Team Member");
      const { hours } = quoteAllocationLine(a);
      buckets.set(role, (buckets.get(role) ?? 0) + hours);
    }
    return Array.from(buckets.entries())
      .map(([role, hours]) => ({ role, hours }))
      .sort((a, b) => b.hours - a.hours);
  }, [allocations, t]);

  // 2. Hours per stage (for the phase fees table).
  const hoursByStage = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations) {
      if (!a.stage_id) continue;
      const { hours } = quoteAllocationLine(a);
      m.set(a.stage_id, (m.get(a.stage_id) ?? 0) + hours);
    }
    return m;
  }, [allocations]);

  // 3. Payment schedule rows resolved to absolute amounts and split by stage type.
  const resolvedPayments = useMemo(() => {
    return schedule.map((it) => {
      const raw = Number(it.amount_value ?? 0);
      const amount = it.amount_type === "percent" ? (totalFee * raw) / 100 : raw;
      const stage = stages.find((s) => s.id === it.stage_id) ?? null;
      const isConstruction =
        it.trigger_type === "monthly" ||
        (stage?.phase_code ?? "").toLowerCase().includes("construction") ||
        (stage?.name ?? "").toLowerCase().includes("construction") ||
        (stage?.name ?? "").toLowerCase().includes("assist");
      return {
        id: it.id,
        label: it.label || it.trigger_type,
        trigger: it.trigger_type,
        stageName: stage?.name ?? null,
        amount,
        isConstruction,
      };
    });
  }, [schedule, stages, totalFee]);

  const designPayments = resolvedPayments.filter((p) => !p.isConstruction);
  const constructionPayments = resolvedPayments.filter((p) => p.isConstruction);

  const designTotal = designPayments.reduce((s, p) => s + p.amount, 0);
  const constructionTotal = constructionPayments.reduce((s, p) => s + p.amount, 0);
  const externalsTotal = externals.reduce(
    (s, e) => s + Number(e.sale_price ?? 0) * Number(e.quantity ?? 1),
    0,
  );

  return (
    <div className="proposal-attachment-payment space-y-5">
      {/* Estimated hours by role */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workspace.proposal.attachments.rolesHoursTitle", "Estimated hours by role")}
        </h3>
        {rolesAgg.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            {t("workspace.proposal.attachments.noAllocations", "No allocations yet.")}
          </p>
        ) : (
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="border-b border-foreground/40">
                <th className="py-1 pr-2 text-left font-semibold">
                  {t("workspace.proposal.attachments.roleCol", "Role")}
                </th>
                <th className="py-1 pl-2 text-right font-semibold">
                  {t("workspace.proposal.attachments.hoursCol", "Estimated hours")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rolesAgg.map((r) => (
                <tr key={r.role} className="border-b border-foreground/10">
                  <td className="py-1.5 pr-2">{r.role}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{fmtHours(r.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Phase fees from the fee calculator */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workspace.proposal.attachments.phaseFeesTitle", "Phase fees")}
        </h3>
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="border-b border-foreground/40">
              <th className="py-1 pr-2 text-left font-semibold">
                {t("workspace.proposal.attachments.phaseCol", "Phase")}
              </th>
              <th className="py-1 pr-2 text-right font-semibold">
                {t("workspace.proposal.attachments.hoursCol", "Estimated hours")}
              </th>
              <th className="py-1 pl-2 text-right font-semibold">
                {t("workspace.proposal.attachments.feeCol", "Fee")}
              </th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s, idx) => (
              <tr key={s.id} className="border-b border-foreground/10">
                <td className="py-1.5 pr-2">
                  <span className="font-medium">
                    {String(idx + 1).padStart(2, "0")} — {s.name}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {fmtHours(hoursByStage.get(s.id) ?? null)}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {fmtMoney(s.budget == null ? null : Number(s.budget), currency)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5 pr-2">
                {t("workspace.proposal.attachments.totalRow", "Total")}
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {fmtHours(
                  stages.reduce((sum, s) => sum + (hoursByStage.get(s.id) ?? 0), 0),
                )}
              </td>
              <td className="py-1.5 pl-2 text-right tabular-nums">
                {fmtMoney(
                  stages.reduce(
                    (sum, s) => sum + Number(s.budget ?? 0),
                    0,
                  ),
                  currency,
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Payment schedule — Design Stages */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("workspace.proposal.attachments.designStageTitle", "Payment schedule — Design Stages")}
        </h3>
        {designPayments.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            {t("workspace.proposal.attachments.noPayments", "Payment milestones to be confirmed.")}
          </p>
        ) : (
          <PaymentRows rows={designPayments} total={designTotal} currency={currency} t={t} />
        )}
      </section>

      {/* Payment schedule — Construction Stage (monthly retainer) */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(
            "workspace.proposal.attachments.constructionStageTitle",
            "Payment schedule — Construction Stage (monthly retainer)",
          )}
        </h3>
        {constructionPayments.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            {t(
              "workspace.proposal.attachments.noConstruction",
              "Construction assistance not included or to be confirmed.",
            )}
          </p>
        ) : (
          <PaymentRows
            rows={constructionPayments}
            total={constructionTotal}
            currency={currency}
            t={t}
          />
        )}
      </section>

      {/* External services — billed together or separately */}
      {externals.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("workspace.proposal.attachments.externalServicesTitle", "External services")}
          </h3>
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="border-b border-foreground/40">
                <th className="py-1 pr-2 text-left font-semibold">
                  {t("workspace.proposal.attachments.descriptionCol", "Description")}
                </th>
                <th className="py-1 pl-2 text-right font-semibold">
                  {t("workspace.proposal.attachments.amountCol", "Amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {externals.map((e) => (
                <tr key={e.id} className="border-b border-foreground/10">
                  <td className="py-1.5 pr-2">{e.description}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">
                    {fmtMoney(
                      Number(e.sale_price ?? 0) * Number(e.quantity ?? 1),
                      currency,
                    )}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5 pr-2">
                  {t("workspace.proposal.attachments.totalRow", "Total")}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {fmtMoney(externalsTotal, currency)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            {t(
              "workspace.proposal.attachments.externalServicesNote",
              "External services may be billed together with architecture fees or separately, per the quote's billing mode.",
            )}
          </p>
        </section>
      )}
    </div>
  );
}

function PaymentRows({
  rows,
  total,
  currency,
  t,
}: {
  rows: Array<{ id: string; label: string; trigger: string; stageName: string | null; amount: number }>;
  total: number;
  currency: string;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr className="border-b border-foreground/40">
          <th className="py-1 pr-2 text-left font-semibold">
            {t("workspace.proposal.attachments.milestoneCol", "Milestone")}
          </th>
          <th className="py-1 pr-2 text-left font-semibold">
            {t("workspace.proposal.attachments.triggerCol", "Trigger")}
          </th>
          <th className="py-1 pl-2 text-right font-semibold">
            {t("workspace.proposal.attachments.amountCol", "Amount")}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-foreground/10">
            <td className="py-1.5 pr-2">
              <span className="font-medium">{p.label}</span>
              {p.stageName && (
                <span className="ml-1 text-muted-foreground">· {p.stageName}</span>
              )}
            </td>
            <td className="py-1.5 pr-2 text-muted-foreground">{p.trigger}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">
              {fmtMoney(p.amount, currency)}
            </td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className="py-1.5 pr-2" colSpan={2}>
            {t("workspace.proposal.attachments.subtotalRow", "Subtotal")}
          </td>
          <td className="py-1.5 pl-2 text-right tabular-nums">{fmtMoney(total, currency)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ────────────── Block splitter helper (token → component) ──────────────

const ATTACHMENT_TOKEN_RE =
  /\{\{\s*attachment\.(gantt|fee_payment_schedule)\s*\}\}/g;

export function hasAttachmentToken(text: string | null | undefined): boolean {
  if (!text) return false;
  ATTACHMENT_TOKEN_RE.lastIndex = 0;
  return ATTACHMENT_TOKEN_RE.test(text);
}

export type AttachmentSegment =
  | { kind: "text"; value: string }
  | { kind: "attachment"; token: "gantt" | "fee_payment_schedule" };

export function splitOnAttachmentTokens(text: string): AttachmentSegment[] {
  if (!text) return [];
  const out: AttachmentSegment[] = [];
  let lastIndex = 0;
  ATTACHMENT_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTACHMENT_TOKEN_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: "text", value: text.slice(lastIndex, m.index) });
    }
    out.push({ kind: "attachment", token: m[1] as "gantt" | "fee_payment_schedule" });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return out;
}
