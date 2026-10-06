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
import { getMyStageLoadEstimates } from "@/lib/projects/stage-load.functions";
import { CalendarNoteConfirm, type CalendarConfirmItem } from "@/components/projects/calendar-note-confirm";
import { getCalendarGridSuggestions, rememberCalendarMatch, type GridCalendarEvent } from "@/lib/projects/calendar.functions";
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
  useStageAllocationBalance,
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
import { HourCell } from "@/components/projects/timesheet-activity-cell";
import {
  isWeekLocked,
  totalsFromEntries,
  isUnpaidLeave,
  UNPAID_LEAVE_LABEL,
  UNPAID_LEAVE_LABELS,
  useTimesheetWeek,
} from "@/lib/projects/use-timesheet-weeks";


export const Route = createFileRoute("/_app/projects/timesheet")({
  // ?week=YYYY-MM-DD opens that week (used by notification links).
  validateSearch: (s: Record<string, unknown>): { week?: string } =>
    typeof s.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.week) ? { week: s.week } : {},
  component: TimesheetPage,
});

// Composite key for the entry map: <type>::<row identifier>
type CellKey = string;
const projectKey = (taskId: string): CellKey => `project::${taskId}`;
const internalKey = (cat: string): CellKey => `internal::${cat}`;
const nonWorkingKey = (lt: string): CellKey => `non_working::${lt}`;
const pursuitKey = (oppId: string): CellKey => `pursuit::${oppId}`;

type CellInfo = {
  /** First activity's id (legacy single-entry callers). */
  id: string;
  /** Total hours of every activity in the cell. */
  hours: number;
  notes: string | null;
  billable: boolean;
  activities: TimesheetEntry[];
};

