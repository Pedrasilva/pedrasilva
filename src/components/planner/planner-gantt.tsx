/**
 * PlannerGantt — unified planner wrapper around the shared GanttChart.
 *
 * Currently wired in quote mode (fetches quote_stages / quote_allocations /
 * quote_stage_dependencies + active pm_resources, maps rows to the
 * StageWithProject / AllocationWithResource shape GanttChart expects, and
 * builds a quote-mode PlannerAdapter via QUOTE_FEATURES).
 *
 * The quote-side export name `QuoteGantt` is preserved so existing call
 * sites keep working. Project mode will plug into this same component once
 * the project-mode inspector is in place; see .lovable/plan.md.
 *
 * Note: resource.hourly_rate is set to the allocation's sale_rate_snapshot,
 * and resource.cost_rate to cost_rate_snapshot, so the Gantt cost overlays
 * read the historical quote rates rather than today's effective rates.
 */
import { useMemo, useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { PanelRightClose, PanelRightOpen, Plus, Minus, IndentIncrease, IndentDecrease, AlignVerticalJustifyStart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, parseISO, format } from "date-fns";
import { GanttChart, type StageWithProject, type PaymentMilestone, type GanttHierarchyNode } from "@/components/projects/gantt-chart";
import { useTeamPricingAverages } from "@/lib/quotes/use-team-pricing-averages";
import { ResourcePool } from "@/components/projects/resource-pool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuotePlannerInspector } from "@/components/quotes/quote-planner-inspector";
import { ProjectPlannerInspector } from "@/components/projects/project-planner-inspector";
import { useQuoteStages, useUpsertQuoteStage, useDeleteQuoteStage } from "@/lib/quotes/use-quote-stages";
import { useQuoteAllocations } from "@/lib/quotes/use-quote-allocations";
import { useQuotePlannerAdapter } from "@/lib/quotes/use-quote-planner-adapter";
import { useQuotePlanningPool } from "@/lib/quotes/use-quote-planning-pool";
import { useQuotePaymentSchedule } from "@/lib/quotes/use-quote-payment-schedule";
import { reflowQuoteSchedule } from "@/lib/quotes/reflow-schedule";
import { useCreateQuoteDependency } from "@/lib/quotes/use-quote-dependencies";
import {
  useProjectDetail,
  useResources as useProjectResources,
  useCreateStage as useCreateProjectStage,
  useUpdateStage as useUpdateProjectStage,
  useDeleteStage as useDeleteProjectStage,
  useCreateDependency as useCreateProjectDependency,
} from "@/lib/projects/use-planner";
import { useProjectPlannerAdapter } from "@/lib/projects/use-project-planner-adapter";
import { useProjectInvoices } from "@/lib/projects/use-invoices";
import { buildProjectGanttTree, PROJECT_SUMMARY_ID as PROJECT_MODE_SUMMARY_ID } from "@/lib/projects/build-project-gantt-tree";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Resource, AllocationWithResource, StageWithAllocations } from "@/lib/projects/types";
import { toast } from "sonner";

const PROJECT_SUMMARY_ID = "__quote_project__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function shiftIso(iso: string, days: number): string {
  return addDays(parseISO(iso), days).toISOString().slice(0, 10);
}

interface Props {
  quoteId: string;
  dayWidth?: number;
  onAddRetainerPhase?: () => void;
}

type ZoomMode = "week" | "month" | "quarter" | "year" | "fit";

// Day widths per zoom level. Header granularity adapts to dayWidth
// (see GanttChart) so labels remain legible at every level.
const ZOOM_DAY_WIDTHS: Record<Exclude<ZoomMode, "fit">, number> = {
  week: 32,
  month: 10,
  quarter: 4,
  year: 1.5,
};

// Ordered from most compressed (fit) to most zoomed in (week). Used by the
// +/- buttons to step through zoom levels.
const ZOOM_ORDER: ZoomMode[] = ["fit", "year", "quarter", "month", "week"];
function stepZoom(current: ZoomMode, delta: 1 | -1): ZoomMode {
  const i = ZOOM_ORDER.indexOf(current);
  const next = Math.max(0, Math.min(ZOOM_ORDER.length - 1, (i < 0 ? 0 : i) + delta));
  return ZOOM_ORDER[next];
}

