/**
 * PSA Proposal Ontology — Milestone 2
 * Convenience: one-call bootstrap from a quote id + preset code.
 *
 * Components should call this hook, NOT poke at plan.ts / apply.ts directly.
 * It loads the registry data, computes the plan, applies it, and returns
 * the apply result. Pure orchestration stays out of React.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useApplyBootstrapPlan } from "./apply";
import { computeBootstrapPlan } from "./plan";
import type { ApplyBootstrapResult } from "./apply";
import type {
  ProposalPhase,
  ProposalPreset,
  ProposalFamily,
  ProposalDeliveryMode,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface BootstrapFromPresetInput {
  quoteId: string;
  presetCode: string;
  projectStart: string;
  durationsByPhase?: Record<string, number>;
  defaultDurationDays?: number;
  budgetsByPhase?: Record<string, number>;
  flags?: Record<string, unknown>;
  /** UI override of preset.enabled_phases — see bootstrap/types.ts. */
  enabledPhasesOverride?: string[];
}

export function useBootstrapQuoteFromPreset() {
  const qc = useQueryClient();
  const applyMutation = useApplyBootstrapPlan();

  const run = useCallback(
    async (input: BootstrapFromPresetInput): Promise<ApplyBootstrapResult> => {
      // Pull the preset + canonical phase registry + optional family/delivery in parallel.
      const [presetRes, phasesRes] = await Promise.all([
        db
          .from("proposal_presets")
          .select("*")
          .eq("code", input.presetCode)
          .eq("is_active", true)
          .maybeSingle(),
        db
          .from("proposal_phases")
          .select("*")
          .eq("is_active", true)
          .order("default_order", { ascending: true }),
      ]);

      if (presetRes.error) throw new Error(presetRes.error.message);
      if (phasesRes.error) throw new Error(phasesRes.error.message);
      const preset = presetRes.data as ProposalPreset | null;
      if (!preset) throw new Error(`Preset "${input.presetCode}" not found`);
      const phases = (phasesRes.data ?? []) as ProposalPhase[];

      let family: ProposalFamily | null = null;
      let deliveryMode: ProposalDeliveryMode | null = null;
      if (preset.family_code) {
        const { data } = await db
          .from("proposal_families")
          .select("*")
          .eq("code", preset.family_code)
          .maybeSingle();
        family = (data ?? null) as ProposalFamily | null;
      }
      if (preset.default_delivery_mode) {
        const { data } = await db
          .from("proposal_delivery_modes")
          .select("*")
          .eq("code", preset.default_delivery_mode)
          .maybeSingle();
        deliveryMode = (data ?? null) as ProposalDeliveryMode | null;
      }

      const plan = computeBootstrapPlan({
        preset,
        phases,
        family,
        deliveryMode,
        projectStart: input.projectStart,
        durationsByPhase: input.durationsByPhase,
        defaultDurationDays: input.defaultDurationDays,
        budgetsByPhase: input.budgetsByPhase,
        flags: input.flags,
        enabledPhasesOverride: input.enabledPhasesOverride,
      });

      const result = await applyMutation.mutateAsync({ quoteId: input.quoteId, plan });
      // Make sure consumers re-read the proposal row too. The quote detail
      // route uses the underscore key; the older hyphenated key left
      // ontology_family_code stale in the Proposal tab after Apply.
      qc.invalidateQueries({ queryKey: ["fee_proposal", input.quoteId] });
      return result;
    },
    [applyMutation, qc],
  );

  return {
    bootstrap: run,
    isPending: applyMutation.isPending,
    error: applyMutation.error,
    reset: applyMutation.reset,
  };
}
