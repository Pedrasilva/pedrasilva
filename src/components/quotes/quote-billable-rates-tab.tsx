import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * Billable hourly rates — per quote, per Billing Role.
 *
 * Lists every distinct Billing Role present in HR and lets the user enter a
 * €/h value manually. Values persist in `quote_billable_hourly_rates` keyed
 * by (quote_id, role_name).
 *
 * Intentionally standalone: this data is NOT yet referenced by any
 * downstream calculation — it's just the master rate card for the quote.
 */

type CollabRow = { billing_role: string | null };

type RateRow = {
  id: string;
  quote_id: string;
  role_name: string;
  hourly_rate: number;
};

export function QuoteBillableRatesTab({ quoteId }: { quoteId: string }) {
  const qc = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["billable-rates:roles"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("billing_role")
        .is("archived_at", null)
        .not("billing_role", "is", null);
      if (error) throw error;
      // Dedupe + trim; ignore empty strings.
      const set = new Set<string>();
      for (const r of (data ?? []) as RoleRow[]) {
        const v = (r.billing_role ?? "").trim();
        if (v) set.add(v);
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b, "pt"));
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
        .select("id, quote_id, role_name, hourly_rate")
        .eq("quote_id", quoteId);
      if (error) throw error as Error;
      return (data ?? []) as RateRow[];
    },
  });

  const rateByRole = useMemo(() => {
    const m = new Map<string, RateRow>();
    for (const r of rates) m.set(r.role_name, r);
    return m;
  }, [rates]);

  const upsert = useMutation({
    mutationFn: async (input: { role_name: string; hourly_rate: number }) => {
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (row: unknown, opts: unknown) => Promise<{ error: unknown }>;
        };
      })
        .from("quote_billable_hourly_rates")
        .upsert(
          {
            quote_id: quoteId,
            role_name: input.role_name,
            hourly_rate: input.hourly_rate,
          },
          { onConflict: "quote_id,role_name" },
        );
      if (error) throw error as Error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billable-rates", quoteId] }),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed to save rate"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tabela de recursos</CardTitle>
        <CardDescription>
          Valor/hora por Billing Role (HR). Valores inseridos manualmente — referência apenas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : roles.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No Billing Roles found in HR.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Recurso</th>
                  <th className="px-4 py-2 text-right font-semibold">Valor/hora</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <RateRowInput
                    key={role}
                    role={role}
                    current={rateByRole.get(role)?.hourly_rate ?? 0}
                    onSave={(v) => upsert.mutate({ role_name: role, hourly_rate: v })}
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
  role,
  current,
  onSave,
}: {
  role: string;
  current: number;
  onSave: (v: number) => void;
}) {
  const [value, setValue] = useState<string>(current > 0 ? String(current) : "");

  useEffect(() => {
    setValue(current > 0 ? String(current) : "");
  }, [current]);

  const commit = () => {
    const num = Number(value.replace(",", "."));
    const next = Number.isFinite(num) && num >= 0 ? num : 0;
    if (next !== current) onSave(next);
  };

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="px-4 py-2">{role}</td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
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
            className="max-w-[120px] text-right tabular-nums"
            placeholder="0,00"
          />
          <span className="text-muted-foreground">€</span>
        </div>
      </td>
    </tr>
  );
}
