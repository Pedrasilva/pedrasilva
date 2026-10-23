import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireMarketing(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_module_permission", { _user_id: context.userId, _key: "marketing.view", _required_scope: "all" });
  if (error || !data) throw new Error("Not allowed");
}

export const syncInsightsNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireMarketing(context);
  const { syncInstagramInsights } = await import("./instagram-insights.server");
  return syncInstagramInsights();
});

export const runInsightsAnalysis = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireMarketing(context);
  const { analyseInsights } = await import("./instagram-insights.server");
  const { claudeText } = await import("./nudges.server");
  const { ENRICH_MODEL } = await import("./enrich.server");
  try { return { ...(await analyseInsights(context.userId, (s, u) => claudeText(s, [{ type: "text", text: u }], 2000), ENRICH_MODEL)), error: null }; }
  catch (e) { return { id: null, result: null, error: e instanceof Error ? e.message : "AI unavailable" }; }
});
