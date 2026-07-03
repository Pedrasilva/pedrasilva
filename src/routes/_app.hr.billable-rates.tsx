import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { PermissionGate } from "@/components/PermissionGate";
import {
  useBillableRates,
  useBillingRoles,
  useUpsertBillableRate,
} from "@/lib/hr/use-billable-rates";

export const Route = createFileRoute("/_app/hr/billable-rates")({
  component: () => (
    <PermissionGate permission="hr.valor-bo">
      <BillableRatesPage />
    </PermissionGate>
  ),
});

function BillableRatesPage() {
  const { data: roles = [], isLoading } = useBillingRoles();
  const { data: costs = [] } = useBillableRates();
  const upsert = useUpsertBillableRate();

  const costByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of costs) m.set(r.role_name, Number(r.hourly_rate) || 0);
    return m;
  }, [costs]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billable hourly rate</h1>
        <p className="text-sm text-muted-foreground">
          Cost per Billing Role (HR). Single source of truth — used by every quote.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rates by Billing Role</CardTitle>
          <CardDescription>
            Values entered manually. To see per-quote sale rates open a specific
            quote and go to the &quot;Billable hourly rate&quot; tab.
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
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <CostRow
                      key={role}
                      role={role}
                      value={costByRole.get(role) ?? 0}
                      onSave={(v) =>
                        upsert.mutate(
                          { role_name: role, hourly_rate: v },
                          { onError: (e) => toast.error((e as Error).message) },
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CostRow({
  role,
  value,
  onSave,
}: {
  role: string;
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
    <tr className="border-b last:border-b-0 hover:bg-muted/20">
      <td className="px-4 py-2">{role}</td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            className="max-w-[140px] text-right tabular-nums"
            placeholder="0.00"
          />
          <span className="text-muted-foreground">€</span>
        </div>
      </td>
    </tr>
  );
}
