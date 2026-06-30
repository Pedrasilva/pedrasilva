import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/projects/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Eye } from "lucide-react";
import {
  useTimesheetRows,
  useTimesheetEntries,
  useUpsertTimesheetCell,
  useProjectSearch,
  useEnsureStageRow,
  useNonWorkingPrefill,
  type EntryType,
  type TimesheetEntry,
  type TimesheetTaskRow,
} from "@/lib/projects/use-timesheet";
import { useInternalCategories } from "@/lib/projects/use-internal-categories";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Search,
  X,
  ChevronDown,
  Trash2,
  Briefcase,
  Coffee,
  Plane,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { formatHM, parseHM } from "@/lib/projects/time-format";

export const Route = createFileRoute("/_app/projects/timesheet")({
  component: TimesheetPage,
});

// Composite key for the entry map: <type>::<row identifier>
type CellKey = string;
const projectKey = (taskId: string): CellKey => `project::${taskId}`;
const internalKey = (cat: string): CellKey => `internal::${cat}`;
const nonWorkingKey = (lt: string): CellKey => `non_working::${lt}`;

type CellInfo = {
  id: string;
  hours: number;
  notes: string | null;
  billable: boolean;
};

function TimesheetPage() {
  const { profile: selfProfile, user } = useProjectsAuth();
  const { isRealAdmin } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [extraTaskIds, setExtraTaskIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Admin "view as" selection — defaults to the logged-in user. Non-admins
  // only ever see their own timesheet.
  const [viewedCollaboratorId, setViewedCollaboratorId] = useState<string | null>(null);

  // Resolve viewed collaborator → resource_id, user_id (auth) when admin
  // is impersonating someone else.
  const { data: viewedTarget } = useQuery({
    queryKey: ["timesheet-view-target", viewedCollaboratorId],
    enabled: !!viewedCollaboratorId && isRealAdmin,
    queryFn: async () => {
      const collabId = viewedCollaboratorId!;
      const [{ data: resource }, { data: userId }] = await Promise.all([
        supabase
          .from("pm_resources")
          .select("id")
          .eq("collaborator_id", collabId)
          .maybeSingle(),
        supabase.rpc("get_user_id_for_collaborator", { p_collaborator_id: collabId }),
      ]);
      return {
        resource_id: (resource?.id as string | undefined) ?? null,
        user_id: (userId as string | null) ?? null,
        collaborator_id: collabId,
      };
    },
  });

  // Effective identity used by the queries below.
  const isViewingOther = !!viewedCollaboratorId && viewedCollaboratorId !== selfProfile?.collaborator_id;
  const effectiveResourceId = isViewingOther
    ? (viewedTarget?.resource_id ?? null)
    : (selfProfile?.resource_id ?? null);
  const effectiveUserId = isViewingOther
    ? (viewedTarget?.user_id ?? null)
    : (user?.id ?? null);
  const effectiveCollaboratorId = isViewingOther
    ? (viewedTarget?.collaborator_id ?? null)
    : (selfProfile?.collaborator_id ?? null);
  const readOnly = isViewingOther;

  const weekStartDate = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)),
    [weekStartDate],
  );
  const weekStart = format(weekStartDate, "yyyy-MM-dd");
  const weekEnd = format(addDays(weekStartDate, 6), "yyyy-MM-dd");

  const { data: projectRows = [], isLoading } = useTimesheetRows({
    resourceId: effectiveResourceId,
    userId: effectiveUserId,
    weekStart,
    weekEnd,
    extraTaskIds,
  });
  const { data: entries = [] } = useTimesheetEntries({
    userId: effectiveUserId,
    weekStart,
    weekEnd,
  });
  const { data: nonWorkingPrefill = [] } = useNonWorkingPrefill({
    collaboratorId: effectiveCollaboratorId,
    weekStart,
    weekEnd,
  });
  const upsert = useUpsertTimesheetCell();
  const { data: searchResults = [], isFetching: searching } = useProjectSearch({
    query: searchQuery,
  });
  const ensureRow = useEnsureStageRow();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  // Profile shape kept for downstream noResource guard below.
  const profile = isViewingOther
    ? viewedTarget
      ? {
          full_name: null,
          resource_id: viewedTarget.resource_id,
          collaborator_id: viewedTarget.collaborator_id,
        }
      : null
    : selfProfile;



  // Internal cost centers are admin-managed (DB-backed). The picker shows
  // ACTIVE categories only — archived ones disappear from the list of
  // selectable rows for new entries. However, if the user already has hours
  // logged this week against an archived/renamed category, we still surface
  // that row so they can review or zero it out (history stays intact).
  const { data: activeInternalCategories = [] } = useInternalCategories();

  // The rows we actually render under "Internal cost centers": every active
  // category PLUS any archived category that has logged hours this week (so
  // people can still see / clear historical entries). Archived rows are
  // visually flagged but otherwise editable for the existing hours.
  const displayedInternalCategories = useMemo<{
    name: string;
    isArchived: boolean;
  }[]>(() => {
    const active = activeInternalCategories.map((c) => ({
      name: c.name,
      isArchived: false,
    }));
    const activeNames = new Set(active.map((c) => c.name));
    const archivedWithEntries = new Set<string>();
    for (const e of entries) {
      if (
        e.entry_type === "internal" &&
        e.internal_category &&
        !activeNames.has(e.internal_category)
      ) {
        archivedWithEntries.add(e.internal_category);
      }
    }
    return [
      ...active,
      ...Array.from(archivedWithEntries)
        .sort()
        .map((name) => ({ name, isArchived: true })),
    ];
  }, [activeInternalCategories, entries]);

  // Index entries by composite key + date so each section can look itself up.
  const entryMap = useMemo(() => {
    const m = new Map<CellKey, Map<string, CellInfo>>();
    for (const e of entries) {
      let key: CellKey | null = null;
      if (e.entry_type === "project" && e.task_id) key = projectKey(e.task_id);
      else if (e.entry_type === "internal" && e.internal_category)
        key = internalKey(e.internal_category);
      else if (e.entry_type === "non_working" && e.leave_type)
        key = nonWorkingKey(e.leave_type);
      if (!key) continue;
      if (!m.has(key)) m.set(key, new Map());
      m.get(key)!.set(e.entry_date, {
        id: e.id,
        hours: e.hours,
        notes: e.notes,
        billable: e.billable,
      });
    }
    return m;
  }, [entries]);

  const dayTotals = useMemo(() => {
    const t = new Map<string, number>();
    for (const e of entries) t.set(e.entry_date, (t.get(e.entry_date) ?? 0) + e.hours);
    return t;
  }, [entries]);

  // Bucketed totals for the footer / summary
  const buckets = useMemo(() => {
    let billable = 0;
    let internal = 0;
    let nonWorking = 0;
    for (const e of entries) {
      if (e.entry_type === "project") {
        if (e.billable) billable += e.hours;
        else internal += e.hours; // non-billable project time still consumes capacity
      } else if (e.entry_type === "internal") internal += e.hours;
      else if (e.entry_type === "non_working") nonWorking += e.hours;
    }
    return { billable, internal, nonWorking };
  }, [entries]);

  const rowTotalFor = (key: CellKey): number => {
    const cells = entryMap.get(key);
    if (!cells) return 0;
    let total = 0;
    for (const c of cells.values()) total += c.hours;
    return total;
  };

  const grandTotal = buckets.billable + buckets.internal + buckets.nonWorking;
  const noResource = !profile?.resource_id;

  // Auto-create non-working entries from approved leave/holidays the first
  // time a week is opened (idempotent — only fills cells that have no entry
  // yet for that leave_type+date).
  const userId = user?.id ?? null;
  const dispatchedPrefillRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (readOnly) return;
    if (!userId || nonWorkingPrefill.length === 0) return;
    for (const row of nonWorkingPrefill) {
      const existing = entryMap.get(nonWorkingKey(row.leave_type));
      for (const [date, hours] of row.autoHoursByDate) {
        if (existing?.has(date)) continue;
        // Guard against re-firing while the insert is in flight and the
        // entries query has not yet refetched — otherwise the effect re-runs
        // and creates duplicate non_working rows (e.g. holiday counted 2×).
        const flightKey = `${userId}|${row.leave_type}|${date}`;
        if (dispatchedPrefillRef.current.has(flightKey)) continue;
        dispatchedPrefillRef.current.add(flightKey);
        upsert.mutate(
          {
            entry_type: "non_working",
            leave_type: row.leave_type,
            user_id: userId,
            entry_date: date,
            hours,
            existing_entry_id: null,
          },
          {
            onError: () => {
              dispatchedPrefillRef.current.delete(flightKey);
            },
          },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, nonWorkingPrefill, weekStart]);

  return (
    <AppShell active="timesheet">
      <div className="w-full px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Weekly Timesheet
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Log time per project stage, internal cost center, or non-working time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isRealAdmin && (
              <CollaboratorViewPicker
                selectedCollaboratorId={viewedCollaboratorId ?? selfProfile?.collaborator_id ?? null}
                selfCollaboratorId={selfProfile?.collaborator_id ?? null}
                onChange={(id) => {
                  setViewedCollaboratorId(id);
                  setExtraTaskIds([]);
                }}
              />
            )}
            {readOnly && (
              <span className="rounded-full border border-amber-400/40 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Read-only · viewing another collaborator
              </span>
            )}
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setWeekAnchor((d) => addWeeks(d, -1))}
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <button
                onClick={() => setWeekAnchor(new Date())}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {format(weekStartDate, "MMM d")} –{" "}
                {format(addDays(weekStartDate, 6), "MMM d, yyyy")}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>


        {/* Summary chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <SummaryChip label="Billable" value={buckets.billable} tone="primary" />
          <SummaryChip
            label="Internal (non-billable)"
            value={buckets.internal}
            tone="muted"
          />
          <SummaryChip label="Non-working" value={buckets.nonWorking} tone="muted" />
          <SummaryChip label="Total" value={grandTotal} tone="bold" />
        </div>

        {noResource ? (
          <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            A tua conta ainda não está ligada a um membro da equipa. Pede a um admin para te
            adicionar com email correspondente.
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
              <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add project / stage
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[460px] p-0">
                  <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder="Search any project by name or client..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setExpandedProject(null);
                      }}
                      className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-80 overflow-y-auto p-1">
                    {!searchQuery && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Type a project or client name to search.
                      </div>
                    )}
                    {searchQuery && searching && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Searching…
                      </div>
                    )}
                    {searchQuery && !searching && searchResults.length === 0 && (
                      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No projects match "{searchQuery}".
                      </div>
                    )}
                    {searchResults.map((p) => {
                      const expanded = expandedProject === p.id;
                      return (
                        <div key={p.id} className="rounded">
                          <button
                            onClick={() => setExpandedProject(expanded ? null : p.id)}
                            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span
                              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{p.name}</div>
                              {p.client && (
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {p.client}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {p.stages.length}{" "}
                              {p.stages.length === 1 ? "stage" : "stages"}
                            </span>
                            <ChevronDown
                              className={`h-3.5 w-3.5 text-muted-foreground transition ${
                                expanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          {expanded && (
                            <div className="ml-5 border-l border-border pl-2">
                              {p.stages.length === 0 && (
                                <div className="px-3 py-2 text-[11px] text-muted-foreground">
                                  No stages defined for this project.
                                </div>
                              )}
                              {p.stages.map((s) => (
                                <button
                                  key={s.id}
                                  disabled={ensureRow.isPending || !profile?.resource_id}
                                  onClick={async () => {
                                    if (!profile?.resource_id) return;
                                    try {
                                      const taskId = await ensureRow.mutateAsync({
                                        resource_id: profile.resource_id,
                                        stage_id: s.id,
                                        stage_start: s.start_date,
                                        stage_end: s.end_date,
                                      });
                                      setExtraTaskIds((ids) =>
                                        Array.from(new Set([...ids, taskId])),
                                      );
                                      setSearchQuery("");
                                      setExpandedProject(null);
                                      setAddPopoverOpen(false);
                                      toast.success(`Added ${p.name} · ${s.name}`);
                                    } catch (err) {
                                      toast.error(
                                        (err as Error).message || "Failed to add stage",
                                      );
                                    }
                                  }}
                                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-[13px] hover:bg-accent disabled:opacity-50"
                                >
                                  <span
                                    className="h-2 w-2 flex-shrink-0 rounded-full"
                                    style={{ backgroundColor: s.color }}
                                  />
                                  <span className="flex-1 truncate">{s.name}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(s.start_date), "MMM d")} –{" "}
                                    {format(new Date(s.end_date), "MMM d")}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <span className="ml-auto text-xs text-muted-foreground">
                {projectRows.length}{" "}
                {projectRows.length === 1 ? "project row" : "project rows"} ·{" "}
                {displayedInternalCategories.length} internal · {nonWorkingPrefill.length}{" "}
                non-working
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left font-medium">
                      Description
                    </th>
                    {days.map((d) => (
                      <th
                        key={d.toISOString()}
                        className="px-2 py-2 text-center font-medium"
                      >
                        <div>{format(d, "EEE")}</div>
                        <div className="text-foreground/80">{format(d, "MMM d")}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ====== PROJECTS ====== */}
                  <SectionHeaderRow
                    icon={<Briefcase className="h-3.5 w-3.5" />}
                    label="Projects"
                    sub="Billable or non-billable. Toggle inside each cell."
                  />
                  {isLoading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                        Loading projects…
                      </td>
                    </tr>
                  )}
                  {!isLoading && projectRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                        No active stages this week. Use "Add project / stage" to log time
                        elsewhere.
                      </td>
                    </tr>
                  )}
                  {projectRows.map((r) => (
                    <ProjectRow
                      key={r.task_id}
                      row={r}
                      days={days}
                      entryMap={entryMap}
                      isExtra={extraTaskIds.includes(r.task_id)}
                      onRemove={() =>
                        setExtraTaskIds((ids) => ids.filter((x) => x !== r.task_id))
                      }
                      pending={upsert.isPending || readOnly}
                      rowTotal={rowTotalFor(projectKey(r.task_id))}
                      onCommit={(dateStr, hours, notes, billable, existingId) =>
                        upsert.mutate(
                          {
                            entry_type: "project",
                            task_id: r.task_id,
                            user_id: effectiveUserId!,
                            entry_date: dateStr,
                            hours,
                            notes,
                            billable,
                            existing_entry_id: existingId,
                          },
                          {
                            onError: (e) =>
                              toast.error((e as Error).message || "Failed to save"),
                          },
                        )
                      }
                    />
                  ))}

                  {/* ====== INTERNAL ====== */}
                  <SectionHeaderRow
                    icon={<Coffee className="h-3.5 w-3.5" />}
                    label="Internal cost centers"
                    sub="Non-billable working time (capacity used, no revenue)."
                  />
                  {displayedInternalCategories.map((cat) => (
                    <FixedRow
                      key={cat.name}
                      label={cat.isArchived ? `${cat.name} (archived)` : cat.name}
                      sub={
                        cat.isArchived
                          ? "Internal · archived (read-only label, edits still allowed)"
                          : "Internal · non-billable"
                      }
                      tone="internal"
                      days={days}
                      entryMap={entryMap}
                      keyFn={() => internalKey(cat.name)}
                      pending={upsert.isPending || readOnly}
                      rowTotal={rowTotalFor(internalKey(cat.name))}
                      onCommit={(dateStr, hours, notes, _billable, existingId) =>
                        upsert.mutate(
                          {
                            entry_type: "internal",
                            internal_category: cat.name,
                            user_id: effectiveUserId!,
                            entry_date: dateStr,
                            hours,
                            notes,
                            existing_entry_id: existingId,
                          },
                          {
                            onError: (e) =>
                              toast.error((e as Error).message || "Failed to save"),
                          },
                        )
                      }
                    />
                  ))}

                  {/* ====== NON-WORKING ====== */}
                  <SectionHeaderRow
                    icon={<Plane className="h-3.5 w-3.5" />}
                    label="Non-working time"
                    sub="Auto-filled from approved leave + public holidays. Reduces capacity."
                  />
                  {nonWorkingPrefill.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-4 text-center text-xs text-muted-foreground">
                        No approved leave or holidays this week.
                      </td>
                    </tr>
                  )}
                  {nonWorkingPrefill.map((row) => (
                    <FixedRow
                      key={row.key}
                      label={row.leave_type}
                      sub="Non-working · capacity reducer"
                      tone="nonworking"
                      days={days}
                      entryMap={entryMap}
                      keyFn={() => nonWorkingKey(row.leave_type)}
                      pending={upsert.isPending || readOnly}
                      rowTotal={rowTotalFor(nonWorkingKey(row.leave_type))}
                      onCommit={(dateStr, hours, notes, _billable, existingId) =>
                        upsert.mutate(
                          {
                            entry_type: "non_working",
                            leave_type: row.leave_type,
                            user_id: effectiveUserId!,
                            entry_date: dateStr,
                            hours,
                            notes,
                            existing_entry_id: existingId,
                          },
                          {
                            onError: (e) =>
                              toast.error((e as Error).message || "Failed to save"),
                          },
                        )
                      }
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 text-sm">
                    <td className="sticky left-0 bg-muted/50 px-4 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">
                      Daily total
                    </td>
                    {days.map((d) => {
                      const dateStr = format(d, "yyyy-MM-dd");
                      const total = dayTotals.get(dateStr) ?? 0;
                      return (
                        <td
                          key={dateStr}
                          className={`px-2 py-2 text-center font-mono ${
                            total > 0 ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {formatHM(total) || "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {formatHM(grandTotal) || "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ----------------------------- Sub-components -----------------------------

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "primary" | "muted" | "bold";
}) {
  const cls =
    tone === "primary"
      ? "border-primary/30 bg-primary/10 text-primary"
      : tone === "bold"
        ? "border-foreground/30 bg-foreground/5 text-foreground font-semibold"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1 text-xs ${cls}`}
    >
      <span>{label}</span>
      <span className="font-mono">{formatHM(value) || "0h00"}</span>
    </span>
  );
}

function SectionHeaderRow({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <tr className="border-b border-border bg-muted/15">
      <td
        colSpan={9}
        className="sticky left-0 z-10 bg-muted/30 px-4 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-foreground">{label}</span>
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">
            {sub}
          </span>
        </div>
      </td>
    </tr>
  );
}

function ProjectRow({
  row,
  days,
  entryMap,
  isExtra,
  onRemove,
  pending,
  rowTotal,
  onCommit,
}: {
  row: TimesheetTaskRow;
  days: Date[];
  entryMap: Map<CellKey, Map<string, CellInfo>>;
  isExtra: boolean;
  onRemove: () => void;
  pending: boolean;
  rowTotal: number;
  onCommit: (
    dateStr: string,
    hours: number,
    notes: string | null,
    billable: boolean,
    existingId: string | null,
  ) => void;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="sticky left-0 z-10 bg-card px-4 py-2">
        <div className="flex items-start gap-2">
          <span
            className="mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: row.project.color }}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {row.project.name}
              {row.project.client ? (
                <span className="text-muted-foreground"> · {row.project.client}</span>
              ) : null}
            </div>
            <div
              className="truncate text-[12px] font-medium"
              style={{ color: row.stage.color }}
            >
              {row.stage.name}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Suggested {formatHM(row.hours_per_day) || "0h00"}/day
            </div>
          </div>
          {isExtra && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 flex-shrink-0"
              onClick={onRemove}
              aria-label="Remove row"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
      {days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const inAlloc = dateStr >= row.allocation_start && dateStr <= row.allocation_end;
        const cell = entryMap.get(projectKey(row.task_id))?.get(dateStr);
        const suggested = inAlloc ? row.hours_per_day : 0;
        return (
          <td key={dateStr} className="px-1 py-1 text-center">
            <HourCell
              date={d}
              title={row.project.name}
              subtitle={row.stage.name}
              entryType="project"
              value={cell?.hours ?? 0}
              notes={cell?.notes ?? ""}
              billable={cell?.billable ?? true}
              suggested={suggested}
              disabled={pending}
              onCommit={(hours, notes, billable) =>
                onCommit(dateStr, hours, notes, billable, cell?.id ?? null)
              }
            />
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-mono text-sm">{formatHM(rowTotal) || "—"}</td>
    </tr>
  );
}

function FixedRow({
  label,
  sub,
  tone,
  days,
  entryMap,
  keyFn,
  pending,
  rowTotal,
  onCommit,
}: {
  label: string;
  sub: string;
  tone: "internal" | "nonworking";
  days: Date[];
  entryMap: Map<CellKey, Map<string, CellInfo>>;
  keyFn: () => CellKey;
  pending: boolean;
  rowTotal: number;
  onCommit: (
    dateStr: string,
    hours: number,
    notes: string | null,
    billable: boolean,
    existingId: string | null,
  ) => void;
}) {
  const dotCls = tone === "internal" ? "bg-muted-foreground" : "bg-accent-foreground/60";
  return (
    <tr className="border-b border-border last:border-0">
      <td className="sticky left-0 z-10 bg-card px-4 py-2">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotCls}`}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{label}</div>
            <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
          </div>
        </div>
      </td>
      {days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const cell = entryMap.get(keyFn())?.get(dateStr);
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        return (
          <td key={dateStr} className="px-1 py-1 text-center">
            <HourCell
              date={d}
              title={label}
              subtitle={sub}
              entryType={tone === "internal" ? "internal" : "non_working"}
              value={cell?.hours ?? 0}
              notes={cell?.notes ?? ""}
              billable={false}
              suggested={isWeekend ? 0 : tone === "nonworking" ? 8 : 0}
              disabled={pending}
              onCommit={(hours, notes) =>
                onCommit(dateStr, hours, notes, false, cell?.id ?? null)
              }
            />
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-mono text-sm">{formatHM(rowTotal) || "—"}</td>
    </tr>
  );
}

function HourCell({
  date,
  title,
  subtitle,
  entryType,
  value,
  notes,
  billable,
  suggested,
  disabled,
  onCommit,
}: {
  date: Date;
  title: string;
  subtitle: string;
  entryType: EntryType;
  value: number;
  notes: string;
  billable: boolean;
  suggested: number;
  disabled: boolean;
  onCommit: (hours: number, notes: string | null, billable: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftHours, setDraftHours] = useState<string>(formatHM(value));
  const [draftNotes, setDraftNotes] = useState<string>(notes);
  const [draftBillable, setDraftBillable] = useState<boolean>(billable);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftHours(formatHM(value));
    setDraftNotes(notes);
    setDraftBillable(billable);
  }, [value, notes, billable]);

  const display = formatHM(value);
  const placeholder = suggested ? formatHM(suggested) : "0h00";

  const handleSave = () => {
    const parsed = parseHM(draftHours);
    if (parsed === null || parsed < 0 || parsed > 24) {
      setError("Use format like 6h30");
      return;
    }
    setError(null);
    const trimmedNotes = draftNotes.trim();
    onCommit(
      parsed,
      trimmedNotes === "" ? null : trimmedNotes,
      entryType === "project" ? draftBillable : false,
    );
    setOpen(false);
  };

  const handleClear = () => {
    setError(null);
    onCommit(0, null, true);
    setDraftHours("");
    setDraftNotes("");
    setDraftBillable(true);
    setOpen(false);
  };

  // Visual treatment per type
  const cellCls =
    value > 0
      ? entryType === "project"
        ? billable
          ? "border-border bg-background text-foreground hover:border-ring"
          : "border-dashed border-border bg-muted/40 text-muted-foreground hover:border-ring"
        : entryType === "internal"
          ? "border-border bg-muted/50 text-foreground hover:border-ring"
          : "border-border bg-accent/40 text-foreground hover:border-ring"
      : "border-transparent text-muted-foreground hover:border-border hover:bg-background";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraftHours(formatHM(value));
          setDraftNotes(notes);
          setDraftBillable(billable);
          setError(null);
          setTimeout(() => inputRef.current?.select(), 50);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`relative h-9 w-20 rounded border text-center font-mono text-sm transition ${cellCls}`}
        >
          {display || <span className="text-muted-foreground/60">{placeholder}</span>}
          {notes && value > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {format(date, "EEEE, MMM d")}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="space-y-3 px-4 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Time (e.g. 6h05, 6h30)
            </label>
            <Input
              ref={inputRef}
              value={draftHours}
              onChange={(e) => {
                setDraftHours(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder={placeholder}
              className="font-mono"
            />
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              className="resize-none text-sm"
            />
          </div>
          {entryType === "project" ? (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded border border-border bg-muted/30 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">Billable</div>
                <div className="text-[11px] text-muted-foreground">
                  Uncheck to log time that won't be charged to the client.
                </div>
              </div>
              <input
                type="checkbox"
                checked={draftBillable}
                onChange={(e) => setDraftBillable(e.target.checked)}
                className="h-4 w-4 flex-shrink-0 cursor-pointer accent-primary"
              />
            </label>
          ) : (
            <div className="rounded border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              {entryType === "internal"
                ? "Internal time is always non-billable and counts toward used capacity."
                : "Non-working time reduces available capacity and isn't billable."}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={value === 0}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
