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
import React, { useMemo } from "react";
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
  labelFor,
  showTotalRow = false,
}: {
  rows: QuotePaymentScheduleItem[];
  totalFee: number;
  stageFees: Record<string, number>;
  defaultVatRate: number;
  labelFor?: (it: QuotePaymentScheduleItem) => string;
  showTotalRow?: boolean;
}) {
  const groupTotal = rows.reduce((s, r) => s + netAmount(r, totalFee, stageFees), 0);
  const groupVat = rows.reduce((s, r) => {
    const n = netAmount(r, totalFee, stageFees);
    const v = Number(r.vat_rate ?? defaultVatRate);
    return s + (n * v) / 100;
  }, 0);

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
              <TableCell className="font-medium">{labelFor ? labelFor(it) : it.label}</TableCell>
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
        {showTotalRow && rows.length > 0 && (
          <TableRow className="border-t-2 border-foreground/40 font-semibold bg-muted/20">
            <TableCell>Total</TableCell>
            <TableCell className="text-right tabular-nums">100%</TableCell>
            <TableCell className="text-right tabular-nums">{formatEUR(groupTotal)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{formatEUR(groupVat)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatEUR(groupTotal + groupVat)}</TableCell>
            <TableCell />
            <TableCell />
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
  // Sort strictly by the Gantt sequence: stage.sort_order first, then the
  // schedule item's own sort_order. This guarantees Architecture always
  // appears before its supplier siblings (Mais Engenharia, Nulty, …) and
  // monthly slices stay in calendar order within their stage.
  const stageOrder = useMemo(() => {
    const m = new Map<string, number>();
    stages.forEach((s) => m.set(s.id, s.sort_order));
    return m;
  }, [stages]);
  const inflows = items
    .filter(
      (it) =>
        (it.direction ?? "inflow") === "inflow" &&
        it.trigger_type !== "project_start",
    )
    .slice()
    .sort((a, b) => {
      const sa = a.stage_id ? stageOrder.get(a.stage_id) ?? 1e9 : 1e9;
      const sb = b.stage_id ? stageOrder.get(b.stage_id) ?? 1e9 : 1e9;
      if (sa !== sb) return sa - sb;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  const inflowTotal = inflows.reduce(
    (s, it) => s + netAmount(it, totalFee, stageFees),
    0,
  );

  // Outflows grouped by supplier. Support both legacy companies and the new
  // pm_suppliers directory; otherwise different suppliers are collapsed into
  // "Fornecedores diversos".
  const outflows = items.filter((it) => it.direction === "outflow");
  const supplierBuckets = useMemo(() => {
    const buckets = new Map<string, QuotePaymentScheduleItem[]>();
    for (const it of outflows) {
      const label = (it.supplier_label ?? "").trim().toLowerCase();
      const key = it.supplier_company_id
        ? `c:${it.supplier_company_id}`
        : it.supplier_id
          ? `s:${it.supplier_id}`
          : label
            ? `p:${label}`
            : "__unassigned__";
      const arr = buckets.get(key) ?? [];
      arr.push(it);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries());
  }, [outflows]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Top: contract composition (separated card) */}
      {inflows.length > 0 && (() => {
        const stageIdsAll = new Set(stages.map((s) => s.id));
        const stageById = new Map(stages.map((s) => [s.id, s]));
        const rootFor = (stageId: string): QuoteStage | null => {
          let current = stageById.get(stageId) ?? null;
          const seen = new Set<string>();
          while (current) {
            const sx = current as typeof current & { parent_stage_id?: string | null };
            const parentId = sx.parent_stage_id;
            if (!parentId || !stageIdsAll.has(parentId) || seen.has(parentId)) return current;
            seen.add(current.id);
            current = stageById.get(parentId) ?? null;
          }
          return null;
        };
        const byRoot = new Map<string, { id: string; name: string; sortOrder: number; amount: number }>();
        for (const it of inflows) {
          if (!it.stage_id) continue;
          const root = rootFor(it.stage_id);
          if (!root) continue;
          const amount = netAmount(it, totalFee, stageFees);
          if (amount <= 0) continue;
          const current = byRoot.get(root.id) ?? {
            id: root.id, name: root.name, sortOrder: root.sort_order, amount: 0,
          };
          current.amount += amount;
          byRoot.set(root.id, current);
        }
        const tops = Array.from(byRoot.values()).sort((a, b) => a.sortOrder - b.sortOrder);
        if (tops.length <= 1) return null;
        const sum = tops.reduce((a, t) => a + t.amount, 0);
        return (
          <Card className="border-2 border-foreground/80">
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-4">
                <CardTitle className="text-base uppercase tracking-wide">
                  Composição do valor do contrato
                </CardTitle>
                <div className="text-lg font-bold tabular-nums">{formatEUR(sum)}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Visão global do contrato por disciplina / fornecedor
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {tops.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="py-1">{t.name}</TableCell>
                      <TableCell className="py-1 text-right tabular-nums">{formatEUR(t.amount)}</TableCell>
                      <TableCell className="py-1 text-right tabular-nums text-muted-foreground w-16">
                        {sum > 0 ? `${Math.round((t.amount / sum) * 100)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-foreground/40 font-semibold">
                    <TableCell className="py-1">Total</TableCell>
                    <TableCell className="py-1 text-right tabular-nums">{formatEUR(sum)}</TableCell>
                    <TableCell className="py-1 text-right tabular-nums">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* Client billing schedule (separated card) */}
      {inflows.length > 0 && (
        <Card className="border-2 border-foreground/80">
          <CardHeader className="pb-3">
            <div className="flex items-baseline justify-between gap-4">
              <CardTitle className="text-base uppercase tracking-wide">
                Total de Honorários — Faseamento de Pagamentos
              </CardTitle>
              <div className="text-lg font-bold tabular-nums">
                {formatEUR(totalFee)}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Pagamentos a receber do cliente
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Per-top-level-stage breakdown so the header reflects every
                parent (Architecture, Engineering, Suppliers...). The amounts
                are derived from the actual inflow rows so child-triggered
                Architecture payments still roll up under Architecture. */}
            {(() => {
              const stageIdsAll = new Set(stages.map((s) => s.id));
              const stageById = new Map(stages.map((s) => [s.id, s]));
              const rootFor = (stageId: string): QuoteStage | null => {
                let current = stageById.get(stageId) ?? null;
                const seen = new Set<string>();
                while (current) {
                  const sx = current as typeof current & { parent_stage_id?: string | null };
                  const parentId = sx.parent_stage_id;
                  if (!parentId || !stageIdsAll.has(parentId) || seen.has(parentId)) return current;
                  seen.add(current.id);
                  current = stageById.get(parentId) ?? null;
                }
                return null;
              };
              const byRoot = new Map<string, { id: string; name: string; sortOrder: number; amount: number }>();
              for (const it of inflows) {
                if (!it.stage_id) continue;
                const root = rootFor(it.stage_id);
                if (!root) continue;
                const amount = netAmount(it, totalFee, stageFees);
                if (amount <= 0) continue;
                const current = byRoot.get(root.id) ?? {
                  id: root.id,
                  name: root.name,
                  sortOrder: root.sort_order,
                  amount: 0,
                };
                current.amount += amount;
                byRoot.set(root.id, current);
              }
              const tops = Array.from(byRoot.values()).sort((a, b) => a.sortOrder - b.sortOrder);
              if (tops.length <= 1) return null;
              const sum = tops.reduce((a, t) => a + t.amount, 0);
              return (
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Composição do valor do contrato
                  </div>
                  <Table>
                    <TableBody>
                      {tops.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="py-1">{t.name}</TableCell>
                          <TableCell className="py-1 text-right tabular-nums">
                            {formatEUR(t.amount)}
                          </TableCell>
                          <TableCell className="py-1 text-right tabular-nums text-muted-foreground w-16">
                            {sum > 0 ? `${Math.round((t.amount / sum) * 100)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 border-foreground/40 font-semibold">
                        <TableCell className="py-1">Total</TableCell>
                        <TableCell className="py-1 text-right tabular-nums">{formatEUR(sum)}</TableCell>
                        <TableCell className="py-1 text-right tabular-nums">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
            {(() => {
              // Group inflows by their stage (or by trigger label when no
              // stage is set). Each stage becomes its own "Fatura" line —
              // billing always follows the Gantt sequence, even when two
              // stages share an end date.
              const groups = new Map<string, QuotePaymentScheduleItem[]>();
              const order: string[] = [];
              for (const it of inflows) {
                const key =
                  it.stage_id ??
                  (it.expected_invoice_date
                    ? `d:${it.expected_invoice_date}:${it.label}`
                    : `t:${it.trigger_type}:${it.label}`);
                if (!groups.has(key)) {
                  groups.set(key, []);
                  order.push(key);
                }
                groups.get(key)!.push(it);
              }
              const labelForRow = (it: QuotePaymentScheduleItem) => {
                const s = it.stage_id ? stages.find((x) => x.id === it.stage_id) : null;
                return s?.name ?? it.label;
              };
              const totalNetAll = inflows.reduce(
                (s, r) => s + netAmount(r, totalFee, stageFees),
                0,
              );
              const totalVatAll = inflows.reduce((s, r) => {
                const n = netAmount(r, totalFee, stageFees);
                const v = Number(r.vat_rate ?? defaultVatRate);
                return s + (n * v) / 100;
              }, 0);

              return (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-24">Fatura</TableHead>
                      <TableHead className="min-w-[200px]">Data de pagamento</TableHead>
                      <TableHead>Descrição do serviço</TableHead>
                      <TableHead className="text-right">% honorários</TableHead>
                      <TableHead className="text-right">Valor sem IVA</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Valor com IVA</TableHead>
                      <TableHead>Condições</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.map((key, gi) => {
                      const rows = groups.get(key)!;
                      const invoiceLabel = `Fatura ${String(gi + 1).padStart(2, "0")}`;
                      const subNet = rows.reduce((s, r) => s + netAmount(r, totalFee, stageFees), 0);
                      const subVat = rows.reduce((s, r) => {
                        const n = netAmount(r, totalFee, stageFees);
                        const v = Number(r.vat_rate ?? defaultVatRate);
                        return s + (n * v) / 100;
                      }, 0);
                      const head = rows[0];
                      const dateLabel = (() => {
                        if (head.trigger_type === "monthly") return head.label;
                        const s = head.stage_id ? stages.find((x) => x.id === head.stage_id) : null;
                        return s ? `Conclusão — ${s.name}` : head.label;
                      })();
                      return (
                        <React.Fragment key={key}>
                          {rows.map((it, ri) => {
                            const net = netAmount(it, totalFee, stageFees);
                            const vat = Number(it.vat_rate ?? defaultVatRate);
                            const vatAmt = (net * vat) / 100;
                            const pct = totalNetAll > 0 ? (net / totalNetAll) * 100 : 0;
                            return (
                              <TableRow key={it.id} className={ri === 0 ? "border-t-2 border-foreground/20" : ""}>
                                <TableCell className="text-xs align-top">{ri === 0 ? invoiceLabel : ""}</TableCell>
                                <TableCell className="font-medium align-top">{ri === 0 ? dateLabel : ""}</TableCell>
                                <TableCell className="text-sm">{labelForRow(it)}</TableCell>
                                <TableCell className="text-right tabular-nums">{pct.toFixed(0)}%</TableCell>
                                <TableCell className="text-right tabular-nums">{formatEUR(net)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{formatEUR(vatAmt)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{formatEUR(net + vatAmt)}</TableCell>
                                <TableCell className="text-xs">{ri === 0 ? (it.payment_terms ?? "—") : ""}</TableCell>
                              </TableRow>
                            );
                          })}
                          {rows.length > 1 && (
                            <TableRow className="bg-muted/20 text-xs">
                              <TableCell />
                              <TableCell />
                              <TableCell className="font-semibold">Subtotal {invoiceLabel}</TableCell>
                              <TableCell />
                              <TableCell className="text-right tabular-nums font-semibold">{formatEUR(subNet)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{formatEUR(subVat)}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{formatEUR(subNet + subVat)}</TableCell>
                              <TableCell />
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <TableRow className="border-t-2 border-foreground/40 font-semibold bg-muted/30">
                      <TableCell />
                      <TableCell>Total</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">100%</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEUR(totalNetAll)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatEUR(totalVatAll)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEUR(totalNetAll + totalVatAll)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              );
            })()}
            <p className="text-xs italic text-muted-foreground mt-3">
              NOTA: Entende-se por "Conclusão da fase" a entrega de elementos da
              fase e a sua aceitação por parte do cliente, ou aceitação tácita
              definida no contrato.
            </p>
          </CardContent>
        </Card>
      )}

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
                : key.startsWith("p:")
                  ? (rows[0]?.supplier_label ?? "Fornecedor")
                  : supplierName.get(key.slice(2)) ?? "Fornecedor";
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
