/**
 * Payment schedule generators for quotes.
 *
 * Each generator produces a list of payment items for a given quote planning
 * context (stages + total fee). Generators NEVER overwrite items flagged
 * `manual_override = true`. Existing generator-created items are replaced
 * when their generator_source matches.
 */
import type { QuoteStage } from "./types";

export type GeneratorKind = "milestones" | "thirds" | "monthly";

export interface GeneratorItem {
  label: string;
  trigger_type: "project_start" | "stage_start" | "stage_end" | "manual_date" | "monthly";
  amount_type: "percent" | "fixed";
  amount_value: number;
  stage_id: string | null;
  expected_invoice_date: string | null;
  expected_payment_date: string | null;
  sort_order: number;
  generator_source: GeneratorKind;
}

/** 1× per stage, equal % split, triggered at stage_end. */
export function generateStageMilestones(stages: QuoteStage[]): GeneratorItem[] {
  if (stages.length === 0) return [];
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const pct = Math.floor((100 / sorted.length) * 100) / 100; // 2dp
  const items: GeneratorItem[] = sorted.map((s, i) => ({
    label: s.name,
    trigger_type: "stage_end",
    amount_type: "percent",
    amount_value: pct,
    stage_id: s.id,
    expected_invoice_date: null,
    expected_payment_date: null,
    sort_order: i,
    generator_source: "milestones",
  }));
  // Add residual to last item to ensure 100% sum
  const sum = items.reduce((a, x) => a + x.amount_value, 0);
  const residual = Math.round((100 - sum) * 100) / 100;
  if (residual !== 0 && items.length > 0) {
    items[items.length - 1].amount_value =
      Math.round((items[items.length - 1].amount_value + residual) * 100) / 100;
  }
  return items;
}

/** 30% project_start, 40% mid (manual_date midpoint), 30% project_end (last stage_end). */
export function generateThirds(stages: QuoteStage[]): GeneratorItem[] {
  if (stages.length === 0) {
    return [
      {
        label: "Adiantamento (30%)",
        trigger_type: "project_start",
        amount_type: "percent",
        amount_value: 30,
        stage_id: null,
        expected_invoice_date: null,
        expected_payment_date: null,
        sort_order: 0,
        generator_source: "thirds",
      },
      {
        label: "Intermédio (40%)",
        trigger_type: "manual_date",
        amount_type: "percent",
        amount_value: 40,
        stage_id: null,
        expected_invoice_date: null,
        expected_payment_date: null,
        sort_order: 1,
        generator_source: "thirds",
      },
      {
        label: "Final (30%)",
        trigger_type: "manual_date",
        amount_type: "percent",
        amount_value: 30,
        stage_id: null,
        expected_invoice_date: null,
        expected_payment_date: null,
        sort_order: 2,
        generator_source: "thirds",
      },
    ];
  }

  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const lastStage = sorted[sorted.length - 1];
  const minStart = sorted.reduce((m, s) => (s.start_date < m ? s.start_date : m), sorted[0].start_date);
  const maxEnd = sorted.reduce((m, s) => (s.end_date > m ? s.end_date : m), sorted[0].end_date);
  const midDate = midpointISO(minStart, maxEnd);

  return [
    {
      label: "Adiantamento (30%)",
      trigger_type: "project_start",
      amount_type: "percent",
      amount_value: 30,
      stage_id: null,
      expected_invoice_date: minStart,
      expected_payment_date: null,
      sort_order: 0,
      generator_source: "thirds",
    },
    {
      label: "Intermédio (40%)",
      trigger_type: "manual_date",
      amount_type: "percent",
      amount_value: 40,
      stage_id: null,
      expected_invoice_date: midDate,
      expected_payment_date: null,
      sort_order: 1,
      generator_source: "thirds",
    },
    {
      label: "Final (30%)",
      trigger_type: "stage_end",
      amount_type: "percent",
      amount_value: 30,
      stage_id: lastStage.id,
      expected_invoice_date: lastStage.end_date,
      expected_payment_date: null,
      sort_order: 2,
      generator_source: "thirds",
    },
  ];
}

/** N monthly invoices spread across the project span. Equal % split. */
export function generateMonthly(stages: QuoteStage[]): GeneratorItem[] {
  if (stages.length === 0) return [];
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const minStart = sorted.reduce((m, s) => (s.start_date < m ? s.start_date : m), sorted[0].start_date);
  const maxEnd = sorted.reduce((m, s) => (s.end_date > m ? s.end_date : m), sorted[0].end_date);

  const months = monthsBetween(minStart, maxEnd);
  if (months.length === 0) return [];

  const pct = Math.floor((100 / months.length) * 100) / 100;
  const items: GeneratorItem[] = months.map((d, i) => ({
    label: `${formatYearMonth(d)}`,
    trigger_type: "monthly",
    amount_type: "percent",
    amount_value: pct,
    stage_id: null,
    expected_invoice_date: d,
    expected_payment_date: null,
    sort_order: i,
    generator_source: "monthly",
  }));
  const sum = items.reduce((a, x) => a + x.amount_value, 0);
  const residual = Math.round((100 - sum) * 100) / 100;
  if (residual !== 0 && items.length > 0) {
    items[items.length - 1].amount_value =
      Math.round((items[items.length - 1].amount_value + residual) * 100) / 100;
  }
  return items;
}

// ----------------- helpers -----------------

function midpointISO(startISO: string, endISO: string): string {
  const s = new Date(startISO + "T00:00:00Z").getTime();
  const e = new Date(endISO + "T00:00:00Z").getTime();
  const m = new Date((s + e) / 2);
  return m.toISOString().slice(0, 10);
}

function monthsBetween(startISO: string, endISO: string): string[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  if (end < start) return [];
  const out: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function formatYearMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
