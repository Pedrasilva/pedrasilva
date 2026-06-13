/**
 * Proposal-style read-only view of the payment schedule.
 *
 * Layout mirrors the printed proposal (see screenshot from the user):
 *
 *   ┌─ Total de Honorários — CLIENT BILLING (inflows) ─┐
 *   │  one row per inflow item with % / sem IVA / IVA / com IVA / fatura / terms
 *   └────────────────────────────────────────────────────┘
 *
 *   For each supplier (group of outflow items):
 *   ┌─ <Supplier name> — total dos honorários ────────────┐
 *   │   rows...                                            │
 *   └──────────────────────────────────────────────────────┘
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatEUR } from "@/lib/crm/types";
import type { QuotePaymentScheduleItem, QuoteStage } from "@/lib/quotes/types";
import { resolveScheduleItemAmount } from "@/lib/quotes/payment-generators";

interface SupplierInfo {
  id: string | null;
  name: string;
}

interface Props {
  items: QuotePaymentScheduleItem[];
  stages: QuoteStage[];
  totalFee: number;
  stageFees: Record<string, number>;
  suppliers: SupplierInfo[];
  defaultVatRate: number;
}

function netAmount(
  it: QuotePaymentScheduleItem,
  totalFee: number,
  stageFees: Record<string, number>,
): number {
  return resolveScheduleItemAmount(
    {
      amount_type: it.amount_type,
      amount_value: Number(it.amount_value ?? 0),
      trigger_type: it.trigger_type,
      stage_id: it.stage_id,
    },
    totalFee,
    stageFees,
  );
}

function PaymentSubTable({
  rows,
  totalFee,
  stageFees,
  defaultVatRate,
}: {
  rows: QuotePaymentScheduleItem[];
  totalFee: number;
  stageFees: Record<string, number>;
  defaultVatRate: number;
}) {
  const groupTotal = rows.reduce((s, r) => s + netAmount(r, totalFee, stageFees), 0);

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead className="min-w-[220px]">Data de pagamento</TableHead>
          <TableHead className="text-right">% dos honorários</TableHead>
          <TableHead className="text-right">Valor sem IVA</TableHead>
          <TableHead className="text-right">IVA</TableHead>
          <TableHead className="text-right">Valor com IVA</TableHead>
          <TableHead className="w-20">Fatura</TableHead>
          <TableHead>Condições de pagamento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((it, i) => {
          const net = netAmount(it, totalFee, stageFees);
          const vat = Number(it.vat_rate ?? defaultVatRate);
          const vatAmt = (net * vat) / 100;
          const total = net + vatAmt;
          const pct = groupTotal > 0 ? (net / groupTotal) * 100 : 0;
          const invoiceLabel = `Fatura ${String(i + 1).padStart(2, "0")}`;
          return (
            <TableRow key={it.id}>
              <TableCell className="font-medium">{it.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {pct.toFixed(0)}%
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatEUR(net)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatEUR(vatAmt)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatEUR(total)}
              </TableCell>
              <TableCell className="text-xs">{invoiceLabel}</TableCell>
              <TableCell className="text-xs">{it.payment_terms ?? "—"}</TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-4">
              Sem linhas
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function PaymentScheduleProposalView({
  items,
  stages,
  totalFee,
  stageFees,
  suppliers,
  defaultVatRate,
}: Props) {
  const supplierName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) if (s.id) map.set(s.id, s.name);
    return map;
  }, [suppliers]);

  // Inflows (client billing) — exclude down payment (project_start) from the
  // top "Total de Honorários" block; that section shows only stage rows.
  const inflows = items.filter(
    (it) =>
      (it.direction ?? "inflow") === "inflow" &&
      it.trigger_type !== "project_start",
  );
  const inflowTotal = inflows.reduce(
    (s, it) => s + netAmount(it, totalFee, stageFees),
    0,
  );

  // Outflows grouped by supplier
  const outflows = items.filter((it) => it.direction === "outflow");
  const supplierBuckets = useMemo(() => {
    const buckets = new Map<string, QuotePaymentScheduleItem[]>();
    for (const it of outflows) {
      const key = it.supplier_company_id ?? "__unassigned__";
      const arr = buckets.get(key) ?? [];
      arr.push(it);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries());
  }, [outflows]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Top: client billing block */}
      {inflows.length > 0 && (
        <Card className="border-2 border-foreground/80">
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between gap-4">
              <CardTitle className="text-base uppercase tracking-wide">
                Total de Honorários — Faseamento de Pagamentos
              </CardTitle>
              <div className="text-lg font-bold tabular-nums">
                {formatEUR(inflowTotal)}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Pagamentos a receber do cliente
            </div>
          </CardHeader>
          <CardContent>
            <PaymentSubTable
              rows={inflows}
              totalFee={totalFee}
              stageFees={stageFees}
              defaultVatRate={defaultVatRate}
            />
            <p className="text-xs italic text-muted-foreground mt-3">
              NOTA: Entende-se por "Conclusão da fase" a entrega de elementos da
              fase e a sua aceitação por parte do cliente, ou aceitação tácita
              definida no contrato.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Middle: architecture-only breakdown (inflow − supplier outflows per stage) */}
      {outflows.length > 0 && (() => {
        // Group outflows by stage_id
        const outBy = new Map<string, number>();
        for (const o of outflows) {
          const k = o.stage_id ?? "__none__";
          outBy.set(k, (outBy.get(k) ?? 0) + netAmount(o, totalFee, stageFees));
        }
        // Per top-level inflow row, subtract any outflow attributed to its stage
        const rows = inflows.map((it) => {
          const inflowAmt = netAmount(it, totalFee, stageFees);
          const out = it.stage_id ? outBy.get(it.stage_id) ?? 0 : 0;
          return { it, inflowAmt, out, archAmt: inflowAmt - out };
        });
        const archTotal = rows.reduce((s, r) => s + r.archAmt, 0);
        return (
          <Card>
            <CardHeader className="pb-3 bg-muted/30">
              <div className="flex items-baseline justify-between gap-4">
                <CardTitle className="text-sm uppercase tracking-wide">
                  Arquitetura — receita líquida (após fornecedores)
                </CardTitle>
                <div className="text-base font-semibold tabular-nums">
                  {formatEUR(archTotal)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Fase</TableHead>
                    <TableHead className="text-right">Honorários</TableHead>
                    <TableHead className="text-right">Fornecedores</TableHead>
                    <TableHead className="text-right">Arquitetura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ it, inflowAmt, out, archAmt }) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEUR(inflowAmt)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {out > 0 ? `− ${formatEUR(out)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatEUR(archAmt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* Per-supplier outflow groups */}
      {supplierBuckets.length > 0 && (
        <div className="space-y-4">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Compromissos com fornecedores
          </div>
          {supplierBuckets.map(([key, rows]) => {
            const name =
              key === "__unassigned__"
                ? "Fornecedores diversos"
                : supplierName.get(key) ?? "Fornecedor";
            const groupTotal = rows.reduce(
              (s, r) => s + netAmount(r, totalFee, stageFees),
              0,
            );
            return (
              <Card key={key}>
                <CardHeader className="pb-3 bg-muted/30">
                  <div className="flex items-baseline justify-between gap-4">
                    <CardTitle className="text-sm uppercase tracking-wide">
                      {name} — total dos honorários
                    </CardTitle>
                    <div className="text-base font-semibold tabular-nums">
                      {formatEUR(groupTotal)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <PaymentSubTable
                    rows={rows}
                    totalFee={totalFee}
                    stageFees={stageFees}
                    defaultVatRate={defaultVatRate}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
