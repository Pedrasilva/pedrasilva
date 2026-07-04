/**
 * Embeds the PSA (PandaDoc-style) Proposal Composer inside the Quote
 * workspace. Looks up an existing psa_proposals row linked to this quote;
 * if none, creates one (seeded with the canonical block library) and then
 * mounts <ComposerShell />.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ComposerShell } from "@/components/psa-composer/composer-shell";
import {
  useCreateProposal,
  useProposal,
  useUpdateProposal,
} from "@/lib/psa-proposal/use-psa-proposal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function QuoteProposalComposerEmbed({
  quoteId,
  quoteTitle,
}: {
  quoteId: string;
  quoteTitle?: string | null;
}) {
  const lookup = useQuery({
    queryKey: ["psa-proposal-by-quote", quoteId],
    queryFn: async (): Promise<{ id: string } | null> => {
      const { data, error } = await sb
        .from("psa_proposals")
        .select("id")
        .eq("quote_id", quoteId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data && data[0]) ?? null;
    },
  });

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

  return ready ? (
    <ProposalTitleSync
      proposalId={proposalId!}
      quoteTitle={quoteTitle ?? null}
    />
  ) : (
    <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
      A preparar o construtor de proposta…
    </div>
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
}: {
  proposalId: string;
  quoteTitle: string | null;
}) {
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

  return <ComposerShell proposalId={proposalId} />;
}
