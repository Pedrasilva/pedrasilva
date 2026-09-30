import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Creates a post request (running) and generates drafts. Requires marketing.curate/all. */
export const generatePostSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      brief: z.string().max(1000).optional().nullable(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ideaCount: z.number().int().min(0).max(10).default(5),
      storyCount: z.number().int().min(0).max(10).default(0),
      sourceCaptureId: z.string().uuid().optional().nullable(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc("has_module_permission", {
      _user_id: context.userId, _key: "marketing.curate", _required_scope: "all",
    } as never);
    if (error || allowed !== true) throw new Error("Not allowed");
    if (!data.sourceCaptureId && data.ideaCount + data.storyCount < 1) throw new Error("Ask for at least one post or story set");
    if (data.periodEnd < data.periodStart) throw new Error("Period end is before its start");

    // Insert as the user (RLS applies); requested_by defaults to auth.uid().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: req, error: insErr } = await (context.supabase as any).from("marketing_post_requests").insert({
      brief: data.brief?.trim() || null,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      idea_count: data.sourceCaptureId ? 1 : data.ideaCount,
      story_count: data.sourceCaptureId ? 0 : data.storyCount,
      source_capture_id: data.sourceCaptureId ?? null,
    }).select("id").single();
    if (insErr || !req) throw new Error(insErr?.message ?? "Could not create the request");

    const { runPostRequest } = await import("./posts.server");
    const r = await runPostRequest(req.id);
    return { requestId: req.id as string, ...r };
  });
