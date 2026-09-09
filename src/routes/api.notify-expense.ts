import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";


const CATEGORY_LABELS: Record<string, string> = {
  carro: "Carro",
  ticket: "Ticket / Cartão refeição",
  premio: "Prémio associado",
  outros: "Outros benefícios",
};

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);

export const Route = createFileRoute("/api/notify-expense")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // --- Authentication ---------------------------------------------
          const SUPABASE_URL = process.env.SUPABASE_URL;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
            console.error("[notify-expense] Missing Supabase env vars");
            return new Response(
              JSON.stringify({ error: "Internal server error" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          const authHeader = request.headers.get("authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          const token = authHeader.slice("Bearer ".length).trim();
          if (!token) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });

          const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
          const userId = claimsData?.claims?.sub;
          if (claimsErr || !userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Verify the authenticated user is an admin before allowing this
          // sensitive operation (reads expense data via service-role and
          // generates signed URLs to private receipts).
          const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
            _user_id: userId,
            _role: "admin",
          });
          if (roleErr || !isAdmin) {
            return new Response(JSON.stringify({ error: "Forbidden" }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          // --- Handler -----------------------------------------------------
          const { expenseId } = (await request.json()) as { expenseId?: string };
          if (!expenseId) {
            return new Response(JSON.stringify({ error: "expenseId required" }), { status: 400 });
          }

          const TO = process.env.EMAIL_CONTABILIDADE;
          if (!TO) {
            console.error("[notify-expense] EMAIL_CONTABILIDADE env var not set");
            return new Response(
              JSON.stringify({ error: "Internal server error" }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }

          // Carregar despesa + colaborador
          const { data: expense, error: e1 } = await supabaseAdmin
            .from("benefit_expenses")
            .select("*")
            .eq("id", expenseId)
            .maybeSingle();
          if (e1 || !expense) {
            return new Response(JSON.stringify({ error: "expense not found" }), { status: 404 });
          }

          const { data: collab } = await supabaseAdmin
            .from("collaborators")
            .select("nome,email,numero_colaborador")
            .eq("id", expense.collaborator_id)
            .maybeSingle();

          // Signed URL da foto (válido 7 dias)
          let photoUrl: string | null = null;
          if (expense.foto_path) {
            const { data: signed } = await supabaseAdmin.storage
              .from("benefit-receipts")
              .createSignedUrl(expense.foto_path, 60 * 60 * 24 * 7);
            photoUrl = signed?.signedUrl ?? null;
          }

          // Envio via serviço de email gerido da Lovable
          let emailSent = false;
          let emailError: string | null = null;
          try {
            const result = await sendTemplateEmail("expense-approved", TO, {
              idempotencyKey: `expense-approved-${expense.id}`,
              replyTo: collab?.email || undefined,
              templateData: {
                collaboratorName: collab?.nome ?? "—",
                collaboratorNumber: collab?.numero_colaborador
                  ? String(collab.numero_colaborador)
                  : null,
                category: CATEGORY_LABELS[expense.categoria] ?? expense.categoria,
                description: expense.descricao,
                date: new Date(expense.data_despesa).toLocaleDateString("pt-PT"),
                amount: fmtEUR(Number(expense.valor)),
                collaboratorNotes: expense.notas_colaborador ?? null,
                approvalNotes: expense.notas_aprovacao ?? null,
                photoUrl,
              },
            });
            if (result.sent) {
              emailSent = true;
            } else {
              emailError = result.reason;
            }
          } catch (err) {
            emailError =
              err && typeof err === "object" && "code" in err
                ? String((err as { code?: unknown }).code)
                : "send_failed";
            console.error("[notify-expense] email send failed:", err);
          }

          return new Response(JSON.stringify({ ok: true, emailSent, emailError }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });


        } catch (err) {
          console.error("[notify-expense] unhandled error:", err);
          return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
