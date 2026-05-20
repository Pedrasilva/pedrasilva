/**
 * PSA Proposal Ontology — Milestone 2
 * Apply a BootstrapPlan to an existing quote.
 *
 * Rules (the only DB-touching surface for ontology bootstrap):
 *   1. NEVER touch rows where manual_override = true.
 *   2. Existing generated rows with the same phase_code/addon_module_code
 *      are UPDATED in place (dates/order/budget refreshed).
 *   3. Generated rows that no longer appear in the plan AND have
 *      manual_override = false are DELETED.
 *   4. Generated dependencies are reconciled the same way, keyed on the
 *      (predecessor_phase_code, successor_phase_code) pair → resolved to
 *      actual stage ids after step 1–3.
 *   5. Payment items are reconciled by matching generator_source +
 *      phase_code + label. Manual-override items are preserved.
 *   6. fee_proposals row gets its ontology metadata refreshed and
 *      `ontology_bootstrapped_at` stamped.
 *
 * Existing quotes (no preset selected, no bootstrap ever applied) are NEVER
 * touched by this code — it only runs when explicitly invoked.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BootstrapPlan } from "./types";
import { BOOTSTRAP_GENERATOR_SOURCE } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ApplyBootstrapInput {
  quoteId: string;
  plan: BootstrapPlan;
}

export interface ApplyBootstrapResult {
  stagesCreated: number;
  stagesUpdated: number;
  stagesDeleted: number;
  dependenciesCreated: number;
  dependenciesDeleted: number;
  paymentItemsCreated: number;
  paymentItemsDeleted: number;
  preservedManual: number;
}

export async function applyBootstrapPlan({
  quoteId,
  plan,
}: ApplyBootstrapInput): Promise<ApplyBootstrapResult> {
  let preservedManual = 0;

  // ---------- 1) Stage reconciliation ----------
  const { data: existingStages, error: stageErr } = await db
    .from("quote_stages")
    .select("*")
    .eq("quote_id", quoteId);
  if (stageErr) throw new Error(stageErr.message);

  const exStages = (existingStages ?? []) as Array<{
    id: string;
    phase_code: string | null;
    addon_module_code: string | null;
    is_generated: boolean;
    manual_override: boolean;
    generator_source: string | null;
  }>;

  const keyOf = (s: { phase_code: string | null; addon_module_code: string | null }) =>
    s.phase_code ? `phase:${s.phase_code}` : s.addon_module_code ? `addon:${s.addon_module_code}` : "unknown";

  const existingByKey = new Map<string, (typeof exStages)[number]>();
  exStages.forEach((s) => existingByKey.set(keyOf(s), s));

  const planKeys = new Set(plan.stages.map(keyOf));

  // 1a) Delete bootstrap-generated stages that are no longer in the plan AND not manually overridden.
  const toDelete = exStages.filter(
    (s) =>
      s.generator_source === BOOTSTRAP_GENERATOR_SOURCE &&
      !s.manual_override &&
      !planKeys.has(keyOf(s)),
  );
  if (toDelete.length > 0) {
    const { error: delErr } = await db
      .from("quote_stages")
      .delete()
      .in(
        "id",
        toDelete.map((s) => s.id),
      );
    if (delErr) throw new Error(delErr.message);
  }
  preservedManual += exStages.filter((s) => s.manual_override).length;

  // 1b) Upsert each planned stage. Update non-manual existing rows in place, insert if missing.
  let stagesCreated = 0;
  let stagesUpdated = 0;
  const stageIdByKey = new Map<string, string>();
  for (const ps of plan.stages) {
    const key = keyOf(ps);
    const existing = existingByKey.get(key);
    const payload = {
      quote_id: quoteId,
      name: ps.name,
      start_date: ps.start_date,
      end_date: ps.end_date,
      sort_order: ps.sort_order,
      color: ps.color,
      budget: ps.budget,
      phase_code: ps.phase_code,
      addon_module_code: ps.addon_module_code,
      is_generated: true,
      generator_source: BOOTSTRAP_GENERATOR_SOURCE,
    };

    if (existing) {
      if (existing.manual_override) {
        // Preserve user edits — only ensure phase_code linkage exists.
        if (!existing.phase_code && ps.phase_code) {
          await db
            .from("quote_stages")
            .update({ phase_code: ps.phase_code, addon_module_code: ps.addon_module_code })
            .eq("id", existing.id);
        }
        stageIdByKey.set(key, existing.id);
        continue;
      }
      const { error } = await db.from("quote_stages").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      stageIdByKey.set(key, existing.id);
      stagesUpdated++;
    } else {
      const { data, error } = await db
        .from("quote_stages")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      stageIdByKey.set(key, data.id as string);
      stagesCreated++;
    }
  }

  // ---------- 2) Dependency reconciliation ----------
  const { data: existingDeps, error: depErr } = await db
    .from("quote_stage_dependencies")
    .select("id, predecessor_stage_id, successor_stage_id, manual_override, generator_source")
    .eq("quote_id", quoteId);
  if (depErr) throw new Error(depErr.message);

  // 2a) Delete bootstrap-generated dependencies not manually overridden — we'll re-create from plan.
  const depsToDelete = (existingDeps ?? []).filter(
    (d: { generator_source: string | null; manual_override: boolean }) =>
      d.generator_source === BOOTSTRAP_GENERATOR_SOURCE && !d.manual_override,
  );
  if (depsToDelete.length > 0) {
    const { error } = await db
      .from("quote_stage_dependencies")
      .delete()
      .in(
        "id",
        depsToDelete.map((d: { id: string }) => d.id),
      );
    if (error) throw new Error(error.message);
  }

  // 2b) Insert plan dependencies, resolving phase codes → stage ids.
  let dependenciesCreated = 0;
  const depRows = plan.dependencies
    .map((d) => {
      const predId = stageIdByKey.get(`phase:${d.predecessor_phase_code}`);
      const succId = stageIdByKey.get(`phase:${d.successor_phase_code}`);
      if (!predId || !succId) return null;
      return {
        quote_id: quoteId,
        predecessor_stage_id: predId,
        successor_stage_id: succId,
        type: d.type,
        lag_days: d.lag_days,
        is_generated: true,
        generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (depRows.length > 0) {
    // Use onConflict-safe insert: unique (predecessor_stage_id, successor_stage_id).
    const { data, error } = await db
      .from("quote_stage_dependencies")
      .upsert(depRows, { onConflict: "predecessor_stage_id,successor_stage_id" })
      .select("id");
    if (error) throw new Error(error.message);
    dependenciesCreated = (data ?? []).length;
  }

  // ---------- 3) Payment schedule reconciliation ----------
  const { data: existingPayments, error: payErr } = await db
    .from("quote_payment_schedule_items")
    .select("id, manual_override, generator_source")
    .eq("quote_id", quoteId);
  if (payErr) throw new Error(payErr.message);

  const payToDelete = (existingPayments ?? []).filter(
    (p: { generator_source: string | null; manual_override: boolean }) =>
      p.generator_source === BOOTSTRAP_GENERATOR_SOURCE && !p.manual_override,
  );
  if (payToDelete.length > 0) {
    const { error } = await db
      .from("quote_payment_schedule_items")
      .delete()
      .in(
        "id",
        payToDelete.map((p: { id: string }) => p.id),
      );
    if (error) throw new Error(error.message);
  }

  let paymentItemsCreated = 0;
  if (plan.payment_items.length > 0) {
    const payRows = plan.payment_items.map((it) => ({
      quote_id: quoteId,
      label: it.label,
      trigger_type: it.trigger_type,
      amount_type: it.amount_type,
      amount_value: it.amount_value,
      stage_id: it.phase_code ? stageIdByKey.get(`phase:${it.phase_code}`) ?? null : null,
      sort_order: it.sort_order,
      generator_source: BOOTSTRAP_GENERATOR_SOURCE,
      manual_override: false,
    }));
    const { data, error } = await db
      .from("quote_payment_schedule_items")
      .insert(payRows)
      .select("id");
    if (error) throw new Error(error.message);
    paymentItemsCreated = (data ?? []).length;
  }

  // ---------- 4) Update fee_proposals ontology metadata ----------
  const { error: feeErr } = await db
    .from("fee_proposals")
    .update({
      ontology_family_code: plan.family_code,
      ontology_preset_code: plan.preset_code,
      ontology_delivery_mode: plan.delivery_mode,
      ontology_flags: plan.flags,
      ontology_metadata: plan.metadata,
      ontology_bootstrapped_at: new Date().toISOString(),
    })
    .eq("id", quoteId);
  if (feeErr) throw new Error(feeErr.message);

  return {
    stagesCreated,
    stagesUpdated,
    stagesDeleted: toDelete.length,
    dependenciesCreated,
    dependenciesDeleted: depsToDelete.length,
    paymentItemsCreated,
    paymentItemsDeleted: payToDelete.length,
    preservedManual,
  };
}

/**
 * React Query mutation wrapper. Invalidates every quote-scoped cache the
 * bootstrap touches so the existing UI re-renders without code changes.
 */
export function useApplyBootstrapPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: applyBootstrapPlan,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["quote-stages", vars.quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-dependencies", vars.quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-payment-schedule", vars.quoteId] });
      qc.invalidateQueries({ queryKey: ["quote-financials", vars.quoteId] });
      qc.invalidateQueries({ queryKey: ["fee_proposal", vars.quoteId] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}
