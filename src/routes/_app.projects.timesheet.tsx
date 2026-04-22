import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { AppShell } from "@/components/projects/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectsAuth } from "@/lib/projects/use-auth";
import {
  useTimesheetRows,
  useTimesheetEntries,
  useUpsertTimesheetCell,
  useProjectSearch,
  useEnsureStageRow,
} from "@/lib/projects/use-timesheet";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Search, X, ChevronDown, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { formatHM, parseHM } from "@/lib/projects/time-format";

export const Route = createFileRoute("/_app/projects/timesheet")({
  component: TimesheetPage,
});

function TimesheetPage() {
  const { profile, user } = useProjectsAuth();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [extraTaskIds, setExtraTaskIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

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

  const { data: rows = [], isLoading } = useTimesheetRows({
    resourceId: profile?.resource_id ?? null,
    userId: user?.id ?? null,
    weekStart,
    weekEnd,
    extraTaskIds,
  });
  const { data: entries = [] } = useTimesheetEntries({
    userId: user?.id ?? null,
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

  const entryMap = useMemo(() => {
    const m = new Map<
      string,
      Map<string, { id: string; hours: number; notes: string | null; billable: boolean }>
    >();
    for (const e of entries) {
      if (!m.has(e.task_id)) m.set(e.task_id, new Map());
      m.get(e.task_id)!.set(e.entry_date, {
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

  const rowTotal = (taskId: string) => {
    const cells = entryMap.get(taskId);
    if (!cells) return 0;
    let total = 0;
    for (const c of cells.values()) total += c.hours;
    return total;
  };

  const grandTotal = entries.reduce((s, e) => s + e.hours, 0);
  const noResource = !profile?.resource_id;

  return (
    <AppShell active="timesheet">
      <div className="mx-auto w-full max-w-[1500px] px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Weekly Timesheet</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Log time per project stage. Click a cell to enter time and a description.
            </p>
          </div>
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
              {format(weekStartDate, "MMM d")} – {format(addDays(weekStartDate, 6), "MMM d, yyyy")}
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
                              {p.stages.length} {p.stages.length === 1 ? "stage" : "stages"}
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
                                      toast.error((err as Error).message || "Failed to add stage");
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
                {rows.length} {rows.length === 1 ? "row" : "rows"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left font-medium">
                      Project · Stage
                    </th>
                    {days.map((d) => (
                      <th key={d.toISOString()} className="px-2 py-2 text-center font-medium">
                        <div>{format(d, "EEE")}</div>
                        <div className="text-foreground/80">{format(d, "MMM d")}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        No active stages this week. Use "Add project / stage" to log time elsewhere.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => {
                    const isExtra = extraTaskIds.includes(r.task_id);
                    return (
                      <tr key={r.task_id} className="border-b border-border last:border-0">
                        <td className="sticky left-0 z-10 bg-card px-4 py-2">
                          <div className="flex items-start gap-2">
                            <span
                              className="mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: r.project.color }}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {r.project.name}
                                {r.project.client ? (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    · {r.project.client}
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className="truncate text-[12px] font-medium"
                                style={{ color: r.stage.color }}
                              >
                                {r.stage.name}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                Suggested {formatHM(r.hours_per_day) || "0h00"}/day
                              </div>
                            </div>
                            {isExtra && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() =>
                                  setExtraTaskIds((ids) => ids.filter((x) => x !== r.task_id))
                                }
                                aria-label="Remove row"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                        {days.map((d) => {
                          const dateStr = format(d, "yyyy-MM-dd");
                          const inAlloc =
                            dateStr >= r.allocation_start && dateStr <= r.allocation_end;
                          const cell = entryMap.get(r.task_id)?.get(dateStr);
                          const suggested = inAlloc ? r.hours_per_day : 0;
                          return (
                            <td key={dateStr} className="px-1 py-1 text-center">
                              <HourCell
                                date={d}
                                projectName={r.project.name}
                                stageName={r.stage.name}
                                value={cell?.hours ?? 0}
                                notes={cell?.notes ?? ""}
                                billable={cell?.billable ?? true}
                                suggested={suggested}
                                disabled={upsert.isPending}
                                onCommit={(hours, notes, billable) => {
                                  upsert.mutate(
                                    {
                                      task_id: r.task_id,
                                      user_id: user!.id,
                                      entry_date: dateStr,
                                      hours,
                                      notes,
                                      billable,
                                      existing_entry_id: cell?.id ?? null,
                                    },
                                    {
                                      onError: (e) =>
                                        toast.error((e as Error).message || "Failed to save"),
                                    },
                                  );
                                }}
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right font-mono text-sm">
                          {formatHM(rowTotal(r.task_id)) || "—"}
                        </td>
                      </tr>
                    );
                  })}
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

function HourCell({
  date,
  projectName,
  stageName,
  value,
  notes,
  billable,
  suggested,
  disabled,
  onCommit,
}: {
  date: Date;
  projectName: string;
  stageName: string;
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
    onCommit(parsed, trimmedNotes === "" ? null : trimmedNotes, draftBillable);
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
          className={`relative h-9 w-20 rounded border text-center font-mono text-sm transition ${
            value > 0
              ? billable
                ? "border-border bg-background text-foreground hover:border-ring"
                : "border-dashed border-border bg-muted/40 text-muted-foreground hover:border-ring"
              : "border-transparent text-muted-foreground hover:border-border hover:bg-background"
          }`}
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
          <div className="mt-0.5 truncate text-sm font-medium">{projectName}</div>
          <div className="truncate text-xs text-muted-foreground">{stageName}</div>
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
