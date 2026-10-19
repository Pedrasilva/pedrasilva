import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { leaveBalance, pendingApprovals, type ApprovalRow } from "./approval-inbox";

export const getApprovalInbox = createServerFn({method: "POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({pedido: z.string().uuid().optional()}).parse(v))
  .handler(async ({context, data}) => {
    const db = context.supabase;
    const {data: staff, error: staffError} = await db.rpc("is_psa_staff");
    if (staffError || !staff) throw new Error("Forbidden");
    const [{data: leaveAccess}, {data: ownId}, peopleResult, changesResult] = await Promise.all([
      db.rpc("can_approve_leave", {_uid: context.userId}), db.rpc("get_my_collaborator_id"),
      db.from("collaborators").select("id,nome,email,dias_ferias_anuais,saldo_ferias_anterior,dias_ferias_extra"),
      db.from("vacation_change_requests").select("*").eq("recipient_id", context.userId),
    ]);
    if (peopleResult.error) throw peopleResult.error;
    if (changesResult.error) throw changesResult.error;
    const people = peopleResult.data ?? [];
    const remoteAllowed = new Set<string>();
    await Promise.all(people.map(async p => {
      const {data: allowed, error} = await db.rpc("remote_work_can_approve", {_user: context.userId, _collaborator: p.id});
      if (error) throw error;
      if (allowed) remoteAllowed.add(p.id);
    }));
    const changes = (changesResult.data ?? []).filter(c => c.requested_by !== context.userId);
    const allowed = !!leaveAccess || remoteAllowed.size > 0 || changes.length > 0;
    if (!allowed) return {allowed: false, rows: [] as ApprovalRow[], focused: null as ApprovalRow | null};
    const leavesQuery = db.from("vacation_requests").select("*");
    const leavesResult = leaveAccess ? await leavesQuery : changes.length ? await leavesQuery.in("id", changes.map(c => c.request_id)) : {data: [], error: null};
    if (leavesResult.error) throw leavesResult.error;
    const leaves = leavesResult.data ?? [];
    const remoteResult = remoteAllowed.size ? await db.from("remote_work_requests").select("*").in("collaborator_id", [...remoteAllowed]) : {data: [], error: null};
    if (remoteResult.error) throw remoteResult.error;
    const personMap = new Map(people.map(p => [p.id,p]));
    const rows: ApprovalRow[] = [];
    const balance = (id: string) => {
      const p = personMap.get(id);
      return p && leaveAccess ? leaveBalance(p, leaves.filter(r => r.collaborator_id === id), new Date().getFullYear()) : null;
    };
    if (leaveAccess) for (const r of leaves) {
      const own = r.collaborator_id === ownId || personMap.get(r.collaborator_id)?.email?.toLowerCase() === context.claims.email?.toString().toLowerCase();
      const missing = r.tipo === "baixa_medica" && !r.attachment_path;
      rows.push({id:r.id, requestId:r.id, kind:"leave", collaboratorId:r.collaborator_id, collaborator:personMap.get(r.collaborator_id)?.nome ?? "—", type:r.tipo,start:r.data_inicio,end:r.data_fim,days:r.dias_uteis,notes:r.notas,attachment:r.attachment_path,submitted:r.created_at,status:r.estado,canDecide:!own,canApprove:!own && !missing,blockReason:own ? "own_request" : missing ? "certificate" : null,balance:balance(r.collaborator_id),decidedAt:r.aprovado_em,decidedBy:null,period:r.periodo});
    }
    for (const c of changes) {
      const r = leaves.find(v => v.id === c.request_id);
      if (!r) continue;
      rows.push({id:c.id,requestId:r.id,kind:"change",collaboratorId:r.collaborator_id,collaborator:personMap.get(r.collaborator_id)?.nome ?? "—",type:c.new_tipo ?? r.tipo,start:c.new_data_inicio ?? r.data_inicio,end:c.new_data_fim ?? r.data_fim,days:c.new_dias_uteis ?? r.dias_uteis,notes:c.explanation,attachment:r.attachment_path,submitted:c.created_at,status:c.status,canDecide:true,canApprove:!(c.new_tipo === "baixa_medica" && !r.attachment_path),blockReason:c.new_tipo === "baixa_medica" && !r.attachment_path ? "certificate" : null,balance:balance(r.collaborator_id),decidedAt:c.decided_at,decidedBy:null,changeKind:c.kind,period:c.new_periodo ?? r.periodo});
    }
    for (const r of remoteResult.data ?? []) rows.push({id:r.id,requestId:r.id,kind:"remote",collaboratorId:r.collaborator_id,collaborator:personMap.get(r.collaborator_id)?.nome ?? "—",type:"remote",start:r.data,end:r.data,days:r.day_part === "full_day" ? 1 : .5,notes:[r.notas,r.location_detail,r.late_reason].filter(Boolean).join(" · ") || null,attachment:null,submitted:r.created_at,status:r.estado,canDecide:true,canApprove:true,blockReason:null,balance:balance(r.collaborator_id),decidedAt:r.aprovado_em,decidedBy:null,period:r.day_part});
    const focused = rows.find(r => r.id === data.pedido) ?? null;
    if (focused && focused.status !== "pendente") {
      const {data: actor, error} = await db.rpc("hr_approval_actor_name", {_id:focused.id,_kind:focused.kind});
      if (error) throw error;
      focused.decidedBy = actor;
    }
    return {allowed, rows:pendingApprovals(rows), focused};
  });

export const decideInboxRequest = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator(v => z.object({id:z.string().uuid(),kind:z.enum(["leave","change","remote"]),approve:z.boolean(),reason:z.string().default("")}).parse(v))
  .handler(async ({context,data}) => {
    const {data: staff} = await context.supabase.rpc("is_psa_staff");
    if (!staff) throw new Error("Forbidden");
    if (!data.approve && data.kind !== "remote" && !data.reason.trim()) throw new Error("reason_required");
    const result = data.kind === "leave"
      ? await context.supabase.rpc("leave_decide_pending", {_req:data.id,_approve:data.approve,_reason:data.reason})
      : data.kind === "change"
      ? await context.supabase.rpc("leave_change_decide", {_change:data.id,_accept:data.approve,_reason:data.reason})
      : await context.supabase.rpc("hr_inbox_remote_decide", {_id:data.id,_approve:data.approve,_reason:data.reason});
    if (result.error) throw result.error;
    return {ok:true};
  });