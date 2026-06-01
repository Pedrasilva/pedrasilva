import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

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

          const subject = `[Benefícios] Despesa aprovada — ${collab?.nome ?? ""} — ${fmtEUR(Number(expense.valor))}`;
          const html = `
            <div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a1a">
              <h2 style="margin:0 0 12px">Despesa aprovada para pagamento</h2>
              <p style="margin:0 0 16px;color:#555">A despesa abaixo foi aprovada e está pronta para processamento.</p>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tbody>
                  <tr><td style="padding:6px 0;color:#666">Colaborador</td><td><strong>${escapeHtml(collab?.nome ?? "—")}</strong>${collab?.numero_colaborador ? ` (#${escapeHtml(String(collab.numero_colaborador))})` : ""}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Categoria</td><td>${escapeHtml(CATEGORY_LABELS[expense.categoria] ?? expense.categoria)}</td></tr>

                  <tr><td style="padding:6px 0;color:#666">Descrição</td><td>${escapeHtml(expense.descricao)}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Data</td><td>${new Date(expense.data_despesa).toLocaleDateString("pt-PT")}</td></tr>
                  <tr><td style="padding:6px 0;color:#666">Valor</td><td><strong>${fmtEUR(Number(expense.valor))}</strong></td></tr>
                  ${expense.notas_colaborador ? `<tr><td style="padding:6px 0;color:#666">Notas</td><td>${escapeHtml(expense.notas_colaborador)}</td></tr>` : ""}
                  ${expense.notas_aprovacao ? `<tr><td style="padding:6px 0;color:#666">Aprovação</td><td>${escapeHtml(expense.notas_aprovacao)}</td></tr>` : ""}
                </tbody>
              </table>
              ${photoUrl ? `<p style="margin:20px 0"><a href="${photoUrl}" style="background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Ver factura</a></p><p style="font-size:11px;color:#999">Link válido por 7 dias.</p>` : ""}
            </div>
          `;

          // Tenta enviar via Lovable Email
          try {
            const apiKey = process.env.LOVABLE_API_KEY;
            if (apiKey) {
              const resp = await fetch("https://ai.gateway.lovable.dev/v1/email/send", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                  to: TO,
                  subject,
                  html,
                  reply_to: collab?.email || undefined,
                }),
              });
              if (!resp.ok) {
                const txt = await resp.text();
                console.error("Email gateway error:", resp.status, txt);
              }
            }
          } catch (err) {
            console.error("Email send failed:", err);
          }

          return new Response(JSON.stringify({ ok: true }), {
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
