// Admin-only controls for locked project cost rates.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: { rpc: (...a: never[]) => unknown }; userId: string }) {
  const { data } = (await (ctx.supabase as never as {
    rpc: (n: string, a: unknown) => Promise<{ data: boolean | null }>;
  }).rpc("has_role", { _user_id: ctx.userId, _role: "admin" }));
  if (!data) throw new Error("Only admins can do this");
}

export const getCostRateStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const [periods, resources, log, missing, bySource] = await Promise.all([
      db.from("pm_cost_rate_periods").select("resource_id, valid_from, valid_to, cost_rate, inputs").order("valid_from"),
      db.from("pm_resources").select("id, name"),
      db.from("pm_cost_rate_recalc_log").select("*").order("run_at", { ascending: false }).limit(20),
      db.rpc("pm_entries_missing_cost" as never),
      db.from("pm_time_entries").select("cost_rate_source").not("cost_rate_snapshot", "is", null),
    ]);
    const names = new Map(((resources.data ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]));
    const src: Record<string, number> = {};
    for (const r of (bySource.data ?? []) as { cost_rate_source: string | null }[]) {
      const k = r.cost_rate_source ?? "unknown";
      src[k] = (src[k] ?? 0) + 1;
    }
    return {
      periods: ((periods.data ?? []) as { resource_id: string; valid_from: string; valid_to: string | null; cost_rate: number; inputs: Record<string, unknown> }[]).map((p) => ({
        ...p,
        cost_rate: Number(p.cost_rate),
        resource_name: names.get(p.resource_id) ?? "—",
        inputs: JSON.parse(JSON.stringify(p.inputs ?? {})) as Record<string, string | number | boolean | null>,
      })),
      resources: [...names.entries()].map(([id, name]) => ({ id, name })),
      log: (log.data ?? []) as { id: string; run_by: string | null; run_at: string; kind: string; from_date: string | null; resource_id: string | null; entries_changed: number }[],
      missing: ((missing.data ?? []) as unknown[]).length,
      bySource: src,
    };
  });

export const rebuildCostRatePeriods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { rebuildPeriods, processQueue } = await import("./cost-rates.server");
    await processQueue(db);
    return rebuildPeriods(db);
  });

export const backfillCostSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { backfillMissing } = await import("./cost-rates.server");
    return backfillMissing(db, context.userId);
  });

export const recalcCostSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), resourceId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { processQueue } = await import("./cost-rates.server");
    await processQueue(db);
    // Runs as the caller so the DB re-checks admin and logs who ran it.
    const { data: n, error } = await context.supabase.rpc("pm_recalc_cost_snapshots", {
      _from: data.from,
      _resource_id: data.resourceId ?? undefined,
    } as never);
    if (error) throw new Error(error.message);
    return { changed: Number(n ?? 0) };
  });
