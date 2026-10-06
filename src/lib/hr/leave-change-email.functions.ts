/**
 * Emails the leave change notifications that the leave_* database functions
 * just put in people's bells (no-reply sender from send-email.ts). The
 * notification id is the idempotency key so a retry never sends twice.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://pedrasilva.lovable.app";

export const sendLeaveChangeEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Caller must be able to see the request (owner or approver, via RLS).
    const { data: req } = await context.supabase
      .from("vacation_requests")
      .select("id, collaborator_id, tipo, data_inicio, data_fim, estado")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) return { sent: 0 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, kind, title, body, link_path")
      .eq("entity_type", "vacation_request")
      .eq("entity_id", data.requestId)
      .like("kind", "leave_%")
      .gte("created_at", since);
    const list = rows ?? [];
    if (!list.length) return { sent: 0 };

    const [{ data: collab }, { data: change }, { data: hist }] = await Promise.all([
      supabaseAdmin.from("collaborators").select("nome").eq("id", req.collaborator_id).maybeSingle(),
      supabaseAdmin
        .from("vacation_change_requests")
        .select("kind, new_data_inicio, new_data_fim, new_tipo, explanation, decision_reason, status")
        .eq("request_id", req.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("vacation_request_history")
        .select("before, reason")
        .eq("request_id", req.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const before = (hist?.before ?? null) as { tipo?: string; data_inicio?: string; data_fim?: string } | null;
    const orig = before ?? req;
    const proposal = change
      ? change.kind === "cancel"
        ? "cancelar o pedido"
        : change.kind === "dates"
          ? `alterar datas para ${change.new_data_inicio} → ${change.new_data_fim}`
          : `alterar o tipo para ${change.new_tipo}`
      : null;

    let sent = 0;
    for (const n of list) {
      const lines = [
        `Colaborador: ${collab?.nome ?? "—"}`,
        `Original: ${orig.tipo} · ${orig.data_inicio} → ${orig.data_fim}`,
      ];
      if (n.kind === "leave_change_requested" && change) {
        lines.push(`Proposta: ${proposal}`, `Explicação: ${change.explanation}`);
      } else if (n.kind === "leave_change_refused" && change) {
        lines.push(`Proposta: ${proposal}`, `Motivo da recusa: ${change.decision_reason ?? ""}`);
      } else if (n.kind === "leave_change_accepted" && change) {
        lines.push(`Alteração aplicada: ${proposal}`);
      } else if (n.kind === "leave_changed_by_approver") {
        lines.push(`Agora: ${req.estado} · ${req.data_inicio} → ${req.data_fim}`, `Motivo: ${hist?.reason ?? ""}`);
      } else if (n.kind === "leave_request_approved") {
        lines.push("Estado: aprovado");
      } else if (n.kind === "leave_request_rejected") {
        lines.push("Estado: rejeitado", `Motivo: ${hist?.reason ?? ""}`);
      }
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(n.user_id);
        const email = u?.user?.email;
        if (!email) continue;
        await sendTemplateEmail("leave-change", email, {
          idempotencyKey: `leave-email-${n.id}`,
          templateData: { title: n.title, lines, url: `${SITE}${n.link_path ?? "/hr/ferias"}` },
        });
        sent += 1;
      } catch (e) {
        console.error("[leave-change-email]", (e as Error)?.message);
      }
    }
    return { sent };
  });
