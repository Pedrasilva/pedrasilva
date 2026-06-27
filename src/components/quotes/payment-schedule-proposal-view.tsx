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
  const stageSortMeta = useMemo(() => {
    type StageNode = QuoteStage & { parent_stage_id?: string | null };
    const nodes = stages as StageNode[];
    const stageById = new Map(nodes.map((s) => [s.id, s]));
    const childrenByParent = new Map<string, StageNode[]>();
    for (const stage of nodes) {
      const parentId = stage.parent_stage_id ?? null;
      if (!parentId || !stageById.has(parentId)) continue;
      const children = childrenByParent.get(parentId) ?? [];
      children.push(stage);
      childrenByParent.set(parentId, children);
    }
    const effectiveSpan = (stage: StageNode): { start: string; end: string } => {
      const children = childrenByParent.get(stage.id) ?? [];
      if (children.length === 0) return { start: stage.start_date, end: stage.end_date };
      return children.reduce(
        (span, child) => {
          const childSpan = effectiveSpan(child);
          return {
            start: childSpan.start && (!span.start || childSpan.start < span.start) ? childSpan.start : span.start,
            end: childSpan.end && (!span.end || childSpan.end > span.end) ? childSpan.end : span.end,
          };
        },
        { start: stage.start_date, end: stage.end_date },
      );
    };
    const m = new Map<string, { start: string; end: string; sortOrder: number }>();
    nodes.forEach((stage) => m.set(stage.id, { ...effectiveSpan(stage), sortOrder: stage.sort_order ?? 0 }));
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
      const sa = a.stage_id ? stageSortMeta.get(a.stage_id) : undefined;
      const sb = b.stage_id ? stageSortMeta.get(b.stage_id) : undefined;
      const da = a.expected_invoice_date ?? sa?.end ?? "9999-12-31";
      const db = b.expected_invoice_date ?? sb?.end ?? "9999-12-31";
      if (da !== db) return da < db ? -1 : 1;
      if ((sa?.start ?? "9999-12-31") !== (sb?.start ?? "9999-12-31")) {
        return (sa?.start ?? "9999-12-31") < (sb?.start ?? "9999-12-31") ? -1 : 1;
      }
      if ((sa?.sortOrder ?? 1e9) !== (sb?.sortOrder ?? 1e9)) {
        return (sa?.sortOrder ?? 1e9) - (sb?.sortOrder ?? 1e9);
      }
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

      {/* Two-parent breakdown: Architecture vs Suppliers, with hierarchy
          preserved and listed chronologically by the Gantt dates. */}
      {inflows.length > 0 && (() => {
        type StageNode = QuoteStage & {
          parent_stage_id?: string | null;
          stage_role?: string | null;
          supplier_id?: string | null;
          supplier_placeholder?: string | null;
          is_self?: boolean | null;
          budget?: number | null;
        };
        type SectionKey = "architecture" | "supplier";
        type Row = {
          stageId: string;
          name: string;
          rootName: string;
          level: number;
          amount: number;
          start: string;
          end: string;
          sortOrder: number;
        };

        const nodes = stages as StageNode[];
        const stageById = new Map(nodes.map((s) => [s.id, s]));
        const childrenByParent = new Map<string, StageNode[]>();
        for (const stage of nodes) {
          const parentId = stage.parent_stage_id ?? null;
          if (!parentId || !stageById.has(parentId)) continue;
          const list = childrenByParent.get(parentId) ?? [];
          list.push(stage);
          childrenByParent.set(parentId, list);
        }

        const childList = (stage: StageNode): StageNode[] => childrenByParent.get(stage.id) ?? [];
        const hasArchitectureChildren = (stage: StageNode): boolean =>
          childList(stage).some((child) => {
            const role = child.stage_role ?? "architecture";
            return child.is_self === true || role === "architecture";
          });
        const isExplicitSupplier = (stage: StageNode): boolean => {
          const role = stage.stage_role ?? "architecture";
          if (stage.is_self === true) return false;
          if (stage.supplier_id || stage.supplier_placeholder) return true;
          if (role === "supplier_phase") return true;
          if (role === "supplier_group" && !hasArchitectureChildren(stage)) return true;
          return false;
        };
        const isSupplierStage = (stage: StageNode): boolean => {
          let current: StageNode | undefined = stage;
          const seen = new Set<string>();
          while (current && !seen.has(current.id)) {
            if (isExplicitSupplier(current)) return true;
            seen.add(current.id);
            current = current.parent_stage_id ? stageById.get(current.parent_stage_id) : undefined;
          }
          return false;
        };
        const effectiveSpan = (stage: StageNode): { start: string; end: string } => {
          const children = childList(stage);
          if (children.length === 0) return { start: stage.start_date, end: stage.end_date };
          return children.reduce(
            (span, child) => {
              const childSpan = effectiveSpan(child);
              return {
                start: childSpan.start && (!span.start || childSpan.start < span.start) ? childSpan.start : span.start,
                end: childSpan.end && (!span.end || childSpan.end > span.end) ? childSpan.end : span.end,
              };
            },
            { start: stage.start_date, end: stage.end_date },
          );
        };
        const compareStages = (a: StageNode, b: StageNode): number => {
          const as = effectiveSpan(a);
          const bs = effectiveSpan(b);
          if (as.start !== bs.start) return as.start < bs.start ? -1 : 1;
          if (as.end !== bs.end) return as.end < bs.end ? -1 : 1;
          return (a.sort_order ?? 0) - (b.sort_order ?? 0);
        };
        const relevantChildren = (stage: StageNode, section: SectionKey): StageNode[] =>
          childList(stage)
            .filter((child) => (section === "supplier" ? isSupplierStage(child) : !isSupplierStage(child)))
            .sort(compareStages);
        const ownAmount = (stage: StageNode): number => {
          const fee = Number(stageFees[stage.id] ?? 0);
          const budget = Number(stage.budget ?? 0);
          return Math.round((fee > 0 ? fee : budget) * 100) / 100;
        };
        const amountFor = (stage: StageNode, section: SectionKey): number => {
          const children = relevantChildren(stage, section);
          const childTotal = children.reduce((sum, child) => sum + amountFor(child, section), 0);
          const fallback = ownAmount(stage);
          return Math.round((childTotal > 0 ? childTotal : fallback) * 100) / 100;
        };
        const pushRows = (
          stage: StageNode,
          section: SectionKey,
          rootName: string,
          level: number,
          rows: Row[],
        ) => {
          const amount = amountFor(stage, section);
          if (amount <= 0) return;
          const span = effectiveSpan(stage);
          rows.push({
            stageId: stage.id,
            name: stage.name,
            rootName,
            level,
            amount,
            start: span.start,
            end: span.end,
            sortOrder: stage.sort_order ?? 0,
          });
          for (const child of relevantChildren(stage, section)) {
            pushRows(child, section, rootName, level + 1, rows);
          }
        };

        const roots = nodes
          .filter((stage) => !stage.parent_stage_id || !stageById.has(stage.parent_stage_id))
          .sort(compareStages);
        let architectureTop = roots.filter((stage) => !isSupplierStage(stage));
        if (architectureTop.length === 1) {
          const [root] = architectureTop;
          const rootLooksLikeContainer = /arquitectura|arquitetura|architecture/i.test(root.name);
          const children = relevantChildren(root, "architecture");
          if (rootLooksLikeContainer && children.length > 0) architectureTop = children;
        }
        const flattenDisplayContainer = (stage: StageNode): StageNode[] => {
          const children = relevantChildren(stage, "architecture");
          const isConstructionContainer = /construction|constru[cç][aã]o|obra/i.test(stage.name);
          return isConstructionContainer && children.length > 0 ? children : [stage];
        };
        architectureTop = architectureTop.flatMap(flattenDisplayContainer).sort(compareStages);
        const supplierTop = nodes
          .filter((stage) => {
            if (!isSupplierStage(stage)) return false;
            const parent = stage.parent_stage_id ? stageById.get(stage.parent_stage_id) : undefined;
            return !parent || !isSupplierStage(parent);
          })
          .sort(compareStages);

        const architectureRows: Row[] = [];
        for (const stage of architectureTop) pushRows(stage, "architecture", stage.name, 0, architectureRows);
        const supplierRows: Row[] = [];
        for (const stage of supplierTop) pushRows(stage, "supplier", stage.name, 0, supplierRows);

        const allSections: Array<{ key: SectionKey; title: string; rows: Row[]; total: number }> = [
          {
            key: "architecture",
            title: "Arquitectura — total do contrato",
            rows: architectureRows,
            total: architectureTop.reduce((sum, stage) => sum + amountFor(stage, "architecture"), 0),
          },
          {
            key: "supplier",
            title: "Fornecedores — total do contrato",
            rows: supplierRows,
            total: supplierTop.reduce((sum, stage) => sum + amountFor(stage, "supplier"), 0),
          },
        ];
        const sections = allSections.filter((section) => section.rows.length > 0 && section.total > 0);
        if (sections.length === 0) return null;
        return (
          <div className="space-y-4">
            <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Detalhe por contrato
            </div>
            {sections.map((section) => {
              const list = section.rows;
              const total = section.total;
              const showRoot = section.key === "supplier";
              return (
                <Card key={section.key}>
                  <CardHeader className="pb-3 bg-muted/30">
                    <div className="flex items-baseline justify-between gap-4">
                      <CardTitle className="text-sm uppercase tracking-wide">{section.title}</CardTitle>
                      <div className="text-base font-semibold tabular-nums">{formatEUR(total)}</div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          {showRoot && <TableHead>Fornecedor</TableHead>}
                          <TableHead>Fase</TableHead>
                          <TableHead className="text-right">% do contrato</TableHead>
                          <TableHead className="text-right">Valor sem IVA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          if (!showRoot) {
                            return (
                              <>
                                {list.map((r) => (
                                  <TableRow key={r.stageId}>
                                    <TableCell className={r.level === 0 ? "font-medium" : "pl-6 text-muted-foreground"}>
                                      {r.level > 0 ? `↳ ${r.name}` : r.name}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                      {total > 0 ? `${Math.round((r.amount / total) * 100)}%` : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{formatEUR(r.amount)}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="border-t-2 border-foreground/40 font-semibold bg-muted/20">
                                  <TableCell>Total</TableCell>
                                  <TableCell className="text-right tabular-nums">100%</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatEUR(total)}</TableCell>
                                </TableRow>
                              </>
                            );
                          }
                          // Supplier section: group rows by rootName, subtotal each group, then grand total.
                          const groups: Array<{ rootName: string; rows: typeof list; subtotal: number }> = [];
                          for (const r of list) {
                            let g = groups[groups.length - 1];
                            if (!g || g.rootName !== r.rootName) {
                              g = { rootName: r.rootName, rows: [], subtotal: 0 };
                              groups.push(g);
                            }
                            g.rows.push(r);
                            if (r.level === 0) g.subtotal += r.amount;
                          }
                          // Fallback if no level-0 row exists in a group
                          for (const g of groups) {
                            if (g.subtotal === 0) g.subtotal = g.rows.reduce((s, r) => s + r.amount, 0);
                          }
                          return (
                            <>
                              {groups.map((g, gi) => {
                                const childRows = g.rows.filter((r) => r.level > 0);
                                const displayRows = childRows.length > 0 ? childRows : g.rows;
                                return (
                                <React.Fragment key={`g-${gi}-${g.rootName}`}>
                                  {displayRows.map((r, ri) => (
                                    <TableRow key={r.stageId}>
                                      <TableCell className="text-muted-foreground">{ri === 0 ? g.rootName : ""}</TableCell>
                                      <TableCell className={r.level === 0 ? "font-medium" : "pl-6 text-muted-foreground"}>
                                        {r.level > 0 ? `↳ ${r.name}` : r.name}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {total > 0 ? `${Math.round((r.amount / total) * 100)}%` : "—"}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">{formatEUR(r.amount)}</TableCell>
                                    </TableRow>
                                  ))}
                                  <TableRow className="border-t border-foreground/30 font-medium bg-muted/10">
                                    <TableCell />
                                    <TableCell>Subtotal — {g.rootName}</TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                      {total > 0 ? `${Math.round((g.subtotal / total) * 100)}%` : "—"}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{formatEUR(g.subtotal)}</TableCell>
                                  </TableRow>
                                  {gi < groups.length - 1 && (
                                    <TableRow className="hover:bg-transparent">
                                      <TableCell colSpan={4} className="h-10 p-0" />
                                    </TableRow>
                                  )}
                                </React.Fragment>
                                );
                              })}

                              <TableRow className="border-t-2 border-foreground/40 font-semibold bg-muted/20">
                                <TableCell />
                                <TableCell>Total</TableCell>
                                <TableCell className="text-right tabular-nums">100%</TableCell>
                                <TableCell className="text-right tabular-nums">{formatEUR(total)}</TableCell>
                              </TableRow>
                            </>
                          );
                        })()}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );

      })()}


      {/* Plano de Faturação ao Cliente — single canonical invoice plan */}
      {inflows.length > 0 && (() => {
        const fmtDate = (iso?: string | null) => {
          if (!iso) return "";
          const [y, m, d] = iso.split("-");
          return y && m && d ? `${d}/${m}/${y}` : iso;
        };
        const stageById = new Map(stages.map((s) => [s.id, s]));
        const dateFor = (it: QuotePaymentScheduleItem) => {
          if (it.expected_invoice_date) return it.expected_invoice_date;
          const s = it.stage_id ? stageById.get(it.stage_id) : null;
          if (it.trigger_type === "stage_start") return s?.start_date ?? "9999-12-31";
          return s?.end_date ?? "9999-12-31";
        };
        const triggerSentence = (it: QuotePaymentScheduleItem): string => {
          const s = it.stage_id ? stageById.get(it.stage_id) : null;
          const stageName = s?.name ?? "";
          const d = dateFor(it);
          const ds = fmtDate(d);
          switch (it.trigger_type) {
            case "project_start":
              return `No início do projecto${ds ? ` (${ds})` : ""}`;
            case "stage_start":
              return stageName
                ? `No início de ${stageName}${ds ? ` (${ds})` : ""}`
                : `No início da fase${ds ? ` (${ds})` : ""}`;
            case "stage_end":
              return stageName
                ? `Na conclusão de ${stageName}${ds ? ` (${ds})` : ""}`
                : `Na conclusão da fase${ds ? ` (${ds})` : ""}`;
            case "manual_date":
              return `Em ${ds || "data a definir"}`;
            case "monthly":
              return it.label || `Mensalidade${ds ? ` (${ds})` : ""}`;
            default:
              return it.label;
          }
        };
        const isSupplier = (it: QuotePaymentScheduleItem) =>
          Boolean(it.supplier_company_id || it.supplier_id || (it.supplier_label && it.supplier_label.trim()));
        const supplierKey = (it: QuotePaymentScheduleItem) => {
          if (it.supplier_company_id) return `c:${it.supplier_company_id}`;
          if (it.supplier_id) return `s:${it.supplier_id}`;
          const lbl = (it.supplier_label ?? "").trim().toLowerCase();
          return `p:${lbl}`;
        };
        const supplierDisplay = (it: QuotePaymentScheduleItem) => {
          if (it.supplier_company_id) return supplierName.get(it.supplier_company_id) ?? it.supplier_label ?? "Fornecedor";
          if (it.supplier_id) return supplierName.get(it.supplier_id) ?? it.supplier_label ?? "Fornecedor";
          return it.supplier_label?.trim() || "Fornecedor";
        };

        // Group inflows into invoices by their planned date (monthly buckets
        // keyed by their label to preserve calendar order within each month).
        type Invoice = {
          key: string;
          plannedDate: string;
          items: QuotePaymentScheduleItem[];
          paymentTerms: string | null;
        };
        const invoiceMap = new Map<string, Invoice>();
        const orderKeys: string[] = [];
        for (const it of inflows) {
          const d = dateFor(it);
          const key = it.trigger_type === "monthly" ? `m:${it.label}` : `d:${d}`;
          let inv = invoiceMap.get(key);
          if (!inv) {
            inv = { key, plannedDate: d, items: [], paymentTerms: it.payment_terms ?? null };
            invoiceMap.set(key, inv);
            orderKeys.push(key);
          }
          inv.items.push(it);
          if (!inv.paymentTerms && it.payment_terms) inv.paymentTerms = it.payment_terms;
        }
        orderKeys.sort((a, b) => {
          const da = invoiceMap.get(a)!.plannedDate;
          const db = invoiceMap.get(b)!.plannedDate;
          return da < db ? -1 : da > db ? 1 : 0;
        });

        type Line = { description: string; net: number; vat: number };
        const buildLines = (inv: Invoice): Line[] => {
          const archRows = inv.items.filter((it) => !isSupplier(it));
          const supplierRows = inv.items.filter(isSupplier);
          const lines: Line[] = [];

          if (archRows.length > 0) {
            const net = archRows.reduce((s, r) => s + netAmount(r, totalFee, stageFees), 0);
            const vatAmt = archRows.reduce((s, r) => {
              const n = netAmount(r, totalFee, stageFees);
              const v = Number(r.vat_rate ?? defaultVatRate);
              return s + (n * v) / 100;
            }, 0);
            const head = archRows[0];
            // Use the first arch row's trigger sentence as the description;
            // if multiple stages share this invoice, fall back to a list.
            const stageNames = Array.from(
              new Set(archRows.map((r) => (r.stage_id ? stageById.get(r.stage_id)?.name : null)).filter(Boolean)),
            ) as string[];
            const desc = stageNames.length > 1
              ? `Arquitectura — ${stageNames.join(" + ")} (${fmtDate(inv.plannedDate)})`
              : `Arquitectura — ${triggerSentence(head)}`;
            lines.push({ description: desc, net, vat: vatAmt });
          }

          // Group suppliers within the invoice
          const sup = new Map<string, QuotePaymentScheduleItem[]>();
          const supOrder: string[] = [];
          for (const r of supplierRows) {
            const k = supplierKey(r);
            if (!sup.has(k)) { sup.set(k, []); supOrder.push(k); }
            sup.get(k)!.push(r);
          }
          for (const k of supOrder) {
            const rows = sup.get(k)!;
            const net = rows.reduce((s, r) => s + netAmount(r, totalFee, stageFees), 0);
            const vatAmt = rows.reduce((s, r) => {
              const n = netAmount(r, totalFee, stageFees);
              const v = Number(r.vat_rate ?? defaultVatRate);
              return s + (n * v) / 100;
            }, 0);
            const head = rows[0];
            const stageNames = Array.from(
              new Set(rows.map((r) => (r.stage_id ? stageById.get(r.stage_id)?.name : null)).filter(Boolean)),
            ) as string[];
            const supName = supplierDisplay(head);
            const desc = stageNames.length > 1
              ? `${supName} — ${stageNames.join(" + ")} (${fmtDate(inv.plannedDate)})`
              : `${supName} — ${triggerSentence(head)}`;
            lines.push({ description: desc, net, vat: vatAmt });
          }
          return lines;
        };

        const invoices = orderKeys.map((k) => {
          const inv = invoiceMap.get(k)!;
          const lines = buildLines(inv);
          const net = lines.reduce((s, l) => s + l.net, 0);
          const vat = lines.reduce((s, l) => s + l.vat, 0);
          return { ...inv, lines, net, vat };
        });
        const grandNet = invoices.reduce((s, i) => s + i.net, 0);
        const grandVat = invoices.reduce((s, i) => s + i.vat, 0);

        return (
          <Card className="border-2 border-foreground/80">
            <CardHeader className="pb-3">
              <div className="flex items-baseline justify-between gap-4">
                <CardTitle className="text-base uppercase tracking-wide">
                  Plano de Faturação ao Cliente
                </CardTitle>
                <div className="text-lg font-bold tabular-nums">{formatEUR(grandNet)}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                Cada fatura tem uma linha para Arquitectura e uma linha por cada fornecedor.
                Datas planeadas a partir do Gantt — referência para cash flow futuro.
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-24">Fatura</TableHead>
                    <TableHead className="w-32">Data planeada</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor sem IVA</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Valor com IVA</TableHead>
                    <TableHead className="min-w-[140px]">Condições</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv, gi) => {
                    const invoiceLabel = `Fatura ${String(gi + 1).padStart(2, "0")}`;
                    const dateLabel = inv.key.startsWith("m:") ? inv.items[0].label : fmtDate(inv.plannedDate);
                    const multiLine = inv.lines.length > 1;
                    return (
                      <React.Fragment key={inv.key}>
                        {inv.lines.map((ln, li) => (
                          <TableRow
                            key={`${inv.key}:${li}`}
                            className={li === 0 ? "border-t-2 border-foreground/30" : ""}
                          >
                            <TableCell className="text-xs font-semibold align-top">
                              {li === 0 ? invoiceLabel : ""}
                            </TableCell>
                            <TableCell className="text-xs align-top tabular-nums">
                              {li === 0 ? dateLabel : ""}
                            </TableCell>
                            <TableCell className="text-sm">{ln.description}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatEUR(ln.net)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatEUR(ln.vat)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatEUR(ln.net + ln.vat)}
                            </TableCell>
                            <TableCell className="text-xs align-top">
                              {li === 0 ? (inv.paymentTerms ?? "—") : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                        {multiLine && (
                          <TableRow className="bg-muted/20 text-xs">
                            <TableCell />
                            <TableCell />
                            <TableCell className="font-semibold">Subtotal {invoiceLabel}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{formatEUR(inv.net)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{formatEUR(inv.vat)}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{formatEUR(inv.net + inv.vat)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                  <TableRow className="border-t-2 border-foreground/60 font-semibold bg-muted/40">
                    <TableCell colSpan={3}>Total a faturar ao cliente</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEUR(grandNet)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatEUR(grandVat)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEUR(grandNet + grandVat)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs italic text-muted-foreground mt-3">
                NOTA: Entende-se por "Conclusão da fase" a entrega de elementos da
                fase e a sua aceitação por parte do cliente, ou aceitação tácita
                definida no contrato.
              </p>
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
