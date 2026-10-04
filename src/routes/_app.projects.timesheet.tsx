import { useDateLocale } from "@/i18n/use-date-locale";
import { useNonWorkingDays, nonWorkingLine } from "@/lib/projects/use-non-working-days";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/projects/app-shell";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCalendarGridSuggestions, type GridCalendarEvent } from "@/lib/projects/calendar.functions";
import { useTimesheetRetainers, type RetainerParentRow } from "@/lib/projects/use-timesheet-retainers";
import { CalendarDayBadge, CalendarRowHint, type HintTarget } from "@/components/projects/timesheet-calendar";
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
import { Check, ChevronsUpDown, Eye, Mic } from "lucide-react";
import { TimesheetAssistantSheet } from "@/components/projects/timesheet-assistant-sheet";
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
import { PURSUIT_CATEGORY, useLeadsDirectory } from "@/lib/projects/use-pursuit";
import { useWorkProfile, workProfileLayout } from "@/lib/hr/use-work-profile";
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
import { ProjectStageLeadPicker } from "@/components/projects/project-stage-lead-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { formatHM, parseHM } from "@/lib/projects/time-format";
import { MyWeekCard } from "@/components/projects/my-week-card";
import {
  isWeekLocked,
  totalsFromEntries,
  useTimesheetWeek,
} from "@/lib/projects/use-timesheet-weeks";


export const Route = createFileRoute("/_app/projects/timesheet")({
  component: TimesheetPage,
});

// Composite key for the entry map: <type>::<row identifier>
type CellKey = string;
const projectKey = (taskId: string): CellKey => `project::${taskId}`;
const internalKey = (cat: string): CellKey => `internal::${cat}`;
const nonWorkingKey = (lt: string): CellKey => `non_working::${lt}`;
const pursuitKey = (oppId: string): CellKey => `pursuit::${oppId}`;

type CellInfo = {
  id: string;
  hours: number;
  notes: string | null;
  billable: boolean;
};

