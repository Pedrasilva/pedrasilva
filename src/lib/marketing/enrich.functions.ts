import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Re-run AI analysis for one capture now. Requires marketing.curate/all. */
export const reenrichCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("has_module_permission", {
      _user_id: context.userId, _key: "marketing.curate", _required_scope: "all",
    } as never);
    if (error || allowed !== true) throw new Error("Not allowed");

    const { loadEnrichContext, enrichCapture } = await import("./enrich.server");
    const ctx = await loadEnrichContext();
    if (!ctx) return { ok: false, error: "No Marketing Bible yet" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("marketing_captures")
      .update({ enrichment_attempts: 0, enrichment_error: null }).eq("id", data.captureId);
    try {
      await enrichCapture(data.captureId, ctx, true);
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).from("marketing_captures")
        .update({ enrichment_attempts: 1, enrichment_error: msg.slice(0, 300) }).eq("id", data.captureId);
      return { ok: false as const, error: msg };
    }
  });
