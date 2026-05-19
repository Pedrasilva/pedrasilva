/**
 * Stage 6A — Project Bootstrap hooks + apply service.
 *
 * - usePreviewProjectBootstrap(contractId)
 * - useApplyProjectBootstrap()
 * - useProjectBootstrapRunForContract(contractId)
 *
 * Apply path:
 *  1. Validate signed contract + no existing applied run.
 *  2. Create a 'preview' bootstrap_run row (sealed snapshot).
 *  3. Insert pm_projects row stamped with provenance.
 *  4. Insert pm_stages (provenance + source_contract_phase_key).
 *  5. Map dependency keys → stage ids and insert pm_stage_dependencies.
 *  6. Flip run to 'applied', stamp target_project_id + result_json.
 *  7. Log contract_event 'project_bootstrap_applied'.
 *
 * On failure, the run is updated to 'failed' with error_json. Best-effort
 * cleanup of any partial project row is attempted so the operator can retry.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildProjectBootstrapSnapshot } from "./bootstrap-snapshot";
import { resolveProjectBootstrapPreview } from "./bootstrap-resolver";
import {
  resolveProjectCommercialBaseline,
  resolveStageCommercialBaselines,
  resolveAllocationPlaceholders,
} from "./commercial-baseline";
import type {
  ProjectCommercialBaselineRow,
  StageCommercialBaselineRow,
  StageAllocationPlaceholderRow,
} from "./baseline-types";
import {
  PROJECT_BOOTSTRAP_RESOLVER_VERSION,
  type ProjectBootstrapPreview,
  type ProjectBootstrapRunRow,
  type ProjectBootstrapSnapshot,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export function useProjectBootstrapRunForContract(
  contractId: string | null | undefined,
) {
  return useQuery({
    enabled: !!contractId,
    queryKey: ["project-bootstrap-run", contractId],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_bootstrap_runs")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as ProjectBootstrapRunRow[];
      const applied = rows.find((r) => r.status === "applied") ?? null;
      return { rows, applied };
    },
  });
}

export function usePreviewProjectBootstrap(contractId: string | null | undefined) {
  return useQuery<{
    snapshot: ProjectBootstrapSnapshot;
    preview: ProjectBootstrapPreview;
  } | null>({
    enabled: !!contractId,
    queryKey: ["project-bootstrap-preview", contractId],
    queryFn: async () => {
      if (!contractId) return null;
      const snapshot = await buildProjectBootstrapSnapshot(contractId);
      const preview = resolveProjectBootstrapPreview(snapshot);
      return { snapshot, preview };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

async function logContractEvent(
  contractId: string,
  event_type: string,
  metadata: Record<string, unknown>,
) {
  await db.from("contract_events").insert({
    contract_id: contractId,
    event_type,
    metadata,
  });
}

export interface ApplyBootstrapResult {
  bootstrapRunId: string;
  projectId: string;
}

export function useApplyProjectBootstrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contractId: string;
    }): Promise<ApplyBootstrapResult> => {
      // 1. Pre-flight: ensure no applied run already exists.
      const { data: existingApplied, error: chkErr } = await db
        .from("project_bootstrap_runs")
        .select("id, target_project_id")
        .eq("contract_id", input.contractId)
        .eq("status", "applied")
        .maybeSingle();
      if (chkErr) throw new Error(chkErr.message);
      if (existingApplied) {
        throw new Error("Contract has already been bootstrapped into a project.");
      }

      // 2. Build snapshot + preview (also validates status==signed).
      const snapshot = await buildProjectBootstrapSnapshot(input.contractId);
      const preview = resolveProjectBootstrapPreview(snapshot);

      // 3. Create the bootstrap run row in 'preview' status to anchor provenance.
      const { data: runRow, error: runErr } = await db
        .from("project_bootstrap_runs")
        .insert({
          contract_id: input.contractId,
          source_quote_id: snapshot.source_quote_id,
          status: "preview",
          resolver_version: PROJECT_BOOTSTRAP_RESOLVER_VERSION,
          snapshot_json: snapshot,
          result_json: { preview },
        })
        .select("id")
        .single();
      if (runErr) throw new Error(runErr.message);
      const bootstrapRunId = runRow.id as string;

      let projectId: string | null = null;
      try {
        // 4. Create project shell.
        const { data: projectRow, error: projErr } = await db
          .from("pm_projects")
          .insert({
            name: preview.project.name,
            company_id: preview.project.company_id,
            opportunity_id: preview.project.opportunity_id,
            quote_id: preview.project.quote_id,
            sold_fee: preview.project.sold_fee,
            sold_internal_fee: preview.project.sold_internal_fee,
            sold_external_fee: preview.project.sold_external_fee,
            sold_pricing_multiplier: preview.project.sold_pricing_multiplier,
            sold_at: preview.project.sold_at ?? new Date().toISOString(),
            source_contract_id: input.contractId,
            bootstrap_run_id: bootstrapRunId,
          })
          .select("id")
          .single();
        if (projErr) throw new Error(projErr.message);
        projectId = projectRow.id as string;

        // 5. Stages.
        const stagesPayload = preview.stages.map((s) => ({
          project_id: projectId,
          name: s.name,
          budget: s.budget,
          // Stage start/end are required NOT NULL. Use signed_at fallback when
          // the sealed snapshot has no date info; user can edit afterwards.
          start_date: (s.start_date ?? snapshot.contract.signed_at ?? new Date().toISOString())
            .slice(0, 10),
          end_date: (s.end_date ?? snapshot.contract.signed_at ?? new Date().toISOString())
            .slice(0, 10),
          sort_order: s.sort_order,
          source_contract_id: input.contractId,
          bootstrap_run_id: bootstrapRunId,
          source_contract_phase_key: s.key,
        }));
        const keyToStageId = new Map<string, string>();
        if (stagesPayload.length) {
          const { data: stageRows, error: stageErr } = await db
            .from("pm_stages")
            .insert(stagesPayload)
            .select("id, source_contract_phase_key");
          if (stageErr) throw new Error(stageErr.message);
          for (const r of stageRows as Array<{
            id: string;
            source_contract_phase_key: string | null;
          }>) {
            if (r.source_contract_phase_key) keyToStageId.set(r.source_contract_phase_key, r.id);
          }
        }

        // 6. Dependencies.
        const depRows = preview.dependencies
          .map((d) => {
            const p = keyToStageId.get(d.predecessor_key);
            const s = keyToStageId.get(d.successor_key);
            if (!p || !s) return null;
            return {
              predecessor_id: p,
              successor_id: s,
              type: d.type,
              lag_days: d.lag_days,
              source_contract_id: input.contractId,
              bootstrap_run_id: bootstrapRunId,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (depRows.length) {
          const { error: depErr } = await db.from("pm_stage_dependencies").insert(depRows);
          if (depErr) throw new Error(depErr.message);
        }

        // 6b. Stage 6B — commercial baselines + allocation placeholders.
        const projectBaseline = resolveProjectCommercialBaseline(snapshot);
        const { error: projBlErr } = await db
          .from("pm_project_commercial_baselines")
          .insert({
            project_id: projectId,
            bootstrap_run_id: bootstrapRunId,
            source_contract_id: input.contractId,
            ...projectBaseline,
          });
        if (projBlErr) throw new Error(projBlErr.message);

        const stageBaselines = resolveStageCommercialBaselines(snapshot)
          .map((sb) => {
            const sid = keyToStageId.get(sb.source_contract_phase_key);
            if (!sid) return null;
            const { project_stage_id: _ignored, ...rest } = sb;
            return {
              project_stage_id: sid,
              project_id: projectId,
              bootstrap_run_id: bootstrapRunId,
              ...rest,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (stageBaselines.length) {
          const { error: stgBlErr } = await db
            .from("pm_stage_commercial_baselines")
            .insert(stageBaselines);
          if (stgBlErr) throw new Error(stgBlErr.message);
        }

        const placeholders = resolveAllocationPlaceholders(snapshot)
          .map((ph) => {
            const sid = keyToStageId.get(ph.source_contract_phase_key);
            if (!sid) return null;
            const { project_stage_id: _ignored, source_contract_phase_key: _k, ...rest } =
              ph;
            return {
              project_stage_id: sid,
              bootstrap_run_id: bootstrapRunId,
              ...rest,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (placeholders.length) {
          const { error: phErr } = await db
            .from("pm_stage_allocation_placeholders")
            .insert(placeholders);
          if (phErr) throw new Error(phErr.message);
        }

        // 7. Flip run to applied.
        const { error: flipErr } = await db
          .from("project_bootstrap_runs")
          .update({
            status: "applied",
            target_project_id: projectId,
            applied_at: new Date().toISOString(),
            result_json: {
              preview,
              created: {
                project_id: projectId,
                stages: stagesPayload.length,
                dependencies: depRows.length,
                stage_baselines: stageBaselines.length,
                allocation_placeholders: placeholders.length,
              },
            },
          })
          .eq("id", bootstrapRunId);
        if (flipErr) throw new Error(flipErr.message);

        await logContractEvent(input.contractId, "project_bootstrap_applied", {
          bootstrap_run_id: bootstrapRunId,
          project_id: projectId,
          stages: stagesPayload.length,
          dependencies: depRows.length,
          stage_baselines: stageBaselines.length,
          allocation_placeholders: placeholders.length,
        });

        return { bootstrapRunId, projectId: projectId! };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Best-effort cleanup of partial project (cascades stages/deps).
        if (projectId) {
          await db.from("pm_projects").delete().eq("id", projectId);
        }
        await db
          .from("project_bootstrap_runs")
          .update({
            status: "failed",
            error_json: { message },
          })
          .eq("id", bootstrapRunId);
        await logContractEvent(input.contractId, "project_bootstrap_failed", {
          bootstrap_run_id: bootstrapRunId,
          error: message,
        });
        throw new Error(message);
      }
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["project-bootstrap-run", vars.contractId] });
      qc.invalidateQueries({ queryKey: ["contract", vars.contractId] });
    },
  });
}