export function QuoteGantt({ quoteId, dayWidth: dayWidthProp, onAddRetainerPhase }: Props) {
  const { t } = useTranslation("crm");
  const stagesQ = useQuoteStages(quoteId);
  const allocQ = useQuoteAllocations(quoteId);

  // allResources: full active roster (needed so historical allocations
  // referencing archived/excluded users still render on the Gantt).
  // poolResources: filtered selectable Team Pool (drag source).
  // rateMissing: resources whose effective €/h could not be resolved.
  const { allResources, poolResources, rateMissing } = useQuotePlanningPool();
  const resources = allResources;

  const adapter = useQuotePlannerAdapter(quoteId, resources);
  const { data: teamAvg } = useTeamPricingAverages();
  const impliedHourRate = teamAvg?.avgSalePerHour ?? 0;
  const upsertStage = useUpsertQuoteStage(quoteId);
  const qc = useQueryClient();
  const [reflowing, setReflowing] = useState(false);

  const handleReflow = useCallback(async () => {
    setReflowing(true);
    try {
      const res = await reflowQuoteSchedule(quoteId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] }),
        qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] }),
        qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] }),
        qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] }),
      ]);
      if (res.updatedStageCount === 0) {
        toast.success(
          t("workspace.planning.reflow.alreadyAligned", {
            defaultValue: "Schedule already satisfies all dependencies.",
          }),
        );
      } else {
        toast.success(
          t("workspace.planning.reflow.done", {
            count: res.updatedStageCount,
            defaultValue: "Reflowed {{count}} stage(s) to honour dependencies.",
          }),
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReflowing(false);
    }
  }, [quoteId, qc, t]);

  const stages = stagesQ.data ?? [];
  const allocations = allocQ.data ?? [];

  // Derived project start = earliest start across non-retainer stages.
  const projectStartIso = useMemo(() => {
    const regular = stages.filter(
      (s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly",
    );
    if (regular.length === 0) return "";
    return regular.reduce(
      (min, s) => (s.start_date < min ? s.start_date : min),
      regular[0].start_date,
    );
  }, [stages]);

  const [shifting, setShifting] = useState(false);
  const handleShiftProjectStart = useCallback(
    async (newStartIso: string) => {
      if (!newStartIso || !projectStartIso || newStartIso === projectStartIso) return;
      const delta = differenceInCalendarDays(parseISO(newStartIso), parseISO(projectStartIso));
      if (delta === 0) return;
      setShifting(true);
      try {
        const regular = stages.filter(
          (s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly",
        );
        // Batch via raw upsert to avoid N mutation hook calls.
        const stageRows = regular.map((s) => ({
          id: s.id,
          start_date: shiftIso(s.start_date, delta),
          end_date: shiftIso(s.end_date, delta),
        }));
        const allocRows = allocations.map((a) => ({
          id: a.id,
          start_date: shiftIso(a.start_date, delta),
          end_date: shiftIso(a.end_date, delta),
        }));
        await Promise.all([
          ...stageRows.map((r) =>
            db.from("quote_stages").update({ start_date: r.start_date, end_date: r.end_date }).eq("id", r.id),
          ),
          ...allocRows.map((r) =>
            db.from("quote_allocations").update({ start_date: r.start_date, end_date: r.end_date }).eq("id", r.id),
          ),
        ]);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["quote-stages", quoteId] }),
          qc.invalidateQueries({ queryKey: ["quote-allocations", quoteId] }),
          qc.invalidateQueries({ queryKey: ["quote-payment-schedule", quoteId] }),
          qc.invalidateQueries({ queryKey: ["quote-financials", quoteId] }),
        ]);
        toast.success(
          t("workspace.planning.projectStartShifted", {
            defaultValue: "Schedule shifted by {{days}} day(s).",
            days: delta,
          }),
        );
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setShifting(false);
      }
    },
    [projectStartIso, stages, allocations, qc, quoteId, t],
  );



  /**
   * Inline rename from the outline column.
   *
   * Propagation rule: supplier_phase rows mirror the name of the architecture
   * stage they were spawned from. So when an architecture stage is renamed,
   * any supplier_phase row whose lineage points back to that architecture
   * and whose current name still matches the old architecture name is
   * renamed too — keeping the supplier-group summary subtree in sync.
   */
  const handleRename = useCallback(
    async (id: string, name: string) => {
      const target = stages.find((s) => s.id === id);
      if (!target) return;
      const oldName = target.name;
      await upsertStage.mutateAsync({ id, name });
      const role = (target as { stage_role?: string | null }).stage_role ?? "architecture";
      if (role !== "architecture") return;
      // Find supplier_groups whose parent is this arch, then phases under
      // them whose name still matches the previous arch name.
      const groupIds = stages
        .filter(
          (s) =>
            (s as { stage_role?: string | null }).stage_role === "supplier_group" &&
            (s as { parent_stage_id?: string | null }).parent_stage_id === id,
        )
        .map((s) => s.id);
      if (groupIds.length === 0) return;
      const mirrors = stages.filter(
        (s) =>
          (s as { stage_role?: string | null }).stage_role === "supplier_phase" &&
          groupIds.includes(
            (s as { parent_stage_id?: string | null }).parent_stage_id ?? "",
          ) &&
          s.name === oldName,
      );
      await Promise.all(
        mirrors.map((m) => upsertStage.mutateAsync({ id: m.id, name })),
      );
    },
    [stages, upsertStage],
  );

  /**
   * Inline WBS renumber — only the trailing segment is editable, so the
   * change is always a reorder within the same parent. We collect the
   * siblings sharing role + parent_stage_id, splice the target to the new
   * 1-based position, and rewrite sort_order sequentially.
   */
  const handleReorder = useCallback(
    async (id: string, newPosition: number) => {
      const target = stages.find((s) => s.id === id) as
        | (typeof stages)[number] & {
            stage_role?: string | null;
            parent_stage_id?: string | null;
          }
        | undefined;
      if (!target) return;
      const role = target.stage_role ?? "architecture";
      const parentId = target.parent_stage_id ?? null;
      const siblings = (stages as typeof stages & Array<{ stage_role?: string | null; parent_stage_id?: string | null }>)
        .filter(
          (s) =>
            ((s as { stage_role?: string | null }).stage_role ?? "architecture") === role &&
            ((s as { parent_stage_id?: string | null }).parent_stage_id ?? null) === parentId,
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const without = siblings.filter((s) => s.id !== id);
      const clamped = Math.max(1, Math.min(newPosition, siblings.length));
      without.splice(clamped - 1, 0, target);
      // Write only rows whose sort_order changes.
      await Promise.all(
        without.map((s, i) => {
          const next = (i + 1) * 10;
          if ((s.sort_order ?? 0) === next) return Promise.resolve();
          return upsertStage.mutateAsync({ id: s.id, sort_order: next });
        }),
      );
    },
    [stages, upsertStage],
  );

  // Index resources for fast lookup when building per-allocation snapshots.
  const resourceById = useMemo(
    () => new Map(resources.map((r) => [r.id, r])),
    [resources],
  );

  // Map quote allocations onto the AllocationWithResource shape, snapshotting
  // the rate fields from the quote row (so the Gantt cost overlay reflects
  // the rates actually quoted, not today's effective rates).
  const allocByStage = useMemo(() => {
    const m = new Map<string, AllocationWithResource[]>();
    for (const a of allocations) {
      const baseRes = resourceById.get(a.resource_id);
      if (!baseRes) continue;
      const resourceForAlloc: Resource = {
        ...baseRes,
        hourly_rate: Number(a.sale_rate_snapshot),
        sale_rate: Number(a.sale_rate_snapshot),
        cost_rate: Number(a.cost_rate_snapshot),
      };
      const mapped: AllocationWithResource = {
        id: a.id,
        stage_id: a.stage_id,
        resource_id: a.resource_id,
        start_date: a.start_date,
        end_date: a.end_date,
        hours_per_day: a.hours_per_day,
        // Quote allocations have no committed/tentative status — present as
        // 'committed' to satisfy the type and let the bar render normally.
        status: "committed",
        status_changed_at: null,
        created_at: a.created_at,
        updated_at: a.updated_at,
        source: null,
        is_locked: false,
        external_id: null,
        total_hours_imported: null,
        allocation_percentage: null,
        resource: resourceForAlloc,
      };
      const arr = m.get(a.stage_id) ?? [];
      arr.push(mapped);
      m.set(a.stage_id, arr);
    }
    return m;
  }, [allocations, resourceById]);

  // Map quote stages into StageWithProject + build the hierarchy descriptor
  // consumed by GanttChart's outline column.
  const { mappedStages, hierarchy } = useMemo<{
    mappedStages: StageWithProject[];
    hierarchy: Map<string, GanttHierarchyNode>;
  }>(() => {
    // Retainer-monthly stages (stage_kind='retainer_monthly') are edited via
    // RetainerStageEditor and intentionally NOT rendered on the main Gantt.
    const regular = stages.filter(
      (s) => (s as { stage_kind?: string }).stage_kind !== "retainer_monthly",
    );

    type S = (typeof regular)[number] & {
      stage_role?: string | null;
      parent_stage_id?: string | null;
      supplier_company_id?: string | null;
      is_self?: boolean | null;
    };
    const all = regular as S[];

    // Group every stage by its parent_stage_id (null = root). Sort each
    // sibling group by sort_order so the tree walk is deterministic.
    const childrenByParent = new Map<string | null, S[]>();
    for (const s of all) {
      const pid = s.parent_stage_id ?? null;
      const arr = childrenByParent.get(pid) ?? [];
      arr.push(s);
      childrenByParent.set(pid, arr);
    }
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    const ordered: S[] = [];
    const hier = new Map<string, GanttHierarchyNode>();

    const roleOf = (s: S): "architecture" | "supplier_group" | "supplier_phase" => {
      // "This is us" overrides supplier role — render as architecture
      // (solid bar, no dashed supplier hatching, no outflow).
      if ((s as { is_self?: boolean | null }).is_self === true) return "architecture";
      const r = (s.stage_role ?? "architecture") as string;
      if (r === "supplier_group" || r === "supplier_phase") return r;
      return "architecture";
    };
    const isSupplierRole = (s: S) => {
      const role = roleOf(s);
      return role === "supplier_group" || role === "supplier_phase";
    };

    const walk = (node: S, depth: number, wbs: string, parentId: string | null) => {
      const kids = childrenByParent.get(node.id) ?? [];
      const role = roleOf(node);
      hier.set(node.id, {
        depth,
        wbs,
        hasChildren: kids.length > 0,
        // A row is a "summary" if it actually has children — applies to
        // any role, including supplier_phase parents nested under groups.
        isSummary: kids.length > 0,
        role,
        parentId,
      });
      ordered.push(node);
      kids.forEach((c, ci) => walk(c, depth + 1, `${wbs}.${ci + 1}`, node.id));
    };

    const roots = childrenByParent.get(null) ?? [];
    roots.forEach((r, i) => walk(r, 0, String(i + 1), null));

    // Roll up summary rows: a parent stage's rendered span is the union of
    // its descendants' dates AND its budget is the sum of children's effective
    // sale value (when budget_mode='calculated'; 'fixed' keeps the stored
    // value). Persisted start/end/budget on the row stay untouched.
    const rollup = new Map<string, { start: string; end: string; budget: number }>();
    const computeRollup = (node: S): { start: string; end: string; budget: number } => {
      const kids = childrenByParent.get(node.id) ?? [];
      if (kids.length === 0) {
        return { start: node.start_date, end: node.end_date, budget: Number(node.budget ?? 0) || 0 };
      }
      let minStart = "";
      let maxEnd = "";
      let sumBudget = 0;
      let supplierChildrenBudget = 0;
      for (const k of kids) {
        const r = computeRollup(k);
        if (!minStart || r.start < minStart) minStart = r.start;
        if (!maxEnd || r.end > maxEnd) maxEnd = r.end;
        sumBudget += r.budget;
        if (isSupplierRole(k)) supplierChildrenBudget += r.budget;
      }
      const mode = ((node as { budget_mode?: string | null }).budget_mode ?? "calculated") as string;
      const ownBudget = Number(node.budget ?? 0) || 0;
      const effectiveBudget = mode === "fixed"
        ? (isSupplierRole(node) ? ownBudget : ownBudget + supplierChildrenBudget)
        : (!isSupplierRole(node) && kids.some(isSupplierRole) ? ownBudget + sumBudget : sumBudget);
      const out = { start: minStart || node.start_date, end: maxEnd || node.end_date, budget: effectiveBudget };
      rollup.set(node.id, out);
      return out;
    };
    roots.forEach((r) => computeRollup(r));


    const mapped = ordered.map((s) => {
      const ru = rollup.get(s.id);
      return {
      id: s.id,
      name: s.name,
      project_id: quoteId,
      projectId: quoteId,
      start_date: ru?.start ?? s.start_date,
      end_date: ru?.end ?? s.end_date,
      color: s.color,
      budget: ru?.budget ?? s.budget,
      sort_order: s.sort_order,
      external_id: s.external_id ?? null,

      created_at: s.created_at,
      updated_at: s.updated_at,
      baseline_budget: null,
      baseline_end_date: null,
      baseline_locked_at: null,
      baseline_notes: null,
      baseline_start_date: null,
      baseline_target_hours: null,
      source: null,
      is_locked: false,
      source_contract_id: null,
      bootstrap_run_id: null,
      source_contract_phase_key: null,
      retainer_review_months: null,
      stage_kind: "regular",
      archived_at: null,
      parent_stage_id: s.parent_stage_id ?? null,
      billing_model: "stage",
      retainer_monthly_amount: 0,
      retainer_anchor_month: null,
      retainer_months: null,
      retainer_capacity_hours_per_month: 160,
      is_fee_only: true,
      status: "active",
      is_milestone: (s as { is_milestone?: boolean }).is_milestone ?? false,
      children_bill_independently: (s as { children_bill_independently?: boolean }).children_bill_independently ?? false,
      bill_to_client: (s as { bill_to_client?: boolean }).bill_to_client ?? false,
      markup_pct: (s as { markup_pct?: number }).markup_pct ?? 0,
      allocations: allocByStage.get(s.id) ?? [],
      };
    });



    // Synthetic top-row "Project" summary spanning min(start) → max(end).
    if (mapped.length > 0) {
      let minStart = mapped[0].start_date;
      let maxEnd = mapped[0].end_date;
      for (const s of mapped) {
        if (s.start_date < minStart) minStart = s.start_date;
        if (s.end_date > maxEnd) maxEnd = s.end_date;
      }
      const projectRow: StageWithProject = {
        ...mapped[0],
        id: PROJECT_SUMMARY_ID,
        name: t("workspace.planning.projectSummary", { defaultValue: "Project" }),
        start_date: minStart,
        end_date: maxEnd,
        color: "#0f172a",
        budget: mapped
          .filter((s) => !(s as { parent_stage_id?: string | null }).parent_stage_id)
          .reduce((sum, s) => sum + Number(s.budget ?? 0), 0),
        sort_order: -1,
        parent_stage_id: null,
        allocations: [],
        is_milestone: false,
      };
      mapped.unshift(projectRow as (typeof mapped)[number]);
      hier.set(PROJECT_SUMMARY_ID, {
        depth: 0,
        wbs: "0",
        hasChildren: false,
        isSummary: true,
        role: "architecture",
        parentId: null,
      });
    }

    return { mappedStages: mapped, hierarchy: hier };
  }, [stages, allocByStage, quoteId, t]);


  // Local collapse state for the outline. Persisted in sessionStorage per quote.
  const collapseKey = `quote-gantt-collapsed:${quoteId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(collapseKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.sessionStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  // Per-stage collapse of allocation/resource sub-rows. Default: collapsed
  // (resources hidden) — user clicks the triangle next to a stage to reveal
  // its resource list.
  const resCollapseKey = `quote-gantt-res-collapsed:${quoteId}`;
  const [resCollapsed, setResCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(resCollapseKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* no-op */
    }
    return new Set();
  });
  // Seed: any stage with allocations that hasn't been toggled yet starts collapsed.
  useEffect(() => {
    setResCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const [sid, list] of allocByStage.entries()) {
        if (list.length > 0 && !prev.has(sid) && !window.sessionStorage.getItem(`${resCollapseKey}:seen:${sid}`)) {
          next.add(sid);
          try { window.sessionStorage.setItem(`${resCollapseKey}:seen:${sid}`, "1"); } catch { /* no-op */ }
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allocByStage, resCollapseKey]);
  const toggleResCollapse = (id: string) => {
    setResCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.sessionStorage.setItem(resCollapseKey, JSON.stringify([...next]));
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  // Origin/totalDays — earliest start - 7d, span out to latest end + 21d.
  const { origin, totalDays } = useMemo(() => {
    if (!mappedStages.length) {
      return { origin: addDays(new Date(), -7), totalDays: 90 };
    }
    let minD = new Date(mappedStages[0].start_date);
    let maxD = new Date(mappedStages[0].end_date);
    for (const s of mappedStages) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < minD) minD = sd;
      if (ed > maxD) maxD = ed;
    }
    const o = addDays(minD, -7);
    const days = Math.max(60, differenceInCalendarDays(maxD, o) + 21);
    return { origin: o, totalDays: days };
  }, [mappedStages]);

  // Payment milestones — resolve each schedule item to a concrete date and €
  // amount using current stage dates and the sum of stage budgets as the
  // percent base. Recurring (monthly) items are skipped from the lane.
  const paymentsQ = useQuotePaymentSchedule(quoteId);
  const milestones = useMemo<PaymentMilestone[]>(() => {
    const items = paymentsQ.data ?? [];
    if (items.length === 0 || mappedStages.length === 0) return [];
    const stageById = new Map(mappedStages.map((s) => [s.id, s]));
    const earliestStart = mappedStages.reduce(
      (min, s) => (s.start_date < min ? s.start_date : min),
      mappedStages[0].start_date,
    );
    const totalValue = mappedStages.reduce((sum, s) => sum + Number(s.budget ?? 0), 0);
    const out: PaymentMilestone[] = [];
    for (const p of items) {
      let date: string | null = null;
      switch (p.trigger_type) {
        case "project_start":
          date = earliestStart;
          break;
        case "stage_start":
          date = p.stage_id ? stageById.get(p.stage_id)?.start_date ?? null : null;
          break;
        case "stage_end":
          date = p.stage_id ? stageById.get(p.stage_id)?.end_date ?? null : null;
          break;
        case "manual_date":
          date = p.expected_invoice_date ?? null;
          break;
        case "monthly":
        default:
          continue;
      }
      if (!date) continue;
      const amount =
        p.amount_type === "fixed"
          ? Number(p.amount_value)
          : (Number(p.amount_value) / 100) * totalValue;
      out.push({
        id: p.id,
        label: p.label,
        date,
        amount,
        status: "planned",
        note: p.notes ?? null,
      });
    }
    return out;
  }, [paymentsQ.data, mappedStages]);


  // Zoom — local UI state. Default to "week" (matches old detailed view).
  // If a parent forces dayWidth via prop, that wins (uncontrolled fallback only
  // when the prop is undefined).
  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [poolCollapsed, setPoolCollapsed] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [outlineWidth, setOutlineWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const v = Number(window.localStorage.getItem("planner.outlineWidth.quote"));
    return Number.isFinite(v) && v >= 280 && v <= 900 ? v : 420;
  });
  const handleResizeOutline = useCallback((w: number) => {
    setOutlineWidth(w);
    try { window.localStorage.setItem("planner.outlineWidth.quote", String(w)); } catch { /* ignore */ }
  }, []);
  const handleUpdateBudget = useCallback(
    async (id: string, _projectId: string, budget: number) => {
      await upsertStage.mutateAsync({ id, budget } as Parameters<typeof upsertStage.mutateAsync>[0]);
    },
    [upsertStage],
  );
  const deleteQuoteStage = useDeleteQuoteStage(quoteId);
  const createQuoteDep = useCreateQuoteDependency(quoteId);

  /**
   * Insert a new stage relative to an anchor row.
   * - above/below: same parent and role as anchor
   * - child: anchor becomes parent; role demotes one level
   * - milestone: like "below" but 1-day duration named "Milestone"
   * When anchorId is null, appends a new top-level architecture stage.
   */
  const handleInsert = useCallback(
    async (
      anchorId: string | null,
      where: "above" | "below" | "child" | "milestone",
    ) => {
      type S = (typeof stages)[number] & {
        stage_role?: string | null;
        parent_stage_id?: string | null;
      };
      const all = stages as S[];
      const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
      const demote = (r: string) =>
        r === "architecture" ? "supplier_group" : r === "supplier_group" ? "supplier_phase" : "supplier_phase";

      let parentId: string | null = null;
      let role: string = "architecture";
      let start = new Date();
      let end = addDays(start, 5);
      let baseSort = 10;

      if (!anchorId) {
        const tops = all
          .filter((s) => (s.stage_role ?? "architecture") === "architecture")
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const last = tops[tops.length - 1];
        baseSort = ((last?.sort_order ?? 0) || tops.length * 10) + 10;
      } else {
        const anchor = all.find((s) => s.id === anchorId);
        if (!anchor) return;
        const anchorRole = anchor.stage_role ?? "architecture";
        const anchorParent = anchor.parent_stage_id ?? null;

        if (where === "child") {
          parentId = anchor.id;
          role = demote(anchorRole);
          start = new Date(anchor.start_date);
          end = new Date(anchor.end_date);
          const kids = all
            .filter(
              (s) =>
                (s.parent_stage_id ?? null) === anchor.id &&
                (s.stage_role ?? "architecture") === role,
            )
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          baseSort = ((kids[kids.length - 1]?.sort_order ?? 0) || 0) + 10;
        } else {
          // If inserting "below" a row that has children, behave like
          // "child" (insert as first child) so the new row appears
          // immediately below in the outline — matching Merlin behavior.
          const anchorHasChildren = all.some(
            (s) => (s.parent_stage_id ?? null) === anchor.id,
          );
          if (where === "below" && anchorHasChildren) {
            parentId = anchor.id;
            role = demote(anchorRole);
            const kids = all
              .filter(
                (s) =>
                  (s.parent_stage_id ?? null) === anchor.id &&
                  (s.stage_role ?? "architecture") === role,
              )
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const firstSort = kids[0]?.sort_order ?? 20;
            baseSort = Math.max(1, Math.floor(firstSort / 2));
            start = new Date(anchor.start_date);
            end = addDays(start, 5);
          } else {
            parentId = anchorParent;
            role = anchorRole;
            const siblings = all
              .filter(
                (s) =>
                  (s.parent_stage_id ?? null) === anchorParent &&
                  (s.stage_role ?? "architecture") === anchorRole,
              )
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const idx = siblings.findIndex((s) => s.id === anchor.id);
            if (where === "above") {
              const prev = siblings[idx - 1];
              const a = prev?.sort_order ?? 0;
              const b = anchor.sort_order ?? a + 20;
              baseSort = Math.floor((a + b) / 2);
              if (baseSort === a || baseSort === b) baseSort = (anchor.sort_order ?? 10) - 5;
              start = new Date(anchor.start_date);
              end = addDays(start, 5);
            } else {
              // below (no children) or milestone
              const next = siblings[idx + 1];
              const a = anchor.sort_order ?? 0;
              const b = next?.sort_order ?? a + 20;
              baseSort = Math.floor((a + b) / 2);
              if (baseSort === a || baseSort === b) baseSort = a + 5;
              start = addDays(new Date(anchor.end_date), 1);
              end = addDays(start, where === "milestone" ? 0 : 5);
            }
          }
        }

      }

      const name =
        where === "milestone"
          ? t("workspace.planning.newMilestone", { defaultValue: "Milestone" })
          : t("workspace.planning.newStage", { defaultValue: "New stage" });

      const created = await upsertStage.mutateAsync({
        quote_id: quoteId,
        name,
        start_date: fmtDate(start),
        end_date: fmtDate(end),
        sort_order: baseSort,
        parent_stage_id: parentId,
        stage_role: role,
      } as Parameters<typeof upsertStage.mutateAsync>[0]);
      if (created?.id) {
        setSelectedStageId(created.id);
        // Default: new stage depends on the immediately preceding sibling (FS).
        const siblings = all
          .filter(
            (s) =>
              (s.parent_stage_id ?? null) === parentId &&
              (s.stage_role ?? "architecture") === role,
          )
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const predecessors = siblings.filter((s) => (s.sort_order ?? 0) < baseSort);
        const predecessor = predecessors[predecessors.length - 1];
        if (predecessor) {
          try {
            await createQuoteDep.mutateAsync({
              quote_id: quoteId,
              predecessor_stage_id: predecessor.id,
              successor_stage_id: created.id,
              type: "FS",
              lag_days: 0,
            });
          } catch {
            /* non-fatal: user can wire dependency manually */
          }
        }
      }
    },
    [stages, upsertStage, quoteId, t, createQuoteDep],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteQuoteStage.mutateAsync(id);
        if (selectedStageId === id) setSelectedStageId(null);
        toast.success(t("workspace.planning.inspector.deleteStage", { defaultValue: "Stage deleted" }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete stage");
      }
    },
    [deleteQuoteStage, selectedStageId, t],
  );

  /**
   * Indent (Merlin-style outline): make the row a child of its previous
   * sibling (same current parent). Stage role/category is preserved — the
   * parent simply becomes a group header. No role demotion.
   */
  const handleIndent = useCallback(
    async (id: string) => {
      type S = (typeof stages)[number] & {
        parent_stage_id?: string | null;
      };
      const all = stages as S[];
      const target = all.find((s) => s.id === id);
      if (!target) return;
      const parentId = target.parent_stage_id ?? null;
      const siblings = all
        .filter((s) => (s.parent_stage_id ?? null) === parentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const idx = siblings.findIndex((s) => s.id === id);
      const prev = siblings[idx - 1];
      if (!prev) {
        toast.error(t("workspace.planning.indentBlocked", { defaultValue: "Select a row that has a sibling above it to indent." }));
        return;
      }
      const newKids = all
        .filter((s) => (s.parent_stage_id ?? null) === prev.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const nextSort = ((newKids[newKids.length - 1]?.sort_order ?? 0) || 0) + 10;
      await upsertStage.mutateAsync({
        id,
        parent_stage_id: prev.id,
        sort_order: nextSort,
      } as Parameters<typeof upsertStage.mutateAsync>[0]);
      toast.success(t("workspace.planning.indented", { defaultValue: "Row indented." }));
    },
    [stages, upsertStage, t],
  );

  /**
   * Outdent (Merlin-style): promote one level — new parent = current parent's
   * parent. Placed right after the former parent in the new sibling group.
   * Stage role/category is preserved.
   */
  const handleOutdent = useCallback(
    async (id: string) => {
      type S = (typeof stages)[number] & {
        parent_stage_id?: string | null;
      };
      const all = stages as S[];
      const target = all.find((s) => s.id === id);
      if (!target) return;
      const parent = all.find((s) => s.id === (target.parent_stage_id ?? ""));
      if (!parent) {
        toast.error(t("workspace.planning.outdentBlocked", { defaultValue: "Top-level rows can't be outdented further." }));
        return;
      }
      const newParentId = (parent as S).parent_stage_id ?? null;
      const siblings = all
        .filter((s) => (s.parent_stage_id ?? null) === newParentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const parentIdx = siblings.findIndex((s) => s.id === parent.id);
      const a = siblings[parentIdx]?.sort_order ?? 0;
      const b = siblings[parentIdx + 1]?.sort_order ?? a + 20;
      let sort = Math.floor((a + b) / 2);
      if (sort === a || sort === b) sort = a + 5;
      await upsertStage.mutateAsync({
        id,
        parent_stage_id: newParentId,
        sort_order: sort,
      } as Parameters<typeof upsertStage.mutateAsync>[0]);
      toast.success(t("workspace.planning.outdented", { defaultValue: "Row outdented." }));
    },
    [stages, upsertStage, t],
  );


  // Measure chart container width so "Fit" stretches to fill it.
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(1100);
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const update = () => setChartWidth(el.clientWidth || 1100);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [poolCollapsed]);

  // Reset to "week" when switching quotes — avoids carrying over a fitted width
  // sized for a different quote's totalDays.
  useEffect(() => {
    setZoom("fit");
  }, [quoteId]);

  const computedDayWidth = useMemo(() => {
    if (dayWidthProp !== undefined) return dayWidthProp;
    const target = Math.max(400, chartWidth - 24);
    const fitWidth = target / Math.max(1, totalDays);
    if (zoom === "fit") {
      return Math.max(1, Math.min(32, fitWidth));
    }
    return ZOOM_DAY_WIDTHS[zoom];
  }, [zoom, totalDays, dayWidthProp, chartWidth]);

  if (stagesQ.isLoading) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {t("workspace.planning.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  const isEmpty = mappedStages.length === 0;


  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => handleInsert(null, "below")}
            disabled={upsertStage.isPending}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("workspace.planning.addStage", { defaultValue: "Add stage" })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => selectedStageId && handleIndent(selectedStageId)}
            disabled={!selectedStageId || upsertStage.isPending}
            title={t("workspace.planning.indent", { defaultValue: "Indent (make child of previous)" })}
            aria-label="Indent"
          >
            <IndentIncrease className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => selectedStageId && handleOutdent(selectedStageId)}
            disabled={!selectedStageId || upsertStage.isPending}
            title={t("workspace.planning.outdent", { defaultValue: "Outdent (promote one level)" })}
            aria-label="Outdent"
          >
            <IndentDecrease className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={handleReflow}
            disabled={reflowing}
            title={t("workspace.planning.reflow.tooltip", {
              defaultValue:
                "Push every stage forward so all FS/SS/FF/SF dependencies are honoured.",
            })}
          >
            <AlignVerticalJustifyStart className="mr-1 h-3.5 w-3.5" />
            {reflowing
              ? t("workspace.planning.reflow.running", { defaultValue: "Reflowing…" })
              : t("workspace.planning.reflow.button", { defaultValue: "Reflow" })}
          </Button>
          {onAddRetainerPhase && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={onAddRetainerPhase}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t("workspace.planning.retainerMonthly.addStage", {
                defaultValue: "Add retainer phase",
              })}
            </Button>
          )}
          {projectStartIso && (
            <div className="ml-2 flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5">
              <span className="text-xs text-muted-foreground">
                {t("workspace.planning.projectStart", { defaultValue: "Project start" })}
              </span>
              <Input
                type="date"
                value={projectStartIso}
                onChange={(e) => handleShiftProjectStart(e.target.value)}
                disabled={shifting}
                className="h-6 w-[140px] border-0 bg-transparent p-0 text-xs focus-visible:ring-0"
                title={t("workspace.planning.projectStartHint", {
                  defaultValue: "Changing this shifts every stage and allocation by the same number of days.",
                })}
              />
            </div>
          )}
        </div>

        {dayWidthProp === undefined && (
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            <span className="px-2 text-xs text-muted-foreground">
              {t("workspace.planning.zoomLabel", { defaultValue: "Zoom" })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setZoom((z) => stepZoom(z, -1))}
              disabled={zoom === ZOOM_ORDER[0]}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setZoom((z) => stepZoom(z, 1))}
              disabled={zoom === ZOOM_ORDER[ZOOM_ORDER.length - 1]}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              type="button"
              variant={zoom === "week" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("week")}
            >
              {t("workspace.planning.zoomWeek", { defaultValue: "Week" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "month" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("month")}
            >
              {t("workspace.planning.zoomMonth", { defaultValue: "Month" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "quarter" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("quarter")}
            >
              {t("workspace.planning.zoomQuarter", { defaultValue: "Quarter" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "year" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("year")}
            >
              {t("workspace.planning.zoomYear", { defaultValue: "Year" })}
            </Button>
            <Button
              type="button"
              variant={zoom === "fit" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setZoom("fit")}
            >
              {t("workspace.planning.zoomFit", { defaultValue: "Fit" })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPoolCollapsed((v) => !v)}
              aria-label={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
              title={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
            >
              {poolCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
      <div className="flex overflow-hidden rounded-md border border-border bg-canvas">
        <div
          ref={chartRef}
          className="flex-1 overflow-auto resize-y"
          style={{ height: "70vh", minHeight: 320, maxHeight: "85vh" }}
        >
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <span>{t("workspace.planning.noStages")}</span>
              <Button
                type="button"
                size="sm"
                onClick={() => handleInsert(null, "below")}
                disabled={upsertStage.isPending}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("workspace.planning.addStage", { defaultValue: "Add stage" })}
              </Button>
            </div>
          ) : (

          <GanttChart
            projectId={quoteId}
            stages={mappedStages}
            origin={origin}
            totalDays={totalDays}
            dayWidth={computedDayWidth}
            resources={resources}
            adapter={adapter}
            milestones={milestones}
            hierarchy={hierarchy}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            resourcesCollapsed={resCollapsed}
            onToggleResourcesCollapse={toggleResCollapse}
            outlineWidth={outlineWidth}
            onResizeOutline={handleResizeOutline}
            embedded
            selectedStageId={selectedStageId}
            onSelectStage={(id) => setSelectedStageId(id === PROJECT_SUMMARY_ID ? null : id)}
            onRenameStage={handleRename}
            onReorderStage={handleReorder}
            onInsertStage={handleInsert}
            onDeleteStage={handleDelete}
            onUpdateStageBounds={adapter.updateStage}
            onUpdateStageBudget={handleUpdateBudget}
            onAppendRoot={() => handleInsert(null, "below")}
            impliedHourRate={impliedHourRate}
          />
          )}
        </div>

        {selectedStageId && (
          <QuotePlannerInspector
            quoteId={quoteId}
            stageId={selectedStageId}
            onClose={() => setSelectedStageId(null)}
          />
        )}
        {!poolCollapsed && !selectedStageId && (
          <ResourcePool resources={poolResources} collapsed={false} missingRateIds={rateMissing} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ProjectGantt — same shell as QuoteGantt, wired to pm_* tables.
//
// This intentionally mirrors QuoteGantt's toolbar + chart + inspector layout
// so the project module and the CRM module share one Gantt experience. The
// shared leaf is still <GanttChart>; this wrapper provides the surrounding
// chrome (zoom modes, indent/outdent, inspector drawer, resource pool, WBS
// outline collapse).
//
// Key differences from QuoteGantt:
//  - Reads pm_stages via useProjectDetail (stages already include allocations).
//  - Milestones come from issued invoices, not the quote payment schedule.
//  - No reflow / project-start shifter / retainer phase button.
//  - Edits are admin-only; non-admins see no insert/delete/indent/outdent buttons
//    and the underlying PlannerAdapter blocks mutations with a toast.
// ============================================================================

interface ProjectGanttProps {
  projectId: string;
  showCancelled?: boolean;
  dayWidth?: number;
}

export function ProjectGantt({ projectId, showCancelled = false, dayWidth: dayWidthProp }: ProjectGanttProps) {
  const { t } = useTranslation(["projects", "crm"]);
  const { isAdmin } = useAuth();
  const detailQ = useProjectDetail(projectId, { includeCancelled: showCancelled });
  const { data: allResourcesData } = useProjectResources();
  const allResources = useMemo(
    () => (allResourcesData ?? []).filter((r) => r.active !== false),
    [allResourcesData],
  );
  const adapter = useProjectPlannerAdapter(allResources, { readOnly: !isAdmin });
  const { data: invoices } = useProjectInvoices(projectId);
  const createStage = useCreateProjectStage();
  const updateStage = useUpdateProjectStage();
  const deleteStageMut = useDeleteProjectStage();
  const createProjectDep = useCreateProjectDependency();

  const project = detailQ.data?.project;
  const stages = useMemo(() => detailQ.data?.stages ?? [], [detailQ.data]);

  const summaryLabel = t("projects:gantt.projectSummary", { defaultValue: "Project" });
  const { mappedStages, hierarchy } = useMemo(
    () =>
      stages.length
        ? buildProjectGanttTree(stages, projectId, summaryLabel)
        : { mappedStages: [] as StageWithProject[], hierarchy: new Map<string, GanttHierarchyNode>() },
    [stages, projectId, summaryLabel],
  );

  // Payment milestones from issued invoices.
  const milestones = useMemo<PaymentMilestone[]>(() => {
    const list = invoices ?? [];
    if (list.length === 0) return [];
    return list
      .filter((inv) => inv.raised_date)
      .map((inv) => ({
        id: inv.id,
        label: inv.invoice_number || inv.title || "Invoice",
        date: inv.raised_date as string,
        amount: Number(inv.total ?? 0),
        status:
          inv.status === "paid"
            ? ("paid" as const)
            : inv.status === "sent" || inv.status === "overdue"
              ? ("invoiced" as const)
              : ("planned" as const),
        note: inv.title ?? null,
      }));
  }, [invoices]);

  // Origin/totalDays
  const { origin, totalDays } = useMemo(() => {
    if (!mappedStages.length) {
      return { origin: addDays(new Date(), -7), totalDays: 90 };
    }
    let minD = new Date(mappedStages[0].start_date);
    let maxD = new Date(mappedStages[0].end_date);
    for (const s of mappedStages) {
      const sd = new Date(s.start_date);
      const ed = new Date(s.end_date);
      if (sd < minD) minD = sd;
      if (ed > maxD) maxD = ed;
    }
    const o = addDays(minD, -7);
    const days = Math.max(60, differenceInCalendarDays(maxD, o) + 21);
    return { origin: o, totalDays: days };
  }, [mappedStages]);

  const collapseKey = `project-gantt-collapsed:${projectId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(collapseKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.sessionStorage.setItem(collapseKey, JSON.stringify([...next])); } catch { /* no-op */ }
      return next;
    });
  };

  const resCollapseKey = `project-gantt-res-collapsed:${projectId}`;
  const [resCollapsed, setResCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(resCollapseKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* no-op */ }
    return new Set();
  });
  useEffect(() => {
    setResCollapsed((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const s of stages as StageWithAllocations[]) {
        if ((s.allocations?.length ?? 0) > 0 && !prev.has(s.id) && !window.sessionStorage.getItem(`${resCollapseKey}:seen:${s.id}`)) {
          next.add(s.id);
          try { window.sessionStorage.setItem(`${resCollapseKey}:seen:${s.id}`, "1"); } catch { /* no-op */ }
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [stages, resCollapseKey]);
  const toggleResCollapse = (id: string) => {
    setResCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.sessionStorage.setItem(resCollapseKey, JSON.stringify([...next])); } catch { /* no-op */ }
      return next;
    });
  };

  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [poolCollapsed, setPoolCollapsed] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [outlineWidth, setOutlineWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const v = Number(window.localStorage.getItem("planner.outlineWidth.project"));
    return Number.isFinite(v) && v >= 280 && v <= 900 ? v : 420;
  });
  const handleResizeOutline = useCallback((w: number) => {
    setOutlineWidth(w);
    try { window.localStorage.setItem("planner.outlineWidth.project", String(w)); } catch { /* ignore */ }
  }, []);
  const handleUpdateBudget = useCallback(
    async (id: string, _projectId: string, budget: number) => {
      if (!isAdmin) return;
      await updateStage.mutateAsync({ id, patch: { budget }, projectId });
    },
    [isAdmin, updateStage, projectId],
  );
  useEffect(() => { setZoom("fit"); }, [projectId]);

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(1100);
  useLayoutEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const update = () => setChartWidth(el.clientWidth || 1100);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [poolCollapsed]);

  const computedDayWidth = useMemo(() => {
    if (dayWidthProp !== undefined) return dayWidthProp;
    const target = Math.max(400, chartWidth - 24);
    const fitWidth = target / Math.max(1, totalDays);
    if (zoom === "fit") return Math.max(1, Math.min(32, fitWidth));
    return ZOOM_DAY_WIDTHS[zoom];
  }, [zoom, totalDays, dayWidthProp, chartWidth]);

  // ---- Handlers (admin-gated) -----------------------------------------
  const handleRename = useCallback(
    async (id: string, name: string) => {
      if (!isAdmin || id === PROJECT_MODE_SUMMARY_ID) return;
      await updateStage.mutateAsync({ id, patch: { name }, projectId });
    },
    [isAdmin, updateStage, projectId],
  );

  const handleReorder = useCallback(
    async (id: string, newPosition: number) => {
      if (!isAdmin || id === PROJECT_MODE_SUMMARY_ID) return;
      const target = stages.find((s) => s.id === id) as
        | (StageWithAllocations & { parent_stage_id?: string | null })
        | undefined;
      if (!target) return;
      const parentId = target.parent_stage_id ?? null;
      const siblings = (stages as Array<StageWithAllocations & { parent_stage_id?: string | null }>)
        .filter((s) => (s.parent_stage_id ?? null) === parentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const without = siblings.filter((s) => s.id !== id);
      const clamped = Math.max(1, Math.min(newPosition, siblings.length));
      without.splice(clamped - 1, 0, target);
      await Promise.all(
        without.map((s, i) => {
          const next = (i + 1) * 10;
          if ((s.sort_order ?? 0) === next) return Promise.resolve();
          return updateStage.mutateAsync({ id: s.id, patch: { sort_order: next }, projectId });
        }),
      );
    },
    [isAdmin, stages, updateStage, projectId],
  );

  const handleInsert = useCallback(
    async (anchorId: string | null, where: "above" | "below" | "child" | "milestone") => {
      if (!isAdmin) return;
      const fmtDate = (d: Date) => format(d, "yyyy-MM-dd");
      const all = stages as Array<StageWithAllocations & { parent_stage_id?: string | null }>;
      let parent_stage_id: string | null = null;
      let start = new Date();
      let end = addDays(start, 5);
      let sort_order = 10;
      const isMilestone = where === "milestone";

      if (anchorId && anchorId !== PROJECT_MODE_SUMMARY_ID) {
        const anchor = all.find((s) => s.id === anchorId);
        if (!anchor) return;
        const anchorParent = anchor.parent_stage_id ?? null;
        const anchorHasChildren = all.some((s) => (s.parent_stage_id ?? null) === anchor.id);

        if (where === "child" || (where === "below" && anchorHasChildren)) {
          parent_stage_id = anchor.id;
          const kids = all
            .filter((s) => (s.parent_stage_id ?? null) === anchor.id)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          sort_order = ((kids[kids.length - 1]?.sort_order ?? 0) || 0) + 10;
          start = parseISO(anchor.start_date);
          end = where === "child" ? parseISO(anchor.end_date) : addDays(start, 5);
        } else {
          parent_stage_id = anchorParent;
          const siblings = all
            .filter((s) => (s.parent_stage_id ?? null) === anchorParent)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const idx = siblings.findIndex((s) => s.id === anchor.id);
          if (where === "above") {
            const prev = siblings[idx - 1];
            const a = prev?.sort_order ?? 0;
            const b = anchor.sort_order ?? a + 20;
            sort_order = Math.floor((a + b) / 2);
            if (sort_order === a || sort_order === b) sort_order = (anchor.sort_order ?? 10) - 5;
            start = parseISO(anchor.start_date);
            end = addDays(start, 5);
          } else {
            const next = siblings[idx + 1];
            const a = anchor.sort_order ?? 0;
            const b = next?.sort_order ?? a + 20;
            sort_order = Math.floor((a + b) / 2);
            if (sort_order === a || sort_order === b) sort_order = a + 5;
            start = addDays(parseISO(anchor.end_date), 1);
            end = addDays(start, isMilestone ? 0 : 5);
          }
        }
      } else {
        const tops = all
          .filter((s) => (s.parent_stage_id ?? null) === null)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        sort_order = ((tops[tops.length - 1]?.sort_order ?? 0) || tops.length * 10) + 10;
      }

      try {
        const created = await createStage.mutateAsync({
          project_id: projectId,
          name: isMilestone
            ? t("projects:gantt.newMilestone", { defaultValue: "Milestone" })
            : t("projects:gantt.newStage", { defaultValue: "New stage" }),
          budget: 0,
          start_date: fmtDate(start),
          end_date: fmtDate(end),
          sort_order,
          parent_stage_id,
          is_milestone: isMilestone,
        });
        if (created?.id) {
          setSelectedStageId(created.id);
          // Default: new stage depends on the immediately preceding sibling (FS).
          const siblings = all
            .filter((s) => (s.parent_stage_id ?? null) === parent_stage_id)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          const predecessors = siblings.filter((s) => (s.sort_order ?? 0) < sort_order);
          const predecessor = predecessors[predecessors.length - 1];
          if (predecessor) {
            try {
              await createProjectDep.mutateAsync({
                predecessor_id: predecessor.id,
                successor_id: created.id,
                type: "FS",
                lag_days: 0,
              });
            } catch {
              /* non-fatal */
            }
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to insert stage");
      }
    },
    [isAdmin, stages, createStage, projectId, t, createProjectDep],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!isAdmin || id === PROJECT_MODE_SUMMARY_ID) return;
      try {
        await deleteStageMut.mutateAsync({ id, projectId });
        if (selectedStageId === id) setSelectedStageId(null);
        toast.success(t("projects:gantt.stageDeleted", { defaultValue: "Stage deleted" }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to delete stage");
      }
    },
    [isAdmin, deleteStageMut, projectId, selectedStageId, t],
  );

  const handleIndent = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      const all = stages as Array<StageWithAllocations & { parent_stage_id?: string | null }>;
      const target = all.find((s) => s.id === id);
      if (!target) return;
      const parentId = target.parent_stage_id ?? null;
      const siblings = all
        .filter((s) => (s.parent_stage_id ?? null) === parentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const idx = siblings.findIndex((s) => s.id === id);
      const prev = siblings[idx - 1];
      if (!prev) {
        toast.error(t("crm:workspace.planning.indentBlocked", { defaultValue: "Select a row that has a sibling above it to indent." }));
        return;
      }
      const newKids = all
        .filter((s) => (s.parent_stage_id ?? null) === prev.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const nextSort = ((newKids[newKids.length - 1]?.sort_order ?? 0) || 0) + 10;
      await updateStage.mutateAsync({
        id,
        patch: { parent_stage_id: prev.id, sort_order: nextSort },
        projectId,
      });
      toast.success(t("crm:workspace.planning.indented", { defaultValue: "Row indented." }));
    },
    [isAdmin, stages, updateStage, projectId, t],
  );

  const handleOutdent = useCallback(
    async (id: string) => {
      if (!isAdmin) return;
      const all = stages as Array<StageWithAllocations & { parent_stage_id?: string | null }>;
      const target = all.find((s) => s.id === id);
      if (!target) return;
      const parent = all.find((s) => s.id === (target.parent_stage_id ?? ""));
      if (!parent) {
        toast.error(t("crm:workspace.planning.outdentBlocked", { defaultValue: "Top-level rows can't be outdented further." }));
        return;
      }
      const newParentId = (parent as { parent_stage_id?: string | null }).parent_stage_id ?? null;
      const siblings = all
        .filter((s) => (s.parent_stage_id ?? null) === newParentId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const parentIdx = siblings.findIndex((s) => s.id === parent.id);
      const a = siblings[parentIdx]?.sort_order ?? 0;
      const b = siblings[parentIdx + 1]?.sort_order ?? a + 20;
      let sort = Math.floor((a + b) / 2);
      if (sort === a || sort === b) sort = a + 5;
      await updateStage.mutateAsync({
        id,
        patch: { parent_stage_id: newParentId, sort_order: sort },
        projectId,
      });
      toast.success(t("crm:workspace.planning.outdented", { defaultValue: "Row outdented." }));
    },
    [isAdmin, stages, updateStage, projectId, t],
  );

  if (detailQ.isLoading) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {t("crm:workspace.planning.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        {t("projects:detail.notFound", { defaultValue: "Project not found." })}
      </div>
    );
  }

  if (mappedStages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <span>{t("crm:workspace.planning.noStages", { defaultValue: "No stages yet." })}</span>
        {isAdmin && (
          <Button type="button" size="sm" onClick={() => handleInsert(null, "below")} disabled={createStage.isPending}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("crm:workspace.planning.addStage", { defaultValue: "Add stage" })}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => handleInsert(null, "below")}
                disabled={createStage.isPending}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t("crm:workspace.planning.addStage", { defaultValue: "Add stage" })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                onClick={() => selectedStageId && handleIndent(selectedStageId)}
                disabled={!selectedStageId || updateStage.isPending}
                title={t("crm:workspace.planning.indent", { defaultValue: "Indent (make child of previous)" })}
                aria-label="Indent"
              >
                <IndentIncrease className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                onClick={() => selectedStageId && handleOutdent(selectedStageId)}
                disabled={!selectedStageId || updateStage.isPending}
                title={t("crm:workspace.planning.outdent", { defaultValue: "Outdent (promote one level)" })}
                aria-label="Outdent"
              >
                <IndentDecrease className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {!isAdmin && (
            <span className="rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
              {t("projects:gantt.readOnly.badge", { defaultValue: "Read-only" })}
            </span>
          )}
        </div>

        {dayWidthProp === undefined && (
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
            <span className="px-2 text-xs text-muted-foreground">
              {t("crm:workspace.planning.zoomLabel", { defaultValue: "Zoom" })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setZoom((z) => stepZoom(z, -1))}
              disabled={zoom === ZOOM_ORDER[0]}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setZoom((z) => stepZoom(z, 1))}
              disabled={zoom === ZOOM_ORDER[ZOOM_ORDER.length - 1]}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-4 w-px bg-border" />
            {(["week", "month", "quarter", "year", "fit"] as ZoomMode[]).map((z) => (
              <Button
                key={z}
                type="button"
                variant={zoom === z ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs capitalize"
                onClick={() => setZoom(z)}
              >
                {t(`crm:workspace.planning.zoom${z[0].toUpperCase()}${z.slice(1)}`, { defaultValue: z })}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setPoolCollapsed((v) => !v)}
              aria-label={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
              title={poolCollapsed ? "Expand team pool" : "Collapse team pool"}
            >
              {poolCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
      <div className="flex overflow-hidden rounded-md border border-border bg-canvas">
        <div
          ref={chartRef}
          className="flex-1 overflow-auto resize-y"
          style={{ height: "70vh", minHeight: 320, maxHeight: "85vh" }}
        >
          <GanttChart
            projectId={projectId}
            stages={mappedStages}
            origin={origin}
            totalDays={totalDays}
            dayWidth={computedDayWidth}
            resources={allResources}
            adapter={adapter}
            milestones={milestones}
            hierarchy={hierarchy}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            resourcesCollapsed={resCollapsed}
            onToggleResourcesCollapse={toggleResCollapse}
            outlineWidth={outlineWidth}
            onResizeOutline={handleResizeOutline}
            embedded
            selectedStageId={selectedStageId}
            onSelectStage={(id) => setSelectedStageId(id === PROJECT_MODE_SUMMARY_ID ? null : (id === selectedStageId ? null : id))}
            onRenameStage={isAdmin ? handleRename : undefined}
            onReorderStage={isAdmin ? handleReorder : undefined}
            onInsertStage={isAdmin ? handleInsert : undefined}
            onDeleteStage={isAdmin ? handleDelete : undefined}
            onUpdateStageBounds={isAdmin ? adapter.updateStage : undefined}
            onUpdateStageBudget={isAdmin ? handleUpdateBudget : undefined}
            onAppendRoot={isAdmin ? () => handleInsert(null, "below") : undefined}
          />
        </div>
        {selectedStageId && (
          <ProjectPlannerInspector
            projectId={projectId}
            stages={stages}
            stageId={selectedStageId}
            onClose={() => setSelectedStageId(null)}
            readOnly={!isAdmin}
          />
        )}
        {!poolCollapsed && !selectedStageId && (
          <ResourcePool resources={allResources} collapsed={false} />
        )}
      </div>
    </div>
  );
}
