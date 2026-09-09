// Admin-managed catalog of "internal cost centers" (the categories the
// timesheet shows under the "Internal" section, e.g. Meetings, Training, Fee
// proposals, Marketing, Admin, …).
//
// Historical continuity:
//   pm_time_entries.internal_category stores the category NAME at log time, so
//   archived categories continue to show up correctly in past reports — they
//   just disappear from the picker for NEW entries. The financials aggregator
//   buckets by name and never needs to know whether a category is currently
//   active.
//
// API surface:
//   useInternalCategories(opts?) — list (active only by default; pass
//                                  { includeArchived: true } from the admin
//                                  panel to also load archived ones).
//   useCreateInternalCategory   — admin only, RLS enforced server-side.
//   useUpdateInternalCategory   — rename / edit notes.
//   useArchiveInternalCategory  — soft-archive (sets archived_at = now()).
//   useRestoreInternalCategory  — undo archive.
//   useDeleteInternalCategory   — hard delete (admins, dangerous: only safe
//                                 when no historical entries reference it).
//   useReorderInternalCategories — bulk sort_order update.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InternalCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
  notes: string | null;
  /**
   * Timesheet UX only: which `collaborators.work_profile` values may pick this
   * category for NEW entries. Never read by costing/pricing. Historical
   * entries keep rendering regardless of this list.
   */
  visible_to_profiles: string[];
  created_at: string;
  updated_at: string;
};

export const ALL_WORK_PROFILES = ["project", "mixed", "support"] as const;

const QK_BASE = ["pm-internal-categories"] as const;

/**
 * List internal categories.
 *
 * @param opts.includeArchived  Set to true in admin panels. Defaults to false
 *                              so the timesheet picker only sees active rows.
 * @param opts.workProfile      When set, only categories visible to that
 *                              `collaborators.work_profile` are returned. UX
 *                              filter for NEW entries only — historical rows
 *                              are rendered by the timesheet regardless.
 */
export function useInternalCategories(opts?: {
  includeArchived?: boolean;
  workProfile?: string | null;
}) {
  const includeArchived = !!opts?.includeArchived;
  const workProfile = opts?.workProfile ?? null;
  return useQuery({
    queryKey: [...QK_BASE, { includeArchived, workProfile }],
    queryFn: async (): Promise<InternalCategoryRow[]> => {
      let q = supabase
        .from("pm_internal_categories")
        .select(
          "id, name, sort_order, archived_at, notes, visible_to_profiles, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (!includeArchived) q = q.is("archived_at", null);
      if (workProfile) q = q.contains("visible_to_profiles", [workProfile]);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as InternalCategoryRow[]).map((r) => ({
        ...r,
        visible_to_profiles:
          Array.isArray(r.visible_to_profiles) && r.visible_to_profiles.length
            ? r.visible_to_profiles
            : [...ALL_WORK_PROFILES],
      }));
    },
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QK_BASE });
}

export function useCreateInternalCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      notes?: string | null;
      visible_to_profiles?: string[];
    }) => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Name is required");
      // Place new categories at the bottom by default.
      const { data: maxRow } = await supabase
        .from("pm_internal_categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextSort = (Number(maxRow?.sort_order) || 0) + 10;
      const { error } = await supabase.from("pm_internal_categories").insert({
        name: trimmed,
        notes: input.notes ?? null,
        sort_order: nextSort,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateInternalCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; notes?: string | null }) => {
      const patch: { name?: string; notes?: string | null } = {};
      if (input.name !== undefined) {
        const trimmed = input.name.trim();
        if (!trimmed) throw new Error("Name cannot be empty");
        patch.name = trimmed;
      }
      if (input.notes !== undefined) patch.notes = input.notes;
      const { error } = await supabase
        .from("pm_internal_categories")
        .update(patch)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useArchiveInternalCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pm_internal_categories")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRestoreInternalCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pm_internal_categories")
        .update({ archived_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteInternalCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pm_internal_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Bulk-update sort_order for an ordered list of category IDs. */
export function useReorderInternalCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Re-space by 10 so future single-row reorders have headroom.
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase
            .from("pm_internal_categories")
            .update({ sort_order: (idx + 1) * 10 })
            .eq("id", id),
        ),
      );
    },
    onSuccess: () => invalidateAll(qc),
  });
}
