/**
 * Emails the weekly-timesheet workflow notifications that the database
 * trigger (pm_week_workflow_notify) just put in people's bells. Only
 * recipients with email notifications on (notification_preferences.
 * email_digest_enabled, default on) get an email; the notification id is the
 * idempotency key so a retry never sends twice.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SITE = "https://pedrasilva.lovable.app";

export const sendWeekWorkflowEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ weekId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Caller must be able to see the week (owner or approver, via RLS).
    const { data: week, error: weekError } = await context.supabase
      .from("pm_timesheet_weeks")
      .select("id")
      .eq("id", data.weekId)
      .maybeSingle();
    if (weekError) throw weekError;
    if (!week) throw new Error("Forbidden: week access required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { data: rows, error: notificationError } = await supabaseAdmin
      .from("notifications")
      .select("id, user_id, title, body, link_path")
      .eq("entity_type", "pm_timesheet_week")
      .eq("entity_id", data.weekId)
      .like("kind", "timesheet_week_%");
    if (notificationError) throw notificationError;
    const list = rows ?? [];
    if (!list.length) return { sent: 0 };

    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("user_id, email_digest_enabled")
      .in("user_id", userIds);
    const off = new Set((prefs ?? []).filter((p) => !p.email_digest_enabled).map((p) => p.user_id));

    let sent = 0;
    for (const n of list) {
      if (off.has(n.user_id)) continue;
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(n.user_id);
        const email = u?.user?.email;
        if (!email) continue;
        const result = await sendTemplateEmail("timesheet-week-update", email, {
          idempotencyKey: `tsw-email-${n.id}`,
          templateData: { title: n.title, body: n.body, url: `${SITE}${n.link_path ?? "/projects/timesheet"}` },
        });
        if (result.sent) sent += 1;
      } catch (e) {
        console.error("[timesheet-week-email]", (e as Error)?.message);
      }
    }
    return { sent };
  });
