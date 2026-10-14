/**
 * Emails accounting (EMAIL_CONTABILIDADE) and Tatiana when a certified sick
 * leave ("baixa_medica") is submitted, with a 7-day signed link to the
 * certificate. The email library has no CC, so two separate sends are made.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Tatiana Shchenina — identified by her unique collaborator email. */
const HR_CC_EMAIL = "tatiana@pedrasilva.com";

export const notifyBaixaMedicaSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Caller must be able to see the request (owner or approver, via RLS).
    const { data: visible } = await context.supabase
      .from("vacation_requests")
      .select("id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!visible) return { sent: 0, reason: "not_found" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("vacation_requests")
      .select("id, collaborator_id, tipo, data_inicio, data_fim, attachment_path, created_at")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req || (req.tipo as string) !== "baixa_medica" || !req.attachment_path) {
      return { sent: 0, reason: "not_applicable" };
    }
    const accounting = process.env.EMAIL_CONTABILIDADE;
    if (!accounting) return { sent: 0, reason: "no_accounting_email_configured" };

    const [{ data: collab }, { data: signed }] = await Promise.all([
      supabaseAdmin.from("collaborators").select("nome").eq("id", req.collaborator_id).maybeSingle(),
      supabaseAdmin.storage.from("leave-attachments").createSignedUrl(req.attachment_path, 60 * 60 * 24 * 7),
    ]);
    const fmt = (s: string) => new Date(s).toLocaleDateString("pt-PT");
    const templateData = {
      collaboratorName: collab?.nome ?? "—",
      startDate: fmt(req.data_inicio),
      endDate: fmt(req.data_fim),
      submittedAt: fmt(req.created_at),
      certificateUrl: signed?.signedUrl ?? null,
    };

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const recipients = [...new Set([accounting.trim().toLowerCase(), HR_CC_EMAIL])];
    let sent = 0;
    for (const to of recipients) {
      try {
        const r = await sendTemplateEmail("baixa-medica-submitted", to, {
          idempotencyKey: `baixa-medica-${req.id}-${to}`,
          templateData,
        });
        if (r.sent) sent += 1;
      } catch (e) {
        console.error("[baixa-medica-notify]", (e as Error)?.message);
      }
    }
    return { sent };
  });
