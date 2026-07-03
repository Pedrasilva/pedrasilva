/**
 * Quote-owned Construction Assistance site trips.
 * Persists per proposal in quote_site_trips.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type QuoteSiteTripFrequencyMode = "per_month" | "total";

export interface QuoteSiteTrip {
  id: string;
  quote_id: string;
  stage_id: string | null;
  label: string;
  km: number;
  price_per_km: number;
  trip_hours: number;
  /** Legacy single-resource pointer. Kept for backward compatibility. */
  resource_id: string | null;
  /** Multi-resource list. When non-empty, drives the per-trip hourly rate. */
  resource_ids: string[];
  /** Per-resource €/h override map (resource_id → hourly rate). Empty/0 = use resource default. */
  resource_hourly_rates: Record<string, number>;
  /** Manual €/h override — replaces the resource sum when > 0. */
  resource_hourly_rate: number;
  frequency_mode: QuoteSiteTripFrequencyMode;
  frequency_value: number;
  /** Optional override (in months) for the construction period. When set and
   *  frequency_mode = "per_month", this replaces the stage's date-derived duration. */
  duration_months_override: number | null;
  /** How resources should be referenced in the generated proposal.
   *  "role" (default) → billable role (proposal_role / billing_role / role).
   *  "name" → collaborator name. */
  display_mode: "name" | "role";
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type QuoteSiteTripInsert = Partial<QuoteSiteTrip> & { quote_id: string };
export type QuoteSiteTripUpdate = Partial<QuoteSiteTrip> & { id: string };

export function useQuoteSiteTrips(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote-site-trips", quoteId],
    enabled: !!quoteId,
    queryFn: async (): Promise<QuoteSiteTrip[]> => {
      const { data, error } = await db
        .from("quote_site_trips")
        .select("*")
        .eq("quote_id", quoteId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as QuoteSiteTrip[];
    },
  });
}

export function useUpsertQuoteSiteTrip(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteSiteTripInsert | QuoteSiteTripUpdate) => {
      if ("id" in input && input.id) {
        const { id, ...rest } = input;
        const { data, error } = await db
          .from("quote_site_trips")
          .update(rest)
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as QuoteSiteTrip;
      }
      const { data, error } = await db
        .from("quote_site_trips")
        .insert({ ...input, quote_id: quoteId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as QuoteSiteTrip;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-site-trips", quoteId] });
    },
  });
}

export function useDeleteQuoteSiteTrip(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("quote_site_trips").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quote-site-trips", quoteId] });
    },
  });
}

// ---------------- Cost math ----------------

export interface TripCostBreakdown {
  perTripKmCost: number;
  perTripHrCost: number;
  perTripTotal: number;
  totalTrips: number;
  totalCost: number;
}

/** Duration of a stage in months (30.44 days ≈ 1 month). Returns null if dates missing. */
export function stageDurationMonths(
  startISO: string | null | undefined,
  endISO: string | null | undefined,
): number | null {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const days = (end - start) / (1000 * 60 * 60 * 24);
  return days / 30.4375;
}

/**
 * Effective hourly rate for a trip.
 *
 * Default = sum of the sale €/h of every selected resource on the trip
 * (each resource contributes its own €/h; a 2-person trip bills 2× the
 * hourly cost). The manual override (`resource_hourly_rate`) replaces
 * that sum when it is > 0 — used for per-diem, tooling, or a negotiated
 * flat rate. When the manual field is 0, the resource sum is used.
 */
export function computeTripHourlyRate(
  trip: Pick<QuoteSiteTrip, "resource_ids" | "resource_hourly_rate" | "resource_hourly_rates">,
  resourceRateById: Map<string, number>,
): number {
  const manual = Number(trip.resource_hourly_rate) || 0;
  if (manual > 0) return manual;
  const ids = trip.resource_ids ?? [];
  const overrides = trip.resource_hourly_rates ?? {};
  return ids.reduce((s, id) => {
    const override = Number(overrides?.[id]) || 0;
    const base = Number(resourceRateById.get(id)) || 0;
    return s + (override > 0 ? override : base);
  }, 0);
}

export function computeTripCost(
  trip: Pick<
    QuoteSiteTrip,
    "km" | "price_per_km" | "trip_hours" | "resource_hourly_rate" | "resource_hourly_rates" | "resource_ids" | "frequency_mode" | "frequency_value" | "duration_months_override"
  >,
  stageMonths: number | null,
  resourceRateById: Map<string, number> = new Map(),
): TripCostBreakdown {
  const km = Number(trip.km) || 0;
  const ppk = Number(trip.price_per_km) || 0;
  const hrs = Number(trip.trip_hours) || 0;
  const rate = computeTripHourlyRate(trip, resourceRateById);
  const perTripKmCost = km * ppk * 2;
  const perTripHrCost = hrs * rate * 2;
  const perTripTotal = perTripKmCost + perTripHrCost;
  const freqVal = Number(trip.frequency_value) || 0;
  const override = trip.duration_months_override;
  const effectiveMonths =
    override != null && Number.isFinite(Number(override)) && Number(override) > 0
      ? Number(override)
      : stageMonths;
  const totalTrips =
    trip.frequency_mode === "per_month"
      ? freqVal * (effectiveMonths ?? 0)
      : freqVal;
  return {
    perTripKmCost,
    perTripHrCost,
    perTripTotal,
    totalTrips,
    totalCost: perTripTotal * totalTrips,
  };
}
