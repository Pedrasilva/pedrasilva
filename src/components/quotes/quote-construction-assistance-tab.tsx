import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, ArrowLeftRight } from "lucide-react";
import { useQuoteStages } from "@/lib/quotes/use-quote-stages";
import { useResources } from "@/lib/projects/use-planner";
import {
  useDeleteQuoteSiteTrip,
  useQuoteSiteTrips,
  useUpsertQuoteSiteTrip,
  computeTripCost,
  computeTripHourlyRate,
  stageDurationMonths,
  type QuoteSiteTrip,
  type QuoteSiteTripFrequencyMode,
} from "@/lib/quotes/use-quote-site-trips";

interface Props {
  quoteId: string;
}

const NONE_STAGE = "__none__";

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function QuoteConstructionAssistanceTab({ quoteId }: Props) {
  const tripsQ = useQuoteSiteTrips(quoteId);
  const stagesQ = useQuoteStages(quoteId);
  const resourcesQ = useResources();
  const upsert = useUpsertQuoteSiteTrip(quoteId);
  const del = useDeleteQuoteSiteTrip(quoteId);

  const stages = stagesQ.data ?? [];
  const resources = (resourcesQ.data ?? []).filter((r) => r.active !== false);
  const trips = tripsQ.data ?? [];

  const stageById = useMemo(() => {
    const m = new Map<string, (typeof stages)[number]>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  /** Map: resource_id → sale hourly rate (pm_resources.hourly_rate). */
  const resourceRateById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) m.set(r.id, Number(r.hourly_rate) || 0);
    return m;
  }, [resources]);

  const resourceById = useMemo(() => {
    const m = new Map<string, (typeof resources)[number]>();
    for (const r of resources) m.set(r.id, r);
    return m;
  }, [resources]);

  const [draft, setDraft] = useState<null | Partial<QuoteSiteTrip>>(null);

  function startAdd() {
    setDraft({
      label: "Site trip",
      km: 0,
      price_per_km: 0.36,
      trip_hours: 0,
      resource_id: null,
      resource_ids: [],
      resource_hourly_rate: 0,
      frequency_mode: "per_month",
      frequency_value: 2,
      stage_id: null,
      notes: "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const ids = draft.resource_ids ?? [];
    await upsert.mutateAsync({
      quote_id: quoteId,
      label: draft.label ?? "Site trip",
      km: Number(draft.km) || 0,
      price_per_km: Number(draft.price_per_km) || 0,
      trip_hours: Number(draft.trip_hours) || 0,
      resource_id: ids[0] ?? null,
      resource_ids: ids,
      resource_hourly_rate: Number(draft.resource_hourly_rate) || 0,
      frequency_mode: (draft.frequency_mode as QuoteSiteTripFrequencyMode) ?? "per_month",
      frequency_value: Number(draft.frequency_value) || 0,
      stage_id: draft.stage_id ?? null,
      notes: draft.notes ?? null,
    });
    setDraft(null);
  }

  async function patch(trip: QuoteSiteTrip, changes: Partial<QuoteSiteTrip>) {
    // Keep legacy resource_id in sync with the first resource_ids entry
    // whenever the caller updates the multi-resource list.
    const next: Partial<QuoteSiteTrip> = { ...changes };
    if (changes.resource_ids) {
      next.resource_id = changes.resource_ids[0] ?? null;
    }
    await upsert.mutateAsync({ id: trip.id, ...next });
  }

  // ---- totals ----
  const rows = trips.map((t) => {
    const stage = t.stage_id ? stageById.get(t.stage_id) ?? null : null;
    const months = stageDurationMonths(stage?.start_date, stage?.end_date);
    const cost = computeTripCost(t, months, resourceRateById);
    const effectiveRate = computeTripHourlyRate(t, resourceRateById);
    return { trip: t, stage, months, cost, effectiveRate };
  });
  const grandTotal = rows.reduce((s, r) => s + r.cost.totalCost, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Construction Assistance</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Plan site trips during Construction (or any other stage). Cost per
              trip = km × price/km × 2 + trip hours × hourly rate × 2 (return
              included).
            </p>
          </div>
          <Button size="sm" onClick={startAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add trip
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 && !draft && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No site trips defined yet.
            </div>
          )}

          {(rows.length > 0 || draft) && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">km</TableHead>
                    <TableHead className="text-right">€/km</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead className="text-right">€/h</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Trips</TableHead>
                    <TableHead className="text-right">€/trip</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ trip, stage, months, cost, effectiveRate }) => (
                    <TableRow key={trip.id}>
                      <TableCell>
                        <Input
                          value={trip.label}
                          onChange={(e) => patch(trip, { label: e.target.value })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={trip.stage_id ?? NONE_STAGE}
                          onValueChange={(v) =>
                            patch(trip, { stage_id: v === NONE_STAGE ? null : v })
                          }
                        >
                          <SelectTrigger className="h-8 min-w-[10rem]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_STAGE}>— None —</SelectItem>
                            {stages.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberCell
                          value={trip.km}
                          onCommit={(v) => patch(trip, { km: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberCell
                          value={trip.price_per_km}
                          onCommit={(v) => patch(trip, { price_per_km: v })}
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberCell
                          value={trip.trip_hours}
                          onCommit={(v) => patch(trip, { trip_hours: v })}
                          step="0.25"
                        />
                      </TableCell>
                      <TableCell>
                        <ResourceMultiSelect
                          selected={trip.resource_ids ?? []}
                          resources={resources}
                          onChange={(ids) => patch(trip, { resource_ids: ids })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {(trip.resource_ids?.length ?? 0) > 0 ? (
                          <span
                            className="tabular-nums"
                            title={`Sum of sale rates: ${(trip.resource_ids ?? [])
                              .map((id) => `${resourceById.get(id)?.name ?? "?"} ${fmtMoney(resourceRateById.get(id) ?? 0)}/h`)
                              .join(" + ")}`}
                          >
                            {fmtMoney(effectiveRate)}
                          </span>
                        ) : (
                          <NumberCell
                            value={trip.resource_hourly_rate}
                            onCommit={(v) => patch(trip, { resource_hourly_rate: v })}
                            step="0.5"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <NumberCell
                            value={trip.frequency_value}
                            onCommit={(v) => patch(trip, { frequency_value: v })}
                            className="w-16"
                          />
                          <Select
                            value={trip.frequency_mode}
                            onValueChange={(v) =>
                              patch(trip, {
                                frequency_mode: v as QuoteSiteTripFrequencyMode,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 min-w-[7.5rem]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_month">per month</SelectItem>
                              <SelectItem value="total">total</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {trip.frequency_mode === "per_month" && months == null ? (
                          <span
                            className="text-muted-foreground"
                            title="Assign a stage with dates to compute trip count"
                          >
                            —
                          </span>
                        ) : (
                          cost.totalTrips.toFixed(cost.totalTrips % 1 === 0 ? 0 : 1)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span title="km × €/km × 2 + hours × €/h × 2">
                          <ArrowLeftRight className="inline h-3 w-3 mr-1 text-muted-foreground" />
                          {fmtMoney(cost.perTripTotal)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtMoney(cost.totalCost)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => del.mutate(trip.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {rows.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-right font-semibold">
                        Grand total
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {fmtMoney(grandTotal)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {draft && (
            <div className="mt-4 rounded-md border p-4 space-y-3">
              <div className="font-medium text-sm">New site trip</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Label">
                  <Input
                    value={draft.label ?? ""}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </Field>
                <Field label="Stage">
                  <Select
                    value={draft.stage_id ?? NONE_STAGE}
                    onValueChange={(v) =>
                      setDraft({ ...draft, stage_id: v === NONE_STAGE ? null : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_STAGE}>— None —</SelectItem>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Resource on trip (return incl.)">
                  <Select
                    value={draft.resource_id ?? NONE_STAGE}
                    onValueChange={(v) => {
                      if (v === NONE_STAGE) {
                        setDraft({ ...draft, resource_id: null });
                        return;
                      }
                      const r = resources.find((x) => x.id === v);
                      setDraft({
                        ...draft,
                        resource_id: v,
                        resource_hourly_rate: Number(r?.hourly_rate) || 0,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_STAGE}>— None —</SelectItem>
                      {resources.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="km to site">
                  <Input
                    type="number"
                    value={draft.km ?? 0}
                    onChange={(e) => setDraft({ ...draft, km: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Price €/km">
                  <Input
                    type="number"
                    step="0.01"
                    value={draft.price_per_km ?? 0}
                    onChange={(e) =>
                      setDraft({ ...draft, price_per_km: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Hours per trip">
                  <Input
                    type="number"
                    step="0.25"
                    value={draft.trip_hours ?? 0}
                    onChange={(e) =>
                      setDraft({ ...draft, trip_hours: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Resource €/h">
                  <Input
                    type="number"
                    step="0.5"
                    value={draft.resource_hourly_rate ?? 0}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        resource_hourly_rate: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Frequency">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.5"
                      value={draft.frequency_value ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, frequency_value: Number(e.target.value) })
                      }
                    />
                    <Select
                      value={(draft.frequency_mode as string) ?? "per_month"}
                      onValueChange={(v) =>
                        setDraft({
                          ...draft,
                          frequency_mode: v as QuoteSiteTripFrequencyMode,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_month">per month</SelectItem>
                        <SelectItem value="total">total</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Field>
                <Field label="Notes" className="md:col-span-3">
                  <Textarea
                    rows={2}
                    value={draft.notes ?? ""}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button onClick={saveDraft} disabled={upsert.isPending}>
                  Save trip
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function NumberCell({
  value,
  onCommit,
  step,
  className,
}: {
  value: number;
  onCommit: (v: number) => void;
  step?: string;
  className?: string;
}) {
  const [local, setLocal] = useState<string>(String(value ?? 0));
  return (
    <Input
      type="number"
      step={step}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const n = Number(local);
        if (!Number.isFinite(n)) {
          setLocal(String(value ?? 0));
          return;
        }
        if (n !== Number(value)) onCommit(n);
      }}
      className={`h-8 text-right ${className ?? ""}`}
    />
  );
}
