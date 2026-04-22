import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CrmAccount, FeeProposal } from "@/lib/crm/types";
import { formatEUR, QUOTE_STATUSES } from "@/lib/crm/types";

export const Route = createFileRoute("/_app/crm/accounts/$accountId")({
  component: AccountDetail,
});

function AccountDetail() {
  const { accountId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: account, isLoading } = useQuery({
    queryKey: ["crm_account", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_accounts")
        .select("*, company:companies(id, nome)")
        .eq("id", accountId)
        .single();
      if (error) throw error;
      return data as CrmAccount & { company: { id: string; nome: string } | null };
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["fee_proposals_by_account", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_proposals")
        .select("id, titulo, valor, quote_status, opportunity_id")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pick<FeeProposal, "id" | "titulo" | "valor" | "quote_status" | "opportunity_id">[];
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_accounts").delete().eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account deleted");
      qc.invalidateQueries({ queryKey: ["crm_accounts"] });
      navigate({ to: "/crm/accounts" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!account) return <p className="text-sm text-muted-foreground">Account not found.</p>;

  return (
    <div className="space-y-6">
      <Link
        to="/crm/accounts"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to accounts
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{account.name}</h2>
          <p className="text-sm text-muted-foreground">
            {account.company ? (
              <Link
                to="/crm/companies/$companyId"
                params={{ companyId: account.company.id }}
                className="hover:underline"
              >
                {account.company.nome}
              </Link>
            ) : "—"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Delete this account?")) remove.mutate();
          }}
          disabled={quotes.length > 0}
          title={quotes.length > 0 ? "Cannot delete — quotes are linked" : ""}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Billing details</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{account.billing_details || "—"}</p>
        </CardContent>
      </Card>

      {account.notas && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{account.notas}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Linked quotes ({quotes.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {quotes.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No quotes use this account.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const status = QUOTE_STATUSES.find((s) => s.value === q.quote_status);
                  return (
                    <tr key={q.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link
                          to="/crm/quotes/$quoteId"
                          params={{ quoteId: q.id }}
                          className="font-medium hover:underline"
                        >
                          {q.titulo}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className={`h-2 w-2 rounded-full ${status?.color}`} />
                          {status?.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatEUR(Number(q.valor))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
