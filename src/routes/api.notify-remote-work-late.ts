import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

const DAY_PART_LABELS: Record<string, string> = {
  full_day: "Dia completo",
  morning: "Manhã",
  afternoon: "Tarde",
};

const LOCATION_LABELS: Record<string, string> = {
  home: "Casa",
  remote: "Outro local",
};

const WORK_KIND_LABELS: Record<string, string> = {
  home_office: "Home office",
  remote_elsewhere: "Trabalho remoto noutro local",
  client_site: "Trabalho em cliente/obra",
  external_meeting: "Reunião externa",
  other: "Outro",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const Route = createFileRoute("/api/notify-remote-work-late")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const SUPABASE_URL = process.env["SUPABASE_URL"];
          const SUPABASE_PUBLISHABLE_KEY =
            process.env["SUPABASE_PUBLISHABLE_KEY"];
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            console.error("[notify-remote-work-late] Missing Supabase env vars");
            return json({ error: "Internal server error" }, 500);
          }

          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : "";
          if (!token) return json({ error: "Unauthorized" }, 401);

          const userClient = createClient<Database>(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: {
                storage: undefined,
                persistSession: false,
                autoRefreshToken: false,
              },
            },
          );
          const { data: claimsData, error: claimsErr } =
            await userClient.auth.getClaims(token);
          const userId = claimsData?.claims?.sub;
          if (claimsErr || !userId) return json({ error: "Unauthorized" }, 401);

          const body = (await request.json()) as { requestIds?: unknown };
          const requestIds = Array.isArray(body.requestIds)
            ? body.requestIds.filter(
                (v): v is string => typeof v === "string",
              ).slice(0, 31)
            : [];
          if (requestIds.length === 0) {
            return json({ error: "requestIds required" }, 400);
          }

          const { data: rows, error: rowsErr } = await supabaseAdmin
            .from("remote_work_requests")
            .select(
              "id, collaborator_id, data, day_part, location_type, location_detail, work_kind, notas, late_reason, is_late_request, created_by",
            )
            .in("id", requestIds);
          if (rowsErr || !rows || rows.length === 0) {
            return json({ error: "not found" }, 404);
          }

          // Only the author may trigger the notification for their own entries.
          if (rows.some((r) => r.created_by !== userId)) {
            return json({ error: "Forbidden" }, 403);
          }
          const late = rows.filter((r) => r.is_late_request);
          if (late.length === 0) return json({ ok: true, emailSent: false });

          const first = late[0];

          const { data: collab } = await supabaseAdmin
            .from("collaborators")
            .select("nome")
            .eq("id", first.collaborator_id)
            .maybeSingle();

          // Same resolution rule as the app: person-scoped approver wins over
          // a global one; inside each group the lowest priority wins.
          const { data: approvers } = await supabaseAdmin
            .from("remote_work_approvers")
            .select("approver_user_id, collaborator_id, priority, active")
            .eq("active", true)
            .order("priority");
          const scoped = (approvers ?? []).filter(
            (a) => a.collaborator_id === first.collaborator_id,
          );
          const global = (approvers ?? []).filter(
            (a) => a.collaborator_id === null,
          );
          const approver = scoped[0] ?? global[0] ?? null;
          if (!approver) return json({ ok: true, emailSent: false });

          const { data: approverUser } =
            await supabaseAdmin.auth.admin.getUserById(
              approver.approver_user_id,
            );
          const approverEmail = approverUser?.user?.email;
          if (!approverEmail) return json({ ok: true, emailSent: false });

          const { data: settings } = await supabaseAdmin
            .from("remote_work_settings")
            .select("minimum_notice_days")
            .maybeSingle();
          const noticeDays = Math.max(
            1,
            Number(settings?.minimum_notice_days ?? 1) || 1,
          );
          const policy = new Date();
          policy.setDate(policy.getDate() + noticeDays);

          let emailSent = false;
          let emailError: string | null = null;
          try {
            const result = await sendTemplateEmail(
              "remote-work-late",
              approverEmail,
              {
                idempotencyKey: `remote-work-late-${first.id}`,
                templateData: {
                  collaboratorName: collab?.nome ?? "—",
                  dates: late.map((r) => r.data).sort(),
                  dayPart:
                    DAY_PART_LABELS[first.day_part ?? "full_day"] ??
                    first.day_part,
                  location: `${
                    LOCATION_LABELS[first.location_type ?? "home"] ??
                    first.location_type
                  }${first.location_detail ? ` · ${first.location_detail}` : ""}`,
                  workKind:
                    WORK_KIND_LABELS[first.work_kind ?? "home_office"] ??
                    first.work_kind,
                  noticeDays,
                  policyDate: policy.toISOString().slice(0, 10),
                  lateReason: first.late_reason,
                  notes: first.notas,
                },
              },
            );
            emailSent = result.sent;
            if (!result.sent) emailError = result.reason;
          } catch (err) {
            emailError =
              err && typeof err === "object" && "code" in err
                ? String((err as { code?: unknown }).code)
                : "send_failed";
            console.error("[notify-remote-work-late] send failed:", err);
          }

          return json({ ok: true, emailSent, emailError });
        } catch (err) {
          console.error("[notify-remote-work-late] unhandled error:", err);
          return json({ error: "Internal server error" }, 500);
        }
      },
    },
  },
});