function TimesheetPage() {
  const { profile: selfProfile, user } = useProjectsAuth();
  const { isRealAdmin, viewAsUser } = useAuth();
  const { week: weekParam } = Route.useSearch();
  const [weekAnchor, setWeekAnchor] = useState<Date>(() =>
    weekParam ? new Date(`${weekParam}T12:00:00`) : new Date(),
  );
  useEffect(() => {
    if (weekParam) setWeekAnchor(new Date(`${weekParam}T12:00:00`));
  }, [weekParam]);
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
    // Non-active stages only show in weeks where they already have hours (read-only).
    () =>
      allProjectRows.filter(
        (r) =>
          !retainerData?.childToParent.has(r.stage.id) &&
          (isStageActive(r) || r.has_week_entries),
      ),
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
      const cells = m.get(key)!;
      const cur = cells.get(e.entry_date);
      // Several activities per cell: keep each entry, total the hours.
      if (cur) {
        cur.hours += e.hours;
        cur.activities.push(e);
      } else
        cells.set(e.entry_date, { id: e.id, hours: e.hours, notes: e.notes, billable: e.billable, activities: [e] });
    }
    return m;
  }, [entries]);

  const dayTotals = useMemo(() => {
    const t = new Map<string, number>();
    for (const e of entries) {
      if (isUnpaidLeave(e)) continue; // unpaid leave is time owed, never accounted
      t.set(e.entry_date, (t.get(e.entry_date) ?? 0) + e.hours);
    }
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
      else if (e.entry_type === "non_working" && !isUnpaidLeave(e)) nonWorking += e.hours;
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

  // Non-working rows shown in the grid: every approved leave/holiday row PLUS
  // any non_working entry this week with no matching approved source, so the
  // totals never include hours the grid does not show.
  const nonWorkingRows = useMemo(() => {
    const rows = nonWorkingPrefill.map((r) => ({ ...r, orphanDates: [] as string[] }));
    const byType = new Map(rows.map((r) => [r.leave_type, r]));
    for (const e of entries) {
      if (e.entry_type !== "non_working" || !e.leave_type) continue;
      let row = byType.get(e.leave_type);
      if (!row) {
        row = { key: e.leave_type, leave_type: e.leave_type, autoHoursByDate: new Map(), orphanDates: [] };
        byType.set(e.leave_type, row);
        rows.push(row);
      }
      if (!row.autoHoursByDate.has(e.entry_date) && !row.orphanDates.includes(e.entry_date))
        row.orphanDates.push(e.entry_date);
    }
    for (const r of rows) r.orphanDates.sort();
    return rows;
  }, [nonWorkingPrefill, entries]);
  const [calExpanded, setCalExpanded] = useState(false);
  const { data: stageBalance } = useStageAllocationBalance({
    resourceId: profile?.resource_id ?? null,
    userId: effectiveUserId ?? null,
    stageIds: projectRows.map((r) => r.stage.id),
  });
  // Estimated allocation for own assignments without hours (same rule as the Capacity forecast).
  const fetchStageEstimates = useServerFn(getMyStageLoadEstimates);
  const estStageIds = [...new Set(projectRows.map((r) => r.stage.id))].sort();
  const { data: stageEstimates } = useQuery({
    queryKey: ["pm-timesheet-stage-estimates", user?.id ?? null, estStageIds.join(",")],
    enabled: !viewingOther && !viewAsUser && !!user?.id && estStageIds.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => new Map((await fetchStageEstimates({ data: { stageIds: estStageIds } })).map((e) => [e.stage_id, e.estimated])),
  });
  const balanceFor = (stageId: string) => {
    const b = stageBalance?.get(stageId);
    if (b && b.allocated > 0) return { ...b, estimated: false };
    const est = stageEstimates?.get(stageId);
    if (est != null && est > 0) return { allocated: est, logged: b?.logged ?? 0, estimated: true };
    return b ? { ...b, estimated: false } : undefined;
  };
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
    existingId: string | null,
  ) => {
    const child = childForDate(r, date);
    if (!child) return;
    const existing = entries.filter((e) => e.entry_date === date && retainerEntryChild(e) === child.id);
    const current = existingId ? existing.find((e) => e.id === existingId) ?? null : null;
    if (!current && hours <= 0) return;
    try {
      const taskId = current?.task_id ?? existing.find((e) => e.task_id)?.task_id ?? (await ensureRetainerTask(child));
      await upsert.mutateAsync({
        entry_type: "project",
        task_id: taskId,
        user_id: effectiveUserId!,
        entry_date: date,
        hours: Math.max(0, hours),
        notes,
        billable,
        existing_entry_id: current?.id ?? null,
      });
    } catch (e) {
      toast.error((e as Error).message || "Failed to save");
    }
  };

  // ---------------- Calendar suggestions (own timesheet only) ----------------
  const calendarAllowed = !viewingOther && !viewAsUser && !weekLocked && !!user?.id;
  const fetchGridCalendar = useServerFn(getCalendarGridSuggestions);
  const rememberMatch = useServerFn(rememberCalendarMatch);
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

  /** Each registered calendar event becomes its own activity in the cell, carrying its event id. */
  const addToCell = async (target: AddTarget, date: string, hours: number, eventIds: string[], note: string | null) => {
    const uid = user!.id;
    let taskId: string | null = null;
    if (target.kind === "task") taskId = target.taskId;
    else if (target.kind === "retainer") {
      const child = childForDate(target.row, date);
      if (!child) throw new Error(t("projects:tsCalendar.noRetainerMonth", { month: format(new Date(date + "T00:00:00"), "MMM yyyy", { locale: dateLocale }) }));
      const existing = entries.find((e) => e.entry_date === date && retainerEntryChild(e) === child.id && e.task_id);
      taskId = existing?.task_id ?? (await ensureRetainerTask(child));
    }
    await upsert.mutateAsync({
      entry_type: target.kind === "internal" ? "internal" : "project",
      task_id: target.kind === "internal" ? null : taskId,
      internal_category: target.kind === "internal" ? target.category : null,
      opportunity_id: target.kind === "internal" ? (target.opportunity_id ?? null) : null,
      user_id: uid,
      entry_date: date,
      hours,
      notes: note,
      billable: true,
      existing_entry_id: null,
      source: "calendar",
      calendar_event_ids: eventIds,
    });
    qc.invalidateQueries({ queryKey: ["timesheet-calendar-grid"] });
    qc.invalidateQueries({ queryKey: ["pm-timesheet-entries"] });
  };
  const saveCalendar = async (target: AddTarget, date: string, evs: GridCalendarEvent[], label: string, notes: Record<string, string>) => {
    try {
      let total = 0;
      for (const ev of evs) {
        const hours = ev.minutes / 60;
        await addToCell(target, date, hours, [ev.id], (notes[ev.id] ?? "").trim() || null);
        total += hours;
      }
      toast.success(t("projects:tsCalendar.added", { hours: formatHM(total), name: label }));
    } catch (e) {
      toast.error((e as Error).message || "Failed to save");
    }
  };
  /** Every calendar → activity path goes through this confirm; nothing is saved without it. */
  const [calConfirm, setCalConfirm] = useState<{
    target: AddTarget; date: string; evs: GridCalendarEvent[]; label: string; resolve: () => void;
    items: CalendarConfirmItem[];
  } | null>(null);
  const runAdd = (target: AddTarget, date: string, evs: GridCalendarEvent[], label: string) =>
    new Promise<void>((resolve) => {
      const items = evs.map((ev) => {
        const s = ev.start?.slice(11, 16), e = ev.end?.slice(11, 16);
        const time = s && e ? `${s}–${e}` : "";
        return { id: ev.id, hours: ev.minutes / 60, suggested: [time, ev.title].filter(Boolean).join(" · ") };
      });
      setCalConfirm({ target, date, evs, label, resolve, items });
    });
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
    for (const r of projectRows.filter(isStageActive))
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
          for (const e of evs) learn(e, { project_id: projectId });
          await runAdd(tg.target, date, evs, tg.label);
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
        onAdd={() => { for (const e of evs) learn(e, { opportunity_id: leadId, internal_category: PURSUIT_CATEGORY }); return runAdd({ kind: "internal", category: PURSUIT_CATEGORY, opportunity_id: leadId }, date, evs, label); }}
      />
    );
  };
  /** Remember the person's choice for this event's series / single matched word (own rows only). */
  const learn = (ev: GridCalendarEvent, target: { project_id?: string | null; stage_id?: string | null; opportunity_id?: string | null; internal_category?: string | null }) => {
    if (!ev.series_id && !ev.match_word) return;
    void rememberMatch({
      data: {
        series_id: ev.series_id,
        word: ev.match_word,
        project_id: target.project_id ?? null,
        stage_id: target.stage_id ?? null,
        opportunity_id: target.opportunity_id ?? null,
        internal_category: target.internal_category ?? null,
      },
    }).catch(() => undefined);
  };
  const calendarPicker = (ev: GridCalendarEvent, hours: number, done: () => void) => (
    <ProjectStageLeadPicker
      autoFocus
      suggestions={ev.suggestions.map((sg) => ({
        key: sg.key,
        label: sg.label,
        reason: sg.reason,
        preselect: sg.preselect,
        project: sg.project_id ? { id: sg.project_id, name: sg.project_name ?? "", client: null, stages: sg.project_stages } : undefined,
        stage: sg.stage,
        lead: sg.lead_id ? { id: sg.lead_id, name: sg.lead_name ?? "", client: null } : undefined,
        category: sg.internal_category ?? undefined,
      }))}
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
        learn(ev, { project_id: p.id });
        void runAdd({ kind: "retainer", row }, ev.date, [ev], `${row.project.name} · ${row.name}`).then(done);
        return true;
      }}
      onPickLead={(l) => {
        setExtraLeadIds((ids) => Array.from(new Set([...ids, l.id])));
        learn(ev, { opportunity_id: l.id, internal_category: PURSUIT_CATEGORY });
        void runAdd({ kind: "internal", category: PURSUIT_CATEGORY, opportunity_id: l.id }, ev.date, [ev], l.name).then(done);
      }}
      onPickCategory={(c) => {
        learn(ev, { internal_category: c });
        void runAdd({ kind: "internal", category: c }, ev.date, [ev], c).then(done);
      }}
      onPickStage={async (p, s) => {
        const rp = retainerData?.childToParent.get(s.id);
        const row = rp ? retainerData?.rows.find((r) => r.id === rp) : null;
        learn(ev, { project_id: p.id, stage_id: s.id });
        if (row) {
          setExtraRetainerIds((ids) => Array.from(new Set([...ids, row.id])));
          await runAdd({ kind: "retainer", row }, ev.date, [ev], `${row.project.name} · ${row.name}`);
          return done();
        }
        if (!profile?.resource_id) return;
        try {
          const taskId = await ensureRow.mutateAsync({ resource_id: profile.resource_id, stage_id: s.id, stage_start: s.start_date, stage_end: s.end_date });
          setExtraTaskIds((ids) => Array.from(new Set([...ids, taskId])));
          await runAdd({ kind: "task", taskId }, ev.date, [ev], `${p.name} · ${s.name}`);
          done();
        } catch (err) {
          toast.error((err as Error).message || "Failed to add stage");
        }
      }}
    />
  );

  const headerControls = (
    <>
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

            <div className="flex items-center gap-1 rounded-md border border-border bg-card px-1 py-0.5">
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
    </>
  );

  return (
    <AppShell active="timesheet">
      <CalendarNoteConfirm
        open={!!calConfirm}
        label={calConfirm?.label ?? ""}
        items={calConfirm?.items ?? []}
        busy={upsert.isPending}
        onCancel={() => { calConfirm?.resolve(); setCalConfirm(null); }}
        onConfirm={async (notes) => {
          const c = calConfirm;
          if (!c) return;
          await saveCalendar(c.target, c.date, c.evs, c.label, notes);
          c.resolve();
          setCalConfirm(null);
        }}
      />
      <div className="w-full px-4 py-4 sm:px-6">
        <MyWeekCard
          userId={effectiveUserId}
          collaboratorId={effectiveCollaboratorId}
          weekStart={weekStart}
          weekEnd={weekEnd}
          weekLabel={`${format(weekStartDate, "MMM d")} – ${format(addDays(weekStartDate, 6), "MMM d, yyyy")}`}
          totals={totalsFromEntries(entries)}
          viewingOther={viewingOther}
          controls={headerControls}
          billable={buckets.billable}
        />

        {noResource ? (
          <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            A tua conta ainda não está ligada a um membro da equipa. Pede a um admin para te
            adicionar com email correspondente.
          </div>
        ) : (
          <>
          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">

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

            <div className="max-h-[calc(100vh-11rem)] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
                  <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-muted px-4 py-2 text-left font-medium">
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
                  {calendarAllowed && gridCalendar && gridCalendar.status !== "not_connected" && (() => {
                    const allEmpty =
                      gridCalendar.status !== "expired" &&
                      days.every((d) => !(calByDay.get(format(d, "yyyy-MM-dd")) ?? []).length);
                    if (allEmpty && !calExpanded)
                      return (
                        <tr className="border-b border-border bg-primary/5">
                          <td colSpan={9} className="sticky left-0 px-4 py-1">
                            <button
                              type="button"
                              onClick={() => setCalExpanded(true)}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <CalendarDays className="h-3.5 w-3.5 text-primary" />
                              {t("projects:timesheetWeek.calendarAllLogged")}
                            </button>
                          </td>
                        </tr>
                      );
                    return (
                    <tr className="border-b border-border bg-primary/5">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2">
                        <button type="button" onClick={() => allEmpty && setCalExpanded(false)} className="flex items-center gap-2 text-sm font-medium">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                          {t("projects:tsCalendar.row")}
                        </button>
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
                    );
                  })()}
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
                      readOnly={readOnly || !isStageActive(r)}
                      rowTotal={rowTotalFor(projectKey(r.task_id))}
                      balance={balanceFor(r.stage.id)}
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
                      onCommit={(dateStr, hours, notes, billable, id) => commitRetainerCell(r, dateStr, hours, notes, billable, id)}
                    />
                  ))}
                  </>
                  );
                  const internalSection = (
                  <>
                  {/* ====== INTERNAL ====== */}
                  <SectionHeaderRow
                    tone="internal"
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
                    tone="nonworking"
                    icon={<Plane className="h-3.5 w-3.5" />}
                    label="Non-working time"
                    sub="Auto-filled from approved leave + public holidays. Reduces capacity."
                  />
                  {nonWorkingRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-4 text-center text-xs text-muted-foreground">
                        No approved leave or holidays this week.
                      </td>
                    </tr>
                  )}
                  {nonWorkingRows.map((row) => (
                    <FixedRow
                      key={row.key}
                      label={
                        UNPAID_LEAVE_LABELS.has(row.leave_type ?? "")
                          ? `${row.leave_type} · ${t("projects:hoursBank.unpaidTag")}`
                          : row.leave_type
                      }
                      sub={
                        row.orphanDates.length > 0
                          ? `⚠ ${t("projects:timesheetWeek.noApprovedRequest")} · ${row.orphanDates
                              .map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)
                              .join(", ")}`
                          : "Non-working · capacity reducer"
                      }
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
                <tfoot className="sticky bottom-0 z-20 bg-card shadow-[0_-1px_0_var(--border)]">
                  <tr className="border-t-2 border-border bg-muted/60 text-sm">
                    <td className="sticky left-0 bg-muted px-4 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground">
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
  tone = "project",
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone?: "project" | "internal" | "nonworking";
}) {
  const bg =
    tone === "internal" ? "bg-ts-internal-head" : tone === "nonworking" ? "bg-ts-nonworking-head" : "bg-ts-project-head";
  return (
    <tr className={`border-b border-border ${bg}`}>
      <td
        colSpan={9}
        className={`sticky left-0 z-10 px-4 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground ${bg}`}
      >
        <div className="flex items-center gap-2 text-foreground">
          {icon}
          <span className="font-bold">{label}</span>
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">
            {sub}
          </span>
        </div>
      </td>
    </tr>
  );
}

/** Missing status (older rows) is treated as active so nothing disappears by accident. */
/** Public holidays in the visible week — used to hatch the whole day column. Display only. */
function useHolidayCols(days: Date[]) {
  const from = days.length ? format(days[0], "yyyy-MM-dd") : null;
  const to = days.length ? format(days[days.length - 1], "yyyy-MM-dd") : null;
  const map = useNonWorkingDays(from, to).data;
  return (ds: string) => (map?.get(ds)?.reason === "holiday" ? "ts-hatch" : "");
}

function isStageActive(r: TimesheetTaskRow): boolean {
  return !r.stage.status || r.stage.status === "active";
}

function StageClosedNote({ status }: { status?: string | null }) {
  const { t } = useTranslation("projects");
  return <>{t(`stageGate.note.${status === "done" ? "done" : status === "paused" ? "paused" : "planned"}`)}</>;
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
  balance,
}: {
  renderHint?: (dateStr: string) => React.ReactNode;
  balance?: { allocated: number; logged: number; estimated?: boolean };
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
  const holCls = useHolidayCols(days);
  const { t: tBal } = useTranslation("projects");
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
            {!isStageActive(row) && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                <StageClosedNote status={row.stage.status} />
              </div>
            )}
            {balance && balance.allocated > 0 && (
              <div className={`mt-0.5 text-[10px] ${balance.logged > balance.allocated ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {tBal(balance.estimated ? "tsActivities.balanceEstimated" : "tsActivities.balance", {
                  allocated: formatHM(balance.allocated),
                  logged: formatHM(balance.logged) || "0h00",
                  left: formatHM(Math.max(0, balance.allocated - balance.logged)) || "0h00",
                })}
              </div>
            )}
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
          <td key={dateStr} className={`px-1 py-1 text-center ${holCls(dateStr)}`}>
            <HourCell
              date={d}
              title={row.project.name}
              subtitle={row.stage.name}
              entryType="project"
              activities={cell?.activities ?? []}
              suggested={suggested}
              disabled={pending}
              readOnly={readOnly}
              onCommit={(hours, notes, billable, id) => onCommit(dateStr, hours, notes, billable, id)}
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
  onCommit: (dateStr: string, hours: number, notes: string | null, billable: boolean, id: string | null) => void;
}) {
  const holCls = useHolidayCols(days);
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
        return (
          <td key={dateStr} className={`px-1 py-1 text-center ${holCls(dateStr)}`}>
            {hasMonth ? (
              <HourCell
                date={d}
                title={label}
                subtitle={format(d, "MMM yyyy", { locale })}
                entryType="project"
                activities={dayEntries}
                suggested={0}
                disabled={pending}
                readOnly={readOnly}
                onCommit={(hours, notes, billable, id) => onCommit(dateStr, hours, notes, billable, id)}
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
  const holCls = useHolidayCols(days);
  const dotCls = tone === "internal" ? "bg-muted-foreground" : "bg-accent-foreground/60";
  const bg = tone === "internal" ? "bg-ts-internal" : "bg-ts-nonworking";
  return (
    <tr className={`border-b border-border last:border-0 ${bg}`}>
      <td className={`sticky left-0 z-10 px-4 py-2 ${bg}`}>
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
          <td key={dateStr} className={`px-1 py-1 text-center ${tone === "nonworking" ? "ts-hatch" : holCls(dateStr)}`}>
            <HourCell
              date={d}
              title={label}
              subtitle={sub}
              entryType={tone === "internal" ? "internal" : "non_working"}
              activities={cell?.activities ?? []}
              singleActivity={tone === "nonworking"}
              suggested={isWeekend ? 0 : tone === "nonworking" ? 8 : 0}
              disabled={pending}
              readOnly={readOnly}
              onCommit={(hours, notes, _b, id) => onCommit(dateStr, hours, notes, false, id)}
            />
            {renderHint?.(dateStr)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-mono text-sm">{formatHM(rowTotal) || "—"}</td>
    </tr>
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

