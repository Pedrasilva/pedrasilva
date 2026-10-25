import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
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

import { V2PermissionGate } from "@/components/PermissionGate";
export const Route = createFileRoute("/_app/proposals/")({
  component: GuardedProposalsIndex,
});

function ProposalsIndex() {
  useTranslation();
  const list = useProposalList();
  const create = useCreateProposal();
  const nav = useNavigate();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold"> {uiI18n.t("crm:quoteEditor.psaProposals")} </h1>
          <p className="text-sm text-zinc-500">
             {uiI18n.t("crm:quoteEditor.composerDescription")} </p>
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
          <Plus className="mr-1 h-4 w-4" />  {uiI18n.t("crm:quoteEditor.newProposal")} </Button>
      </div>

      <div className="rounded-md border bg-background">
        {list.isLoading ? (
          <div className="p-6 text-sm text-zinc-500"> {uiI18n.t("common:loading")} </div>
        ) : !list.data?.length ? (
          <div className="p-6 text-center text-sm text-zinc-500">
             {uiI18n.t("crm:quoteEditor.noProposals")} </div>
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
                       {uiI18n.t("crm:quoteEditor.statusPrefix")} {uiI18n.t(`crm:composer.status.${uiI18n.t(`crm:composer.status.${p.status}`, { defaultValue: p.status })}`, { defaultValue: p.status })} ·{" "}
                      {new Date(p.updated_at).toLocaleDateString(uiI18n.language)}
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

function GuardedProposalsIndex() {
  useTranslation();
  return (
    <V2PermissionGate permission="crm.pipeline.view" scope="own">
      <ProposalsIndex />
    </V2PermissionGate>
  );
}
