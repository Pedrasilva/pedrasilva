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
  resource_id: string | null;
  resource_hourly_rate: number;
  frequency_mode: QuoteSiteTripFrequencyMode;
  frequency_value: number;
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

export function computeTripCost(
  trip: Pick<
    QuoteSiteTrip,
    "km" | "price_per_km" | "trip_hours" | "resource_hourly_rate" | "frequency_mode" | "frequency_value"
  >,
  stageMonths: number | null,
): TripCostBreakdown {
  const km = Number(trip.km) || 0;
  const ppk = Number(trip.price_per_km) || 0;
  const hrs = Number(trip.trip_hours) || 0;
  const rate = Number(trip.resource_hourly_rate) || 0;
  const perTripKmCost = km * ppk * 2;
  const perTripHrCost = hrs * rate * 2;
  const perTripTotal = perTripKmCost + perTripHrCost;
  const freqVal = Number(trip.frequency_value) || 0;
  const totalTrips =
    trip.frequency_mode === "per_month"
      ? freqVal * (stageMonths ?? 0)
      : freqVal;
  return {
    perTripKmCost,
    perTripHrCost,
    perTripTotal,
    totalTrips,
    totalCost: perTripTotal * totalTrips,
  };
}
