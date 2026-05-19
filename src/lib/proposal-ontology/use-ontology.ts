import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ProposalFamily,
  ProposalPhase,
  ProposalPhaseAlias,
  ProposalAddonModule,
  ProposalDeliveryMode,
  ProposalCommercialComponent,
  ProposalFlag,
  ProposalPreset,
  AliasSet,
} from "./types";

// ============================================================
// PSA Proposal Ontology — Milestone 1
// Read-only hooks. Long stale time: registry data changes
// rarely and is shared across the app.
// ============================================================

const STALE = 1000 * 60 * 30; // 30 min

export function useProposalPhases() {
  return useQuery({
    queryKey: ["proposal-ontology", "phases"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalPhase[]> => {
      const { data, error } = await supabase
        .from("proposal_phases")
        .select("*")
        .eq("is_active", true)
        .order("default_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalFamilies() {
  return useQuery({
    queryKey: ["proposal-ontology", "families"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalFamily[]> => {
      const { data, error } = await supabase
        .from("proposal_families")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalPhaseAliases(aliasSet?: AliasSet, locale?: string) {
  return useQuery({
    queryKey: ["proposal-ontology", "phase-aliases", aliasSet ?? "*", locale ?? "*"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalPhaseAlias[]> => {
      let q = supabase.from("proposal_phase_aliases").select("*");
      if (aliasSet) q = q.eq("alias_set", aliasSet);
      if (locale) q = q.eq("locale", locale);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalAddonModules() {
  return useQuery({
    queryKey: ["proposal-ontology", "addons"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalAddonModule[]> => {
      const { data, error } = await supabase
        .from("proposal_addon_modules")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalDeliveryModes() {
  return useQuery({
    queryKey: ["proposal-ontology", "delivery-modes"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalDeliveryMode[]> => {
      const { data, error } = await supabase
        .from("proposal_delivery_modes")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalCommercialComponents() {
  return useQuery({
    queryKey: ["proposal-ontology", "commercial-components"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalCommercialComponent[]> => {
      const { data, error } = await supabase
        .from("proposal_commercial_components")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalFlags() {
  return useQuery({
    queryKey: ["proposal-ontology", "flags"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalFlag[]> => {
      const { data, error } = await supabase
        .from("proposal_flags")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProposalPresets() {
  return useQuery({
    queryKey: ["proposal-ontology", "presets"],
    staleTime: STALE,
    queryFn: async (): Promise<ProposalPreset[]> => {
      const { data, error } = await supabase
        .from("proposal_presets")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ------------------------------------------------------------
// Convenience lookups (pure; safe to use anywhere).
// ------------------------------------------------------------

export function resolvePhaseLabel(
  phase: ProposalPhase,
  locale: "en" | "pt-PT" = "en",
): string {
  return locale === "pt-PT" ? phase.label_pt : phase.label_en;
}

export function resolveAliasLabel(
  aliases: ProposalPhaseAlias[],
  phaseCode: string,
  aliasSet: AliasSet,
  locale: string = "en",
): string | undefined {
  const exact = aliases.find(
    (a) => a.phase_code === phaseCode && a.alias_set === aliasSet && a.locale === locale,
  );
  if (exact) return exact.label;
  // fallback to any locale within the alias_set
  const any = aliases.find(
    (a) => a.phase_code === phaseCode && a.alias_set === aliasSet,
  );
  return any?.label;
}