function TimesheetPage() {
  const { profile: selfProfile, user } = useProjectsAuth();
  const { isRealAdmin, viewAsUser } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [dictateOpen, setDictateOpen] = useState(false);
  const { t } = useTranslation();
  const [extraTaskIds, setExtraTaskIds] = useState<string[]>([]);
  // Pursuit rows added through "Add row" for this session (lead ids).
  const [extraLeadIds, setExtraLeadIds] = useState<string[]>([]);
  const { data: leads = [] } = useLeadsDirectory();
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
  const viewingOther = isViewingOther;

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

  const { data: allProjectRows = [], isLoading } = useTimesheetRows({
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
  const { data: retainerData } = useTimesheetRetainers(effectiveResourceId);
  const [extraRetainerIds, setExtraRetainerIds] = useState<string[]>([]);
  // Retainer month stages are shown as one row per retainer, never per month.
  const projectRows = useMemo(
    () => allProjectRows.filter((r) => !retainerData?.childToParent.has(r.stage.id)),
    [allProjectRows, retainerData],
  );
  const { data: searchResults = [], isFetching: searching } = useProjectSearch({
    query: searchQuery,
  });
  const ensureRow = useEnsureStageRow();
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  // Weekly approval layer: once the week has been submitted or approved the
  // grid becomes read-only until an approver returns or reopens it.
  const { data: currentWeek } = useTimesheetWeek({
    userId: effectiveUserId,
    weekStart,
  });
  const weekLocked = isWeekLocked(currentWeek);
  const readOnly = viewingOther || weekLocked;

  // Work profile — UX only. Decides section order and whether the project
  // section is shown by default. The data model is identical for everyone.
  const { data: workProfile = "project" } = useWorkProfile(effectiveCollaboratorId);
  const layout = workProfileLayout(workProfile);
  const [showProjectsOverride, setShowProjectsOverride] = useState(false);
  useEffect(() => {
    setShowProjectsOverride(false);
  }, [effectiveCollaboratorId]);
  const projectsVisible = !layout.projectsHiddenByDefault || showProjectsOverride;


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
  // Categories are further filtered by the collaborator's work profile:
  // `visible_to_profiles` only gates NEW entries, never history.
  const { data: activeInternalCategories = [] } = useInternalCategories({
    workProfile,
  });

  // The rows we actually render under "Internal cost centers": every active
  // category PLUS any archived category that has logged hours this week (so
  // people can still see / clear historical entries). Archived rows are
  // visually flagged but otherwise editable for the existing hours.
  const displayedInternalCategories = useMemo<{
    name: string;
    isArchived: boolean;
  }[]>(() => {
    // Pursuit is logged per lead (its own rows below), never as a plain row.
    const active = activeInternalCategories
      .filter((c) => c.name !== PURSUIT_CATEGORY)
      .map((c) => ({
      name: c.name,
      isArchived: false,
    }));
    const activeNames = new Set(active.map((c) => c.name));
    const archivedWithEntries = new Set<string>();
    for (const e of entries) {
      if (
        e.entry_type === "internal" &&
        e.internal_category &&
        e.internal_category !== PURSUIT_CATEGORY &&
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

  // Pursuit rows: leads with hours this week plus leads added via "Add row".
  const pursuitRows = useMemo(() => {
    const ids = new Set<string>(extraLeadIds);
    for (const e of entries)
      if (e.internal_category === PURSUIT_CATEGORY && e.opportunity_id) ids.add(e.opportunity_id);
    const byId = new Map(leads.map((l) => [l.id, l]));
    return Array.from(ids).map(
      (id) =>
        byId.get(id) ?? { id, name: t("projects:pursuit.unknownLead"), company_name: null, stage: "", is_open: false },
    );
  }, [entries, extraLeadIds, leads, t]);
  const leadMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((l) => l.is_open)
      .filter((l) => l.name.toLowerCase().includes(q) || (l.company_name ?? "").toLowerCase().includes(q))
      .slice(0, 10);
  }, [leads, searchQuery]);
  const leadLabel = (l: { name: string; stage: string; company_name: string | null }) =>
    [l.name, l.stage ? t(`projects:pursuit.stage.${l.stage}`, { defaultValue: l.stage }) : null, l.company_name]
      .filter(Boolean)
      .join(" · ");

  // Index entries by composite key + date so each section can look itself up.
  const entryMap = useMemo(() => {
    const m = new Map<CellKey, Map<string, CellInfo>>();
    for (const e of entries) {
      let key: CellKey | null = null;
      if (e.entry_type === "project" && e.task_id) key = projectKey(e.task_id);
      else if (
        e.entry_type === "internal" &&
        e.internal_category === PURSUIT_CATEGORY &&
        e.opportunity_id
      )
        key = pursuitKey(e.opportunity_id);
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

  // ---------------- Retainers as normal project rows ----------------
  const qc = useQueryClient();
  const dateLocale = useDateLocale();
  const retainerTaskToChild = useMemo(() => {
    const m = new Map(retainerData?.taskToChild ?? []);
    for (const r of allProjectRows) if (retainerData?.childToParent.has(r.stage.id)) m.set(r.task_id, r.stage.id);
    return m;
  }, [retainerData, allProjectRows]);
  const retainerParentForProject = (stageIds: string[]): string | null => {
    if (!retainerData || stageIds.length === 0) return null;
    const parents = new Set(stageIds.map((id) => retainerData.childToParent.get(id) ?? null));
    if (parents.has(null) || parents.size !== 1) return null;
    return [...parents][0];
  };
  /** Entries (this week) on a retainer month stage, task-based or open-logging. */
  const retainerEntryChild = (e: TimesheetEntry): string | null =>
    e.entry_type !== "project"
      ? null
      : (e.task_id ? retainerTaskToChild.get(e.task_id) : null) ??
        (e.pm_stage_id && retainerData?.childToParent.has(e.pm_stage_id) ? e.pm_stage_id : null);
  const retainerRows = useMemo<RetainerParentRow[]>(() => {
    if (!retainerData) return [];
    const ids = new Set<string>(extraRetainerIds);
    for (const r of allProjectRows) {
      const p = retainerData.childToParent.get(r.stage.id);
      if (p) ids.add(p);
    }
    for (const e of entries) {
      const c = retainerEntryChild(e);
      if (c) ids.add(retainerData.childToParent.get(c)!);
    }
    return retainerData.rows.filter((r) => ids.has(r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retainerData, extraRetainerIds, allProjectRows, entries, retainerTaskToChild]);
  const childForDate = (r: RetainerParentRow, date: string) => r.children.find((c) => c.month === date.slice(0, 7)) ?? null;
  const ensureRetainerTask = async (child: { id: string; start_date: string; end_date: string }) => {
    if (!profile?.resource_id) throw new Error("No resource");
    const taskId = await ensureRow.mutateAsync({
      resource_id: profile.resource_id,
      stage_id: child.id,
      stage_start: child.start_date,
      stage_end: child.end_date,
    });
    qc.invalidateQueries({ queryKey: ["pm-timesheet-retainers"] });
    return taskId;
  };
  const commitRetainerCell = async (
    r: RetainerParentRow,
    date: string,
    hours: number,
    notes: string | null,
    billable: boolean,
  ) => {
    const child = childForDate(r, date);
    if (!child) return;
    const existing = entries.filter((e) => e.entry_date === date && retainerEntryChild(e) === child.id);
    const first = existing[0] ?? null;
    const others = existing.slice(1).reduce((a, e) => a + e.hours, 0);
    if (!first && hours <= 0) return;
    try {
      const taskId = first ? first.task_id : await ensureRetainerTask(child);
      await upsert.mutateAsync({
        entry_type: "project",
        task_id: taskId,
        user_id: effectiveUserId!,
        entry_date: date,
        hours: Math.max(0, hours - others),
        notes,
        billable,
        existing_entry_id: first?.id ?? null,
      });
    } catch (e) {
      toast.error((e as Error).message || "Failed to save");
    }
  };

  // ---------------- Calendar suggestions (own timesheet only) ----------------
  const calendarAllowed = !viewingOther && !viewAsUser && !weekLocked && !!user?.id;
  const fetchGridCalendar = useServerFn(getCalendarGridSuggestions);
  const { data: gridCalendar } = useQuery({
    queryKey: ["timesheet-calendar-grid", user?.id ?? null, weekStart],
    enabled: calendarAllowed,
    staleTime: 60_000,
    retry: false,
    queryFn: () => fetchGridCalendar({ data: { weekStart, weekEnd } }),
  });
  const calEvents = calendarAllowed && gridCalendar?.status === "connected" ? gridCalendar.events : [];
  const calByDay = useMemo(() => {
    const m = new Map<string, GridCalendarEvent[]>();
    for (const e of calEvents) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [calEvents]);
  const hintEvents = (match: (e: GridCalendarEvent) => boolean, date: string) =>
    (calByDay.get(date) ?? []).filter(match);

  type AddTarget =
    | { kind: "task"; taskId: string }
    | { kind: "retainer"; row: RetainerParentRow }
    | { kind: "internal"; category: string; opportunity_id?: string | null };

  /** Adds hours to a cell and records the calendar event ids, as the assistant does. */
  const addToCell = async (target: AddTarget, date: string, hours: number, eventIds: string[]) => {
    const uid = user!.id;
    let taskId: string | null = null;
    let existing: TimesheetEntry | undefined;
    if (target.kind === "task") {
      taskId = target.taskId;
      existing = entries.find((e) => e.entry_date === date && e.entry_type === "project" && e.task_id === taskId);
    } else if (target.kind === "retainer") {
      const child = childForDate(target.row, date);
      if (!child) throw new Error(t("projects:tsCalendar.noRetainerMonth", { month: format(new Date(date + "T00:00:00"), "MMM yyyy", { locale: dateLocale }) }));
      existing = entries.find((e) => e.entry_date === date && retainerEntryChild(e) === child.id);
      taskId = existing ? existing.task_id : await ensureRetainerTask(child);
    } else {
      existing = entries.find(
        (e) =>
          e.entry_date === date &&
          e.entry_type === "internal" &&
          e.internal_category === target.category &&
          (e.opportunity_id ?? null) === (target.opportunity_id ?? null),
      );
    }
    await upsert.mutateAsync({
      entry_type: target.kind === "internal" ? "internal" : "project",
      task_id: target.kind === "internal" ? null : taskId,
      internal_category: target.kind === "internal" ? target.category : null,
      opportunity_id: target.kind === "internal" ? (target.opportunity_id ?? null) : null,
      user_id: uid,
      entry_date: date,
      hours: (existing?.hours ?? 0) + hours,
      notes: existing?.notes ?? null,
      billable: existing?.billable ?? true,
      existing_entry_id: existing?.id ?? null,
    });
    let rowId = existing?.id ?? null;
    if (!rowId) {
      let q = supabase.from("pm_time_entries").select("id").eq("user_id", uid).eq("entry_date", date);
      if (target.kind === "internal") {
        q = q.eq("entry_type", "internal").eq("internal_category", target.category);
        if (target.opportunity_id) q = q.eq("opportunity_id", target.opportunity_id);
      } else q = q.eq("entry_type", "project").eq("task_id", taskId!);
      const { data: row } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      rowId = (row as { id: string } | null)?.id ?? null;
    }
    if (rowId && eventIds.length) {
      const { data: cur } = await supabase.from("pm_time_entries").select("calendar_event_ids").eq("id", rowId).maybeSingle();
      const ids = [...new Set([...(((cur as { calendar_event_ids: string[] | null } | null)?.calendar_event_ids) ?? []), ...eventIds])];
      await supabase.from("pm_time_entries").update({ calendar_event_ids: ids } as never).eq("id", rowId);
    }
    qc.invalidateQueries({ queryKey: ["timesheet-calendar-grid"] });
    qc.invalidateQueries({ queryKey: ["pm-timesheet-entries"] });
  };
  const runAdd = async (target: AddTarget, date: string, hours: number, eventIds: string[], label: string) => {
    try {
      await addToCell(target, date, hours, eventIds);
      toast.success(t("projects:tsCalendar.added", { hours: formatHM(hours), name: label }));
    } catch (e) {
      toast.error((e as Error).message || "Failed to save");
    }
  };
  const dismissEvent = async (id: string) => {
    const { error } = await supabase.from("calendar_dismissed_events").upsert({ user_id: user!.id, event_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["timesheet-calendar-grid"] });
  };

  // Row hint targets per project: every grid row for that project.
  const projectTargets = useMemo(() => {
    const m = new Map<string, Array<HintTarget & { target: AddTarget }>>();
    for (const r of projectRows)
      m.set(r.project.id, [...(m.get(r.project.id) ?? []), { key: `t:${r.task_id}`, label: `${r.project.name} · ${r.stage.name}`, target: { kind: "task", taskId: r.task_id } }]);
    for (const r of retainerRows)
      m.set(r.project.id, [...(m.get(r.project.id) ?? []), { key: `r:${r.id}`, label: `${r.project.name} · ${r.name}`, target: { kind: "retainer", row: r } }]);
    return m;
  }, [projectRows, retainerRows]);
  /** Hint shown only on the first grid row of a matched project. */
  const projectHint = (projectId: string, rowKey: string, date: string) => {
    if (!calEvents.length) return null;
    const targets = projectTargets.get(projectId) ?? [];
    if (!targets.length || targets[0].key !== rowKey) return null;
    const evs = hintEvents((e) => e.project_id === projectId, date);
    if (!evs.length) return null;
    const hours = evs.reduce((a, e) => a + e.minutes, 0) / 60;
    return (
      <CalendarRowHint
        events={evs}
        targets={targets}
        onAdd={async (key) => {
          const tg = targets.find((x) => x.key === key)!;
          await runAdd(tg.target, date, hours, evs.map((e) => e.id), tg.label);
        }}
      />
    );
  };
  const leadHint = (leadId: string, label: string, date: string) => {
    if (!calEvents.length) return null;
    const evs = hintEvents((e) => e.lead_id === leadId, date);
    if (!evs.length) return null;
    const hours = evs.reduce((a, e) => a + e.minutes, 0) / 60;
    return (
      <CalendarRowHint
        events={evs}
        targets={[{ key: "lead", label }]}
        onAdd={() => runAdd({ kind: "internal", category: PURSUIT_CATEGORY, opportunity_id: leadId }, date, hours, evs.map((e) => e.id), label)}
      />
    );
  };
  const calendarPicker = (ev: GridCalendarEvent, hours: number, done: () => void) => (
    <ProjectStageLeadPicker
      autoFocus
      projects={searchResults}
      leads={leads.filter((l) => l.is_open).map((l) => ({ id: l.id, name: l.name, client: l.company_name }))}
      categories={activeInternalCategories.map((c) => c.name).filter((n) => n !== PURSUIT_CATEGORY)}
      refDate={ev.date}
      searching={searching}
      emptyProjectsHint={t("projects:picker.typeToSearchProjects")}
      busy={upsert.isPending || ensureRow.isPending}
      onQueryChange={(q) => setSearchQuery(q)}
      onPickDirect={(p) => {
        const parent = retainerParentForProject(p.stages.map((s) => s.id));
        const row = parent ? retainerData?.rows.find((r) => r.id === parent) : null;
        if (!row) return false;
        setExtraRetainerIds((ids) => Array.from(new Set([...ids, row.id])));
        void runAdd({ kind: "retainer", row }, ev.date, hours, [ev.id], `${row.project.name} · ${row.name}`).then(done);
        return true;
      }}
      onPickLead={(l) => {
        setExtraLeadIds((ids) => Array.from(new Set([...ids, l.id])));
        void runAdd({ kind: "internal", category: PURSUIT_CATEGORY, opportunity_id: l.id }, ev.date, hours, [ev.id], l.name).then(done);
      }}
      onPickCategory={(c) => {
        void runAdd({ kind: "internal", category: c }, ev.date, hours, [ev.id], c).then(done);
      }}
      onPickStage={async (p, s) => {
        const rp = retainerData?.childToParent.get(s.id);
        const row = rp ? retainerData?.rows.find((r) => r.id === rp) : null;
        if (row) {
          setExtraRetainerIds((ids) => Array.from(new Set([...ids, row.id])));
          await runAdd({ kind: "retainer", row }, ev.date, hours, [ev.id], `${row.project.name} · ${row.name}`);
          return done();
        }
        if (!profile?.resource_id) return;
        try {
          const taskId = await ensureRow.mutateAsync({ resource_id: profile.resource_id, stage_id: s.id, stage_start: s.start_date, stage_end: s.end_date });
          setExtraTaskIds((ids) => Array.from(new Set([...ids, taskId])));
          await runAdd({ kind: "task", taskId }, ev.date, hours, [ev.id], `${p.name} · ${s.name}`);
          done();
        } catch (err) {
          toast.error((err as Error).message || "Failed to add stage");
        }
      }}
    />
  );

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
            {viewingOther && (
              <span className="rounded-full border border-amber-400/40 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                Read-only · viewing another collaborator
              </span>
            )}

            {!viewingOther && (
              <Button variant="outline" size="sm" onClick={() => setDictateOpen(true)}>
                <Mic className="mr-1.5 h-4 w-4" />
                {t("projects:timesheetAssistant.dictate")}
              </Button>
            )}
            {dictateOpen && (
              <TimesheetAssistantSheet open={dictateOpen} onOpenChange={setDictateOpen} weekStart={weekStart} />
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

        <MyWeekCard
          userId={effectiveUserId}
          collaboratorId={effectiveCollaboratorId}
          weekStart={weekStart}
          weekEnd={weekEnd}
          weekLabel={`${format(weekStartDate, "MMM d")} – ${format(addDays(weekStartDate, 6), "MMM d, yyyy")}`}
          totals={totalsFromEntries(entries)}
          viewingOther={viewingOther}
        />


        {noResource ? (
          <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            A tua conta ainda não está ligada a um membro da equipa. Pede a um admin para te
            adicionar com email correspondente.
          </div>
        ) : (
          <>
          <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">

            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2">
              {(
              <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={readOnly}>
                    <Plus className="h-3.5 w-3.5" />
                    {t("projects:pursuit.addRow")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(460px,calc(100vw-1rem))] p-0">
                  <ProjectStageLeadPicker
                    autoFocus
                    projects={projectsVisible ? searchResults : []}
                    leads={leads.filter((l) => l.is_open).map((l) => ({ id: l.id, name: l.name, client: l.company_name }))}
                    categories={activeInternalCategories.map((c) => c.name).filter((n) => n !== PURSUIT_CATEGORY)}
                    refDate={weekStart}
                    searching={searching}
                    emptyProjectsHint={t("projects:picker.typeToSearchProjects")}
                    busy={ensureRow.isPending || !profile?.resource_id}
                    onQueryChange={(q) => { setSearchQuery(q); setExpandedProject(null); }}
                    onPickDirect={(p) => {
                      const parent = retainerParentForProject(p.stages.map((s) => s.id));
                      if (!parent) return false;
                      setExtraRetainerIds((ids) => Array.from(new Set([...ids, parent])));
                      setSearchQuery("");
                      setAddPopoverOpen(false);
                      toast.success(p.name);
                      return true;
                    }}
                    onPickLead={(l) => {
                      setExtraLeadIds((ids) => Array.from(new Set([...ids, l.id])));
                      setSearchQuery("");
                      setAddPopoverOpen(false);
                      toast.success(t("projects:pursuit.added", { name: l.name }));
                    }}
                    onPickCategory={(c) => {
                      setSearchQuery("");
                      setAddPopoverOpen(false);
                      toast.success(t("projects:picker.internalInGrid", { name: c }));
                    }}
                    onPickStage={async (p, s) => {
                      if (!profile?.resource_id) return;
                      const rp = retainerData?.childToParent.get(s.id);
                      if (rp) {
                        setExtraRetainerIds((ids) => Array.from(new Set([...ids, rp])));
                        setSearchQuery("");
                        setAddPopoverOpen(false);
                        toast.success(p.name);
                        return;
                      }
                      try {
                        const taskId = await ensureRow.mutateAsync({
                          resource_id: profile.resource_id,
                          stage_id: s.id,
                          stage_start: s.start_date,
                          stage_end: s.end_date,
                        });
                        setExtraTaskIds((ids) => Array.from(new Set([...ids, taskId])));
                        setSearchQuery("");
                        setExpandedProject(null);
                        setAddPopoverOpen(false);
                        toast.success(`${p.name} · ${s.name}`);
                      } catch (err) {
                        toast.error((err as Error).message || "Failed to add stage");
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
              )}
              {layout.projectsHiddenByDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowProjectsOverride((v) => !v)}
                >
                  {projectsVisible ? "Hide project time" : "Show project time"}
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {projectsVisible
                  ? `${projectRows.length} ${projectRows.length === 1 ? "project row" : "project rows"} · `
                  : ""}
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
                  {calendarAllowed && gridCalendar && gridCalendar.status !== "not_connected" && (
                    <tr className="border-b border-border bg-primary/5">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                          {t("projects:tsCalendar.row")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {gridCalendar.status === "expired" ? t("projects:tsCalendar.expired") : t("projects:tsCalendar.rowSub")}
                        </div>
                      </td>
                      {days.map((d) => {
                        const ds = format(d, "yyyy-MM-dd");
                        return (
                          <td key={ds} className="px-1 py-1 text-center">
                            <CalendarDayBadge events={calByDay.get(ds) ?? []} onDismiss={dismissEvent} picker={calendarPicker} />
                          </td>
                        );
                      })}
                      <td />
                    </tr>
                  )}
                  {(() => {
                  const projectSection = !projectsVisible ? null : (
                  <>
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
                  {!isLoading && projectRows.length === 0 && retainerRows.length === 0 && (
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
                      pending={upsert.isPending}
                      readOnly={readOnly}
                      rowTotal={rowTotalFor(projectKey(r.task_id))}
                      renderHint={(dateStr) => projectHint(r.project.id, `t:${r.task_id}`, dateStr)}
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
                  {retainerRows.map((r) => (
                    <RetainerRow
                      key={`retainer-${r.id}`}
                      row={r}
                      days={days}
                      entries={entries.filter((e) => {
                        const c = retainerEntryChild(e);
                        return !!c && r.children.some((k) => k.id === c);
                      })}
                      pending={upsert.isPending || ensureRow.isPending}
                      readOnly={readOnly}
                      isExtra={extraRetainerIds.includes(r.id)}
                      onRemove={() => setExtraRetainerIds((ids) => ids.filter((x) => x !== r.id))}
                      renderHint={(dateStr) => projectHint(r.project.id, `r:${r.id}`, dateStr)}
                      onCommit={(dateStr, hours, notes, billable) => commitRetainerCell(r, dateStr, hours, notes, billable)}
                    />
                  ))}
                  </>
                  );
                  const internalSection = (
                  <>
                  {/* ====== INTERNAL ====== */}
                  <SectionHeaderRow
                    icon={<Coffee className="h-3.5 w-3.5" />}
                    label="Internal cost centers"
                    sub="Non-billable working time (capacity used, no revenue)."
                  />
                  {pursuitRows.map((lead) => (
                    <FixedRow
                      key={`pursuit-${lead.id}`}
                      label={`${t("projects:pursuit.categoryLabel")} · ${lead.name}`}
                      sub={
                        lead.is_open
                          ? [lead.stage ? t(`projects:pursuit.stage.${lead.stage}`, { defaultValue: lead.stage }) : null, lead.company_name]
                              .filter(Boolean)
                              .join(" · ") || t("projects:pursuit.rowSub")
                          : t("projects:pursuit.closedSub")
                      }
                      tone="internal"
                      days={days}
                      entryMap={entryMap}
                      keyFn={() => pursuitKey(lead.id)}
                      pending={upsert.isPending}
                      readOnly={readOnly || !lead.is_open}
                      rowTotal={rowTotalFor(pursuitKey(lead.id))}
                      renderHint={lead.is_open ? (dateStr) => leadHint(lead.id, `${t("projects:pursuit.categoryLabel")} · ${lead.name}`, dateStr) : undefined}
                      onCommit={(dateStr, hours, notes, _billable, existingId) =>
                        upsert.mutate(
                          {
                            entry_type: "internal",
                            internal_category: PURSUIT_CATEGORY,
                            opportunity_id: lead.id,
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
                      pending={upsert.isPending}
                      readOnly={readOnly}
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
                  </>
                  );
                  return layout.internalFirst ? (
                    <>{internalSection}{projectSection}</>
                  ) : (
                    <>{projectSection}{internalSection}</>
                  );
                  })()}
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
                      pending={upsert.isPending}
                      readOnly={readOnly}
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
          </>
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
  readOnly,
  rowTotal,
  onCommit,
  renderHint,
}: {
  renderHint?: (dateStr: string) => React.ReactNode;
  row: TimesheetTaskRow;
  days: Date[];
  entryMap: Map<CellKey, Map<string, CellInfo>>;
  isExtra: boolean;
  onRemove: () => void;
  pending: boolean;
  readOnly?: boolean;
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
              readOnly={readOnly}
              onCommit={(hours, notes, billable) =>
                onCommit(dateStr, hours, notes, billable, cell?.id ?? null)
              }
            />
            {renderHint?.(dateStr)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-mono text-sm">{formatHM(rowTotal) || "—"}</td>
    </tr>
  );
}

function RetainerRow({
  row,
  days,
  entries,
  pending,
  readOnly,
  isExtra,
  onRemove,
  renderHint,
  onCommit,
}: {
  row: RetainerParentRow;
  days: Date[];
  entries: TimesheetEntry[];
  pending: boolean;
  readOnly?: boolean;
  isExtra: boolean;
  onRemove: () => void;
  renderHint?: (dateStr: string) => React.ReactNode;
  onCommit: (dateStr: string, hours: number, notes: string | null, billable: boolean) => void;
}) {
  const { t } = useTranslation("projects");
  const locale = useDateLocale();
  const label = `${row.project.name} · ${row.name}`;
  const total = entries.reduce((a, e) => a + e.hours, 0);
  return (
    <tr className="border-b border-border last:border-0">
      <td className="sticky left-0 z-10 bg-card px-4 py-2">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: row.project.color }} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{label}</div>
            <div className="truncate text-[11px] text-muted-foreground">{t("tsCalendar.retainerSub")}</div>
          </div>
          {isExtra && (
            <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={onRemove} aria-label="Remove row">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
      {days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const month = dateStr.slice(0, 7);
        const hasMonth = row.children.some((c) => c.month === month);
        const dayEntries = entries.filter((e) => e.entry_date === dateStr);
        const value = dayEntries.reduce((a, e) => a + e.hours, 0);
        const first = dayEntries[0];
        return (
          <td key={dateStr} className="px-1 py-1 text-center">
            {hasMonth ? (
              <HourCell
                date={d}
                title={label}
                subtitle={format(d, "MMM yyyy", { locale })}
                entryType="project"
                value={value}
                notes={first?.notes ?? ""}
                billable={first?.billable ?? true}
                suggested={0}
                disabled={pending}
                readOnly={readOnly}
                onCommit={(hours, notes, billable) => onCommit(dateStr, hours, notes, billable)}
              />
            ) : (
              <div className="mx-auto w-20 text-[10px] leading-tight text-muted-foreground">
                {t("tsCalendar.noRetainerMonth", { month: format(d, "MMM yyyy", { locale }) })}
              </div>
            )}
            {hasMonth && renderHint?.(dateStr)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-mono text-sm">{formatHM(total) || "—"}</td>
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
  readOnly,
  rowTotal,
  onCommit,
  renderHint,
}: {
  renderHint?: (dateStr: string) => React.ReactNode;
  label: string;
  sub: string;
  tone: "internal" | "nonworking";
  days: Date[];
  entryMap: Map<CellKey, Map<string, CellInfo>>;
  keyFn: () => CellKey;
  pending: boolean;
  readOnly?: boolean;
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
              readOnly={readOnly}
              onCommit={(hours, notes) =>
                onCommit(dateStr, hours, notes, false, cell?.id ?? null)
              }
            />
            {renderHint?.(dateStr)}
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
  readOnly,
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
  readOnly?: boolean;
  onCommit: (hours: number, notes: string | null, billable: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftHours, setDraftHours] = useState<string>(formatHM(value));
  const [draftNotes, setDraftNotes] = useState<string>(notes);
  const [draftBillable, setDraftBillable] = useState<boolean>(billable);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t: tNwd } = useTranslation(["projects"]);
  const nwdLocale = useDateLocale();
  const isoDay = format(date, "yyyy-MM-dd");
  const wkStart = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const wkEnd = format(addDays(startOfWeek(date, { weekStartsOn: 1 }), 6), "yyyy-MM-dd");
  const nwdMap = useNonWorkingDays(wkStart, wkEnd).data;
  const nwdInfo = entryType !== "non_working" ? nwdMap?.get(isoDay) ?? null : null;

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
          title={notes && value > 0 ? notes : undefined}
          className={`relative h-9 w-20 rounded border text-center font-mono text-sm transition ${cellCls}`}
        >
          {display || <span className="text-muted-foreground/60">{placeholder}</span>}
          {notes && value > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
          {nwdInfo && value > 0 && (
            <span
              aria-label={tNwd(`projects:nonWorkingDay.badge.${nwdInfo.reason}`)}
              className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-warning"
            />
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
          {nwdInfo && (
            <div className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px]">
              <span className="mr-1 font-medium text-warning">{tNwd(`projects:nonWorkingDay.badge.${nwdInfo.reason}`)}</span>
              {nonWorkingLine(tNwd, isoDay, nwdInfo, nwdLocale)}
            </div>
          )}
        </div>
        {readOnly ? (
          <div className="space-y-3 px-4 py-3">
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Time</div>
              <div className="font-mono text-sm">{display || "0h00"}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Description</div>
              <p className="whitespace-pre-wrap text-sm">
                {notes || <span className="text-muted-foreground">No description</span>}
              </p>
            </div>
            {entryType === "project" && (
              <div className="rounded border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                {billable ? "Billable" : "Non-billable"}
              </div>
            )}
          </div>
        ) : (
        <>
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
        </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ----------------------------- Collaborator picker -----------------------------

type CollabPickerRow = { id: string; nome: string; email: string | null };

function CollaboratorViewPicker({
  selectedCollaboratorId,
  selfCollaboratorId,
  onChange,
}: {
  selectedCollaboratorId: string | null;
  selfCollaboratorId: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: collaborators = [] } = useQuery({
    queryKey: ["timesheet-collaborator-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, nome, email")
        .is("archived_at", null)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CollabPickerRow[];
    },
  });

  const selected = collaborators.find((c) => c.id === selectedCollaboratorId) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-3.5 w-3.5" />
          <span className="max-w-[180px] truncate">
            {selected ? selected.nome : "Selecionar colaborador…"}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Procurar colaborador…" />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup heading="Ver timesheet de…">
              {collaborators.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.nome} ${c.email ?? ""}`}
                  onSelect={() => {
                    onChange(c.id === selfCollaboratorId ? null : c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${
                      selectedCollaboratorId === c.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">
                      {c.nome}
                      {c.id === selfCollaboratorId && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(eu)</span>
                      )}
                    </span>
                    {c.email && (
                      <span className="text-[11px] text-muted-foreground">{c.email}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

