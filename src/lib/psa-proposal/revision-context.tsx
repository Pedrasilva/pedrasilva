/**
 * Historical revision context.
 *
 * When a user opens a past *sent* revision, the whole composer subtree is
 * wrapped in `<RevisionProvider>`. Every renderer keeps calling
 * `useLiveQuoteSnapshot()` / `useProposalBlocks()` as usual, but those hooks
 * transparently return the payload frozen at send time instead of hitting the
 * database — so the view is exactly what was sent, unaffected by later edits.
 *
 * This mode is strictly DISPLAY-ONLY: nothing here ever writes.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LiveQuoteSnapshot, ProposalLang } from "./live-data";
import type { PsaProposal, PsaProposalBlock } from "./types";

export const QUOTE_SNAPSHOT_SCHEMA_VERSION = 1;

/** Frozen quote payload stored inside `psa_proposal_snapshots.snapshot.quote_data`. */
export type FrozenQuoteData = {
  schema_version: number;
  captured_at: string;
  /** Derived payload per language — what the renderers consume. */
  resolved: Partial<Record<ProposalLang, LiveQuoteSnapshot>>;
  /** Verbatim source rows, kept for audit/forensics only. */
  raw?: Record<string, unknown>;
};

export type RevisionSnapshotPayload = {
  proposal: PsaProposal;
  blocks: PsaProposalBlock[];
  quote_data?: FrozenQuoteData | null;
};

export type HistoricalRevision = {
  id: string;
  revNumber: number;
  sentAt: string;
  pdfStoragePath: string | null;
  pdfFilename: string | null;
  payload: RevisionSnapshotPayload;
};

type Ctx = {
  revision: HistoricalRevision;
  /** null when this revision predates quote snapshotting. */
  quoteData: FrozenQuoteData | null;
};

const RevisionContext = createContext<Ctx | null>(null);

export function RevisionProvider({
  revision,
  children,
}: {
  revision: HistoricalRevision;
  children: ReactNode;
}) {
  const value = useMemo<Ctx>(
    () => ({ revision, quoteData: revision.payload.quote_data ?? null }),
    [revision],
  );
  return <RevisionContext.Provider value={value}>{children}</RevisionContext.Provider>;
}

/** The active historical revision, or null when viewing the live draft. */
export function useHistoricalRevision(): Ctx | null {
  return useContext(RevisionContext);
}

/**
 * Frozen quote snapshot for the requested language, or null when not in
 * historical mode (or when the revision has no captured quote data).
 */
export function useFrozenQuoteSnapshot(
  lang: ProposalLang = "pt-PT",
): LiveQuoteSnapshot | null {
  const ctx = useContext(RevisionContext);
  return useMemo(() => {
    if (!ctx?.quoteData) return null;
    const resolved =
      ctx.quoteData.resolved?.[lang] ??
      ctx.quoteData.resolved?.["pt-PT"] ??
      ctx.quoteData.resolved?.["en"] ??
      null;
    if (!resolved) return null;
    return {
      ...resolved,
      revision: {
        number: ctx.revision.revNumber,
        sentAt: ctx.revision.sentAt,
        isDraft: false,
      },
    };
  }, [ctx, lang]);
}

/** Frozen blocks for the active historical revision, or null in live mode. */
export function useFrozenBlocks(): PsaProposalBlock[] | null {
  const ctx = useContext(RevisionContext);
  return ctx ? ctx.revision.payload.blocks ?? [] : null;
}
