import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * Billable hourly rates — per quote.
 *
 * Lists every HR collaborator that has a Billing Role and lets the user
 * enter a €/h value manually. Values persist in
 * `quote_billable_hourly_rates` keyed by (quote_id, collaborator_id).
 *
 * Intentionally standalone: this data is NOT yet referenced by any
 * downstream calculation — it's just the master list for the quote.
 */

type Collaborator = {
  id: string;
  nome: string | null;
  billing_role: string | null;
  proposal_role: string | null;
  archived_at: string | null;
};

type RateRow = {
  id: string;
  quote_id: string;
  collaborator_id: string;
  hourly_rate: number;
};

export function QuoteBillableRatesTab({ quoteId }: { quoteId: string }) {
  const qc = useQueryClient();

  const { data: collaborators = [], isLoading: loadingCollabs } = useQuery({
    queryKey: ["billable-rates:collaborators"],
    queryFn: async (): Promise<Collaborator[]> => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome, billing_role, proposal_role, archived_at")
        .is("archived_at", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Collaborator[];
    },
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["billable-rates", quoteId],
    queryFn: async (): Promise<RateRow[]> => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (k: string, v: string) => Promise<{ data: RateRow[] | null; error: unknown }>;
          };
        };
      })
        .from("quote_billable_hourly_rates")
        .select("id, quote_id, collaborator_id, hourly_rate")
        .eq("quote_id", quoteId);
      if (error) throw error as Error;
      return (data ?? []) as RateRow[];
    },
  });

  const rateByCollab = useMemo(() => {
    const m = new Map<string, RateRow>();
    for (const r of rates) m.set(r.collaborator_id, r);
    return m;
  }, [rates]);

  const upsert = useMutation({
    mutationFn: async (input: { collaborator_id: string; hourly_rate: number }) => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (row: unknown, opts: unknown) => Promise<{ error: unknown }>;
        };
      })
        .from("quote_billable_hourly_rates")
        .upsert(
          {
            quote_id: quoteId,
            collaborator_id: input.collaborator_id,
            hourly_rate: input.hourly_rate,
          },
          { onConflict: "quote_id,collaborator_id" },
        );
      if (error) throw error as Error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billable-rates", quoteId] }),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed to save rate"),
  });

  // Only collaborators that have a Billing Role are candidates for this list —
  // the user asked specifically for "names from HR Billing Role".
  const rows = useMemo(
    () =>
      collaborators
        .filter((c) => (c.billing_role ?? "").trim().length > 0)
        .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "")),
    [collaborators],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Billable hourly rates</CardTitle>
        <CardDescription>
          Manual €/h per collaborator, scoped to this quote. Reference only for now.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingCollabs ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No collaborators with a Billing Role were found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Billing role</th>
                  <th className="py-2 pr-4 font-medium text-right">Hourly rate (€/h)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <RateRowInput
                    key={c.id}
                    collaborator={c}
                    current={rateByCollab.get(c.id)?.hourly_rate ?? 0}
                    onSave={(v) => upsert.mutate({ collaborator_id: c.id, hourly_rate: v })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RateRowInput({
  collaborator,
  current,
  onSave,
}: {
  collaborator: Collaborator;
  current: number;
  onSave: (v: number) => void;
}) {
  const [value, setValue] = useState<string>(current > 0 ? String(current) : "");

  // Keep the local input in sync when the persisted value refreshes.
  useEffect(() => {
    setValue(current > 0 ? String(current) : "");
  }, [current]);

  const commit = () => {
    const num = Number(value.replace(",", "."));
    const next = Number.isFinite(num) && num >= 0 ? num : 0;
    if (next !== current) onSave(next);
  };

  return (
    <tr className="border-b last:border-b-0">
      <td className="py-2 pr-4">{collaborator.nome ?? "—"}</td>
      <td className="py-2 pr-4 text-muted-foreground">
        {collaborator.billing_role ?? "—"}
      </td>
      <td className="py-2 pr-4">
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="ml-auto max-w-[140px] text-right tabular-nums"
          placeholder="0.00"
        />
      </td>
    </tr>
  );
}
