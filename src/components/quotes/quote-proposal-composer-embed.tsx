import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Embeds the PSA (PandaDoc-style) Proposal Composer inside the Quote
 * workspace. Looks up an existing psa_proposals row linked to this quote;
 * if none, creates one (seeded with the canonical block library) and then
 * mounts <ComposerShell />.
 */
import { useEffect, useMemo, useRef } from "react";
import { useMainProposal } from "@/lib/psa-proposal/use-main-proposal";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import {
  useCreateProposal,
  useProposal,
  useUpdateProposal,
} from "@/lib/psa-proposal/use-psa-proposal";

export function QuoteProposalComposerEmbed({
  quoteId,
  quoteTitle,
  embedded = false,
}: {
  quoteId: string;
  quoteTitle?: string | null;
  embedded?: boolean;
}) {
  useTranslation();
  const lookup = useMainProposal(quoteId);

  const create = useCreateProposal();
  const proposalId = lookup.data?.id ?? null;

  useEffect(() => {
    if (lookup.isLoading || lookup.isError) return;
    if (proposalId) return;
    if (create.isPending || create.isSuccess) return;
    create.mutate(
      { title: quoteTitle || "Proposta", quoteId },
      {
        onSuccess: () => {
          lookup.refetch();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, lookup.isLoading, lookup.isError]);

  const ready = useMemo(() => !!proposalId, [proposalId]);

  return ready && proposalId ? (
    <ProposalTitleSync
      key={proposalId}
      proposalId={proposalId}
      quoteTitle={quoteTitle ?? null}
      embedded={embedded}
    />
  ) : (
    <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
       {uiI18n.t("crm:quoteEditor.preparingComposer")} </div>
  );
}

/**
 * Keeps the proposal title mirrored to the parent quote title while the
 * proposal is still editable. Once the proposal is sent/locked the title
 * is frozen with the sent snapshot and no longer overwritten.
 */
function ProposalTitleSync({
  proposalId,
  quoteTitle,
  embedded,
}: {
  proposalId: string;
  quoteTitle: string | null;
  embedded: boolean;
}) {
  useTranslation();
  const proposal = useProposal(proposalId);
  const update = useUpdateProposal(proposalId);
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    const p = proposal.data;
    if (!p) return;
    if (p.locked_at || p.status === "sent") return;
    const target = (quoteTitle ?? "").trim();
    if (!target) return;
    if (p.title === target) return;
    if (lastSynced.current === target) return;
    lastSynced.current = target;
    update.mutate({ title: target });
  }, [proposal.data, quoteTitle, update]);

  return <ComposerShell proposalId={proposalId} embedded={embedded} />;
}
