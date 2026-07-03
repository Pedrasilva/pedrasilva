import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useProposalRoles } from "@/lib/proposal-roles";
import type { ProposalRole } from "@/lib/proposal-roles";
import {
  useQuoteSaleRates,
  useUpsertProposalRoleCost,
  useUpsertQuoteSaleRate,
} from "@/lib/hr/use-billable-rates";

/**
 * Billable hourly rates — quote-side view.
 *
 * Same table as the Titles / Commercial Roles catalog (single source of truth
 * per role). Cost / hour edits update the catalog; Manual sale rate edits are
 * scoped to this quote.
 */
export function QuoteBillableRatesTab({ quoteId }: { quoteId: string }) {
  const { i18n } = useTranslation();
  const isPt = i18n.language?.startsWith("pt");
  const { data: roles = [], isLoading } = useProposalRoles();
  const { data: sales = [] } = useQuoteSaleRates(quoteId);

  const upsertCost = useUpsertProposalRoleCost();
  const upsertSale = useUpsertQuoteSaleRate(quoteId);

  const saleByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sales) m.set(r.role_name, Number(r.sale_rate) || 0);
    return m;
  }, [sales]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <Link
            to="/admin/proposal-roles"
            className="inline-flex items-center gap-1.5 text-primary hover:underline"
          >
            {isPt ? "Valor/hora facturável" : "Billable hourly rate"}
            <ExternalLink className="h-4 w-4" />
          </Link>
        </CardTitle>
        <CardDescription>
          {isPt
            ? "Custo/hora vive no catálogo de Títulos (partilhado entre todas as propostas). O valor de venda manual é específico desta proposta."
            : "Cost/hour lives in the Titles catalog (shared across all quotes). Manual sale rate is specific to this quote."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : roles.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {isPt ? "Sem títulos no catálogo." : "No titles in the catalog."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">
                    {isPt ? "Título" : "Title"}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold">
                    {isPt ? "Custo / hora" : "Cost / hour"}
                  </th>
                  <th className="px-4 py-2 text-right font-semibold">
                    {isPt ? "Valor venda manual" : "Manual sale rate"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role: ProposalRole) => (
                  <tr key={role.id} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-2">
                      {isPt ? role.label_pt : role.label_en}
                    </td>
                    <td className="px-4 py-2">
                      <RateCell
                        value={Number(role.hourly_rate) || 0}
                        onSave={(v) =>
                          upsertCost.mutate(
                            { id: role.id, hourly_rate: v },
                            { onError: (e) => toast.error((e as Error).message) },
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-2">
                      <RateCell
                        value={saleByCode.get(role.code) ?? 0}
                        onSave={(v) =>
                          upsertSale.mutate(
                            { role_code: role.code, sale_rate: v },
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
