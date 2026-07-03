import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import {
  useBillableRates,
  useBillingRoles,
  useQuoteSaleRates,
  useUpsertBillableRate,
  useUpsertQuoteSaleRate,
} from "@/lib/hr/use-billable-rates";

/**
 * Billable hourly rates — quote-side view.
 *
 * Same table as HR settings (single source of truth per Billing Role) plus a
 * quote-specific "Manual sale rate" column. Editing the cost here updates the
 * shared HR value; editing the sale rate only affects this quote.
 */
export function QuoteBillableRatesTab({ quoteId }: { quoteId: string }) {
  const { data: roles = [], isLoading } = useBillingRoles();
  const { data: costs = [] } = useBillableRates();
  const { data: sales = [] } = useQuoteSaleRates(quoteId);

  const upsertCost = useUpsertBillableRate();
  const upsertSale = useUpsertQuoteSaleRate(quoteId);

  const costByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of costs) m.set(r.role_name, Number(r.hourly_rate) || 0);
    return m;
  }, [costs]);

  const saleByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sales) m.set(r.role_name, Number(r.sale_rate) || 0);
    return m;
  }, [sales]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Billable hourly rate</CardTitle>
        <CardDescription>
          Cost/hour is shared across all quotes (HR source of truth). Manual sale rate
          is specific to this quote.
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
                  <th className="px-4 py-2 text-right font-semibold">Cost / hour</th>
                  <th className="px-4 py-2 text-right font-semibold">Manual sale rate</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-2">{role}</td>
                    <td className="px-4 py-2">
                      <RateCell
                        value={costByRole.get(role) ?? 0}
                        onSave={(v) =>
                          upsertCost.mutate(
                            { role_name: role, hourly_rate: v },
                            { onError: (e) => toast.error((e as Error).message) },
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <RateCell
                        value={saleByRole.get(role) ?? 0}
                        onSave={(v) =>
                          upsertSale.mutate(
                            { role_name: role, sale_rate: v },
                            { onError: (e) => toast.error((e as Error).message) },
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RateCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [text, setText] = useState<string>(value > 0 ? String(value) : "");

  useEffect(() => {
    setText(value > 0 ? String(value) : "");
  }, [value]);

  const commit = () => {
    const num = Number(text.replace(",", "."));
    const next = Number.isFinite(num) && num >= 0 ? num : 0;
    if (next !== value) onSave(next);
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        className="max-w-[120px] text-right tabular-nums"
        placeholder="0.00"
      />
      <span className="text-muted-foreground">€</span>
    </div>
  );
}
