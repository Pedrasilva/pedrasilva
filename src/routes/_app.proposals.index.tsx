/**
 * Proposals index — list of PSA proposals + create button.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useProposalList,
  useCreateProposal,
} from "@/lib/psa-proposal/use-psa-proposal";

export const Route = createFileRoute("/_app/proposals/")({
  component: ProposalsIndex,
});

function ProposalsIndex() {
  const list = useProposalList();
  const create = useCreateProposal();
  const nav = useNavigate();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Propostas PSA</h1>
          <p className="text-sm text-zinc-500">
            Compositor de propostas em estilo CanvaDoc.
          </p>
        </div>
        <Button
          onClick={async () => {
            const p = await create.mutateAsync({});
            nav({
              to: "/proposals/$proposalId/composer",
              params: { proposalId: p.id },
            });
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Nova Proposta
        </Button>
      </div>

      <div className="rounded-md border bg-background">
        {list.isLoading ? (
          <div className="p-6 text-sm text-zinc-500">A carregar...</div>
        ) : !list.data?.length ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Sem propostas. Comece criando uma nova.
          </div>
        ) : (
          <ul className="divide-y">
            {list.data.map((p) => (
              <li key={p.id}>
                <Link
                  to="/proposals/$proposalId/composer"
                  params={{ proposalId: p.id }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <FileText className="h-4 w-4 text-zinc-400" />
                  <div className="flex-1">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-xs text-zinc-500">
                      Estado: {p.status} ·{" "}
                      {new Date(p.updated_at).toLocaleDateString("pt-PT")}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
