import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = { supabase: any; userId: string };

async function hasMarketing(context: Ctx, key = "marketing.view") {
  const { data, error } = await context.supabase.rpc("has_module_permission", { _user_id: context.userId, _key: key, _required_scope: "all" });
  return !error && data === true;
}

/** Colleagues with Marketing access (for the approver picker and names). */
export const listPostApprovers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await hasMarketing(context as Ctx))) throw new Error("Not allowed");
    const { marketingPeople } = await import("./post-approvals.server");
    return marketingPeople();
  });

/** Curator asks a colleague to approve; the database records it, notifies the bell, then we email. */
export const requestPostApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ draftId: z.string().uuid(), approverId: z.string().uuid(), comment: z.string().max(1000).optional(), reapproval: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await (context as Ctx).supabase.rpc(data.reapproval ? "marketing_request_post_reapproval" : "marketing_request_post_approval", {
      _draft: data.draftId, _approver: data.approverId, _comment: data.comment ?? null,
    });
    if (error) throw new Error(error.message);
    const { data: d } = await (context as Ctx).supabase.from("marketing_post_drafts").select("final_copy, ai_copy").eq("id", data.draftId).maybeSingle();
    const { sendApprovalEmail } = await import("./post-approvals.server");
    const mail = await sendApprovalEmail("request", id, data.approverId, context.userId, data.draftId, d?.final_copy ?? d?.ai_copy ?? "", data.comment ?? null);
    return { approvalId: id as string, emailed: mail.sent };
  });

/** The chosen approver decides; the requester is notified in the bell and by email. */
export const decidePostApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ approvalId: z.string().uuid(), decision: z.enum(["approved", "changes_requested"]), comment: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = (context as Ctx).supabase;
    const { data: a } = await db.from("marketing_post_approvals").select("requested_by, draft_id").eq("id", data.approvalId).maybeSingle();
    const { error } = await db.rpc("marketing_decide_post_approval", { _approval: data.approvalId, _decision: data.decision, _comment: data.comment ?? null });
    if (error) throw new Error(error.message);
    let emailed = false;
    if (a && a.requested_by !== context.userId) {
      const { data: d } = await db.from("marketing_post_drafts").select("final_copy, ai_copy").eq("id", a.draft_id).maybeSingle();
      const { sendApprovalEmail } = await import("./post-approvals.server");
      emailed = (await sendApprovalEmail(data.decision, data.approvalId, a.requested_by, context.userId, a.draft_id, d?.final_copy ?? d?.ai_copy ?? "", data.comment ?? null)).sent;
    }
    return { ok: true, emailed };
  });

export type PostApprovalItem = {
  id: string; draftId: string; requestId: string; platform: string; excerpt: string; requester: string;
  comment: string | null; createdAt: string; projectName: string | null;
};

/** Pending post approvals assigned to the caller (for the approvals home page). Empty without Marketing access. */
export const listMyPostApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostApprovalItem[]> => {
    if (!(await hasMarketing(context as Ctx))) return [];
    const db = (context as Ctx).supabase;
    const { data: rows, error } = await db.from("marketing_post_approvals")
      .select("id, draft_id, requested_by, comment, created_at, marketing_post_drafts(request_id, platform, final_copy, ai_copy, project_id, status)")
      .eq("approver_id", context.userId).eq("decision", "pending").is("voided_at", null).order("created_at");
    if (error) throw new Error(error.message);
    const list = (rows ?? []).filter((r: any) => r.marketing_post_drafts?.status === "pending_approval");
    if (!list.length) return [];
    const { userName } = await import("./nudges.server");
    const names = new Map<string, string>();
    const reqIds: string[] = [...new Set<string>(list.map((r: any) => r.requested_by as string))];
    await Promise.all(reqIds.map(async (id) => { names.set(id, (await userName(id)).name); }));
    const pids = [...new Set(list.map((r: any) => r.marketing_post_drafts.project_id).filter(Boolean))];
    const { data: projects } = pids.length ? await db.from("marketing_project_directory").select("id, name").in("id", pids) : { data: [] };
    const pn = new Map((projects ?? []).map((p: any) => [p.id, p.name]));
    return list.map((r: any) => ({
      id: r.id, draftId: r.draft_id, requestId: r.marketing_post_drafts.request_id, platform: r.marketing_post_drafts.platform,
      excerpt: String(r.marketing_post_drafts.final_copy ?? r.marketing_post_drafts.ai_copy ?? "").slice(0, 200),
      requester: names.get(r.requested_by) ?? "—", comment: r.comment, createdAt: r.created_at,
      projectName: (pn.get(r.marketing_post_drafts.project_id) as string | undefined) ?? null,
    }));
  });
