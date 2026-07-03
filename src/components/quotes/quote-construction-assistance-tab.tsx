import { useMemo, useRef, useState } from "react";
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
import { Trash2, Plus, ArrowLeftRight, Pencil } from "lucide-react";
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
import { numberStages } from "@/lib/quotes/stage-numbering";
import { useResourcePricing } from "@/lib/quotes/use-resource-pricing";

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

  // Stages ordered by Gantt WBS (1, 1.1, 1.2, 2, …) with their dotted number.
  const numberedStages = useMemo(() => numberStages(stages), [stages]);
  const stageNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of numberedStages) m.set(n.stage.id, n.number);
    return m;
  }, [numberedStages]);

  const stageById = useMemo(() => {
    const m = new Map<string, (typeof stages)[number]>();
    for (const s of stages) m.set(s.id, s);
    return m;
  }, [stages]);

  /**
   * Per-resource sale rate. Derived from the SAME HR pricing model as the
   * `HR › Pricing` table (annual cost + BO share ÷ billable hours × margin),
   * with the project-wide default of a 50% markup on cost. This replaces the
   * stale `pm_resources.hourly_rate` cache and the manual `pm_resource_rates`
   * history — so a trip's €/h always reflects the collaborator's current
   * effective sale price in HR.
   */
  const pricingQ = useResourcePricing();
  const resourceRateById = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) {
      const p = pricingQ.data?.get(r.id);
      m.set(r.id, p?.salePerHour ?? (Number(r.hourly_rate) || 0));
    }
    return m;
  }, [pricingQ.data, resources]);

  const resourceById = useMemo(() => {
    const m = new Map<string, (typeof resources)[number]>();
    for (const r of resources) m.set(r.id, r);
    return m;
  }, [resources]);

  const [draft, setDraft] = useState<null | Partial<QuoteSiteTrip>>(null);

  /**
   * Remember the last set of trip inputs so the next "Add trip" pre-fills with
   * those values instead of starting from zero. Seeded from the most recent
   * existing trip on first render, then updated after every save.
   */
  const lastTripDefaults = useRef<Partial<QuoteSiteTrip> | null>(null);
  if (lastTripDefaults.current == null && trips.length > 0) {
    const last = trips[trips.length - 1];
    lastTripDefaults.current = {
      km: last.km,
      price_per_km: last.price_per_km,
      trip_hours: last.trip_hours,
      resource_ids: last.resource_ids ?? [],
      resource_hourly_rate: last.resource_hourly_rate,
      frequency_mode: last.frequency_mode,
      frequency_value: last.frequency_value,
      duration_months_override: last.duration_months_override,
      stage_id: last.stage_id,
    };
  }

  function startAdd() {
    const prev = lastTripDefaults.current;
    setDraft({
      label: "Site trip",
      km: prev?.km ?? 0,
      price_per_km: prev?.price_per_km ?? 0.36,
      trip_hours: prev?.trip_hours ?? 0,
      resource_id: null,
      resource_ids: prev?.resource_ids ?? [],
      resource_hourly_rates: prev?.resource_hourly_rates ?? {},
      resource_hourly_rate: prev?.resource_hourly_rate ?? 0,
      frequency_mode: prev?.frequency_mode ?? "per_month",
      frequency_value: prev?.frequency_value ?? 2,
      duration_months_override: prev?.duration_months_override ?? null,
      stage_id: prev?.stage_id ?? null,
      notes: "",
    });
  }


  function startEdit(trip: QuoteSiteTrip) {
    setDraft({ ...trip });
  }

  async function saveDraft() {
    if (!draft) return;
    const ids = draft.resource_ids ?? [];
    // Keep the per-resource override map trimmed to currently selected resources.
    const rawOverrides = (draft.resource_hourly_rates ?? {}) as Record<string, number>;
    const overrides: Record<string, number> = {};
    for (const id of ids) {
      const v = Number(rawOverrides[id]) || 0;
      if (v > 0) overrides[id] = v;
    }
    const payload = {
      quote_id: quoteId,
      label: draft.label ?? "Site trip",
      km: Number(draft.km) || 0,
      price_per_km: Number(draft.price_per_km) || 0,
      trip_hours: Number(draft.trip_hours) || 0,
      resource_id: ids[0] ?? null,
      resource_ids: ids,
      resource_hourly_rates: overrides,
      resource_hourly_rate: Number(draft.resource_hourly_rate) || 0,
      frequency_mode: (draft.frequency_mode as QuoteSiteTripFrequencyMode) ?? "per_month",
      frequency_value: Number(draft.frequency_value) || 0,
      duration_months_override:
        draft.duration_months_override == null || draft.duration_months_override === ("" as unknown as number)
          ? null
          : Number(draft.duration_months_override) || null,
      stage_id: draft.stage_id ?? null,
      notes: draft.notes ?? null,
    };
    await upsert.mutateAsync(draft.id ? { id: draft.id, ...payload } : payload);
    lastTripDefaults.current = {
      km: payload.km,
      price_per_km: payload.price_per_km,
      trip_hours: payload.trip_hours,
      resource_ids: payload.resource_ids,
      resource_hourly_rates: payload.resource_hourly_rates,
      resource_hourly_rate: payload.resource_hourly_rate,
      frequency_mode: payload.frequency_mode,
      frequency_value: payload.frequency_value,
      duration_months_override: payload.duration_months_override,
      stage_id: payload.stage_id,
    };
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
                    <TableHead className="text-right">Resource €/h</TableHead>
                    <TableHead className="text-right">Manual €/h</TableHead>
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
                            {numberedStages.map(({ stage: s, number }) => (
                              <SelectItem key={s.id} value={s.id}>
                                {number} {s.name}
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
                          rateById={resourceRateById}
                          onChange={(ids) => patch(trip, { resource_ids: ids })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {(trip.resource_ids?.length ?? 0) > 0 ? (
                          <span
                            className="tabular-nums"
                            title={`Sum of sale rates: ${(trip.resource_ids ?? [])
                              .map((id) => {
                                const ov = Number(trip.resource_hourly_rates?.[id]) || 0;
                                const r = ov > 0 ? ov : resourceRateById.get(id) ?? 0;
                                return `${resourceById.get(id)?.name ?? "?"} ${fmtMoney(r)}/h${ov > 0 ? " (custom)" : ""}`;
                              })
                              .join(" + ")}`}
                          >
                            {fmtMoney(
                              (trip.resource_ids ?? []).reduce((s, id) => {
                                const ov = Number(trip.resource_hourly_rates?.[id]) || 0;
                                return s + (ov > 0 ? ov : resourceRateById.get(id) ?? 0);
                              }, 0),
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <NumberCell
                          value={trip.resource_hourly_rate}
                          onCommit={(v) => patch(trip, { resource_hourly_rate: v })}
                          step="0.5"
                        />
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
                        {trip.frequency_mode === "per_month" ? (
                          <div className="flex items-center justify-end gap-1">
                            <NumberCell
                              value={trip.duration_months_override ?? months ?? 0}
                              onCommit={(v) =>
                                patch(trip, {
                                  duration_months_override: v > 0 ? v : null,
                                })
                              }
                              className="w-14"
                              step="1"
                            />
                            <span className="text-[10px] text-muted-foreground mr-1">mo</span>
                            <span>
                              ={" "}
                              {cost.totalTrips.toFixed(
                                cost.totalTrips % 1 === 0 ? 0 : 1,
                              )}
                            </span>
                          </div>
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
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit trip"
                            onClick={() => startEdit(trip)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Delete trip"
                            onClick={() => del.mutate(trip.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {rows.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-right font-semibold">
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
              <div className="font-medium text-sm">{draft.id ? "Edit site trip" : "New site trip"}</div>
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
                      {numberedStages.map(({ stage: s, number }) => (
                        <SelectItem key={s.id} value={s.id}>
                          {number} {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Resources on trip (return incl.)" className="md:col-span-3">
                  <ResourceRateList
                    selected={draft.resource_ids ?? []}
                    overrides={(draft.resource_hourly_rates ?? {}) as Record<string, number>}
                    resources={resources}
                    rateById={resourceRateById}
                    onChangeSelected={(ids) =>
                      setDraft({ ...draft, resource_ids: ids })
                    }
                    onChangeOverrides={(next) =>
                      setDraft({ ...draft, resource_hourly_rates: next })
                    }
                  />
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
                <Field label="Manual €/h">
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
                    title="Additive €/h on top of the resource sale sum (per-diem, tooling, etc.)"
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
                <Field label="Duration (months, override)">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="From stage dates"
                    value={
                      draft.duration_months_override == null
                        ? ""
                        : String(draft.duration_months_override)
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft({
                        ...draft,
                        duration_months_override: v === "" ? null : Number(v),
                      });
                    }}
                    title="Overrides the stage's date-derived duration when frequency is 'per month'. Leave empty to use stage dates."
                  />
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
                  {draft.id ? "Save changes" : "Save trip"}
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

interface ResourceOption {
  id: string;
  name: string;
  hourly_rate: number;
  active?: boolean;
}

function ResourceMultiSelect({
  selected,
  resources,
  onChange,
  fullWidth,
  rateById,
}: {
  selected: string[];
  resources: ResourceOption[];
  onChange: (ids: string[]) => void;
  fullWidth?: boolean;
  rateById?: Map<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const label =
    selected.length === 0
      ? "— None —"
      : selected.length === 1
        ? resources.find((r) => r.id === selected[0])?.name ?? "1 resource"
        : `${selected.length} resources`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-8 justify-between font-normal ${fullWidth ? "w-full" : "min-w-[10rem]"}`}
        >
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="max-h-64 overflow-y-auto space-y-1">
          {resources.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">No resources.</div>
          )}
          {resources.map((r) => {
            const checked = selectedSet.has(r.id);
            return (
              <label
                key={r.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const next = new Set(selectedSet);
                    if (v) next.add(r.id);
                    else next.delete(r.id);
                    onChange(Array.from(next));
                  }}
                />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtMoney(rateById?.get(r.id) ?? (Number(r.hourly_rate) || 0))}/h
                </span>
              </label>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="mt-2 border-t pt-2 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Per-resource list for the trip draft form. Lets the user pick which resources
 * are on the trip AND set an optional custom €/h override for each one. When an
 * override is empty/0, the resource's default sale rate (from HR pricing) is
 * used automatically.
 */
function ResourceRateList({
  selected,
  overrides,
  resources,
  rateById,
  onChangeSelected,
  onChangeOverrides,
}: {
  selected: string[];
  overrides: Record<string, number>;
  resources: ResourceOption[];
  rateById: Map<string, number>;
  onChangeSelected: (ids: string[]) => void;
  onChangeOverrides: (next: Record<string, number>) => void;
}) {
  const selectedSet = new Set(selected);
  const selectedRows = selected
    .map((id) => resources.find((r) => r.id === id))
    .filter((r): r is ResourceOption => Boolean(r));
  const available = resources.filter((r) => !selectedSet.has(r.id));

  const total = selected.reduce((s, id) => {
    const ov = Number(overrides?.[id]) || 0;
    return s + (ov > 0 ? ov : rateById.get(id) ?? 0);
  }, 0);

  function addResource(id: string) {
    if (!id || selectedSet.has(id)) return;
    onChangeSelected([...selected, id]);
  }
  function removeResource(id: string) {
    onChangeSelected(selected.filter((x) => x !== id));
    if (overrides?.[id] != null) {
      const next = { ...overrides };
      delete next[id];
      onChangeOverrides(next);
    }
  }
  function setOverride(id: string, v: number) {
    const next = { ...(overrides ?? {}) };
    if (v > 0) next[id] = v;
    else delete next[id];
    onChangeOverrides(next);
  }

  return (
    <div className="rounded-md border">
      {selectedRows.length === 0 ? (
        <div className="text-xs text-muted-foreground px-3 py-2">
          No resources on this trip yet.
        </div>
      ) : (
        <div className="divide-y">
          {selectedRows.map((r) => {
            const base = rateById.get(r.id) ?? Number(r.hourly_rate) || 0;
            const ov = Number(overrides?.[r.id]) || 0;
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">{r.name}</span>
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  title="Default sale rate from HR pricing"
                >
                  default {fmtMoney(base)}/h
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="custom €/h"
                    className="h-8 w-28 text-right"
                    value={ov > 0 ? ov : ""}
                    onChange={(e) =>
                      setOverride(r.id, Number(e.target.value) || 0)
                    }
                    title="Custom sale €/h for this resource on this trip. Leave empty to use the default."
                  />
                  <span className="text-xs text-muted-foreground">€/h</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeResource(r.id)}
                  title="Remove resource"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <Select value="" onValueChange={addResource}>
          <SelectTrigger className="h-8 w-64">
            <SelectValue placeholder={available.length === 0 ? "All resources added" : "Add resource…"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name} · {fmtMoney(rateById.get(r.id) ?? Number(r.hourly_rate) || 0)}/h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground tabular-nums">
          Combined €/h: <span className="font-medium text-foreground">{fmtMoney(total)}</span>
        </span>
      </div>
    </div>
  );
}
