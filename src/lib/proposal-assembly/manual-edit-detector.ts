/**
 * Manual-edit detection for assembled proposal blocks.
 *
 * Compares a stored block (as currently persisted in
 * `quote_proposal_document_blocks`) against the deterministic output of a
 * fresh assembly run. When a block's content diverges from its seeded
 * content, we flag it as "manually edited". Aggregated across many proposals
 * this surfaces the templates users repeatedly rewrite — a direct signal
 * for preset and narrative refinement (V1 spec §7).
 *
 * Pure / read-only. No mutation, no I/O. Intended for use by QA scripts,
 * a future "weak templates" admin view, or telemetry rollups.
 */
import type { AssembledProposal, ProposalContainer, ProposalBlockSeed } from "./types";

export interface StoredBlock {
  /** Matches `assembly_section_id` written by the assembler at insert time. */
  assemblySectionId: string;
  /** Matches `ProposalBlockSeed.localId` recorded in `assembly_provenance.localId`. */
  localId: string;
  content: string;
}

export interface EditFinding {
  containerId: string;
  sectionId: string;
  localId: string;
  status: "unchanged" | "edited" | "missing";
  /** Crude similarity ratio in [0, 1] between stored and seeded content. */
  similarity: number;
  seededLength: number;
  storedLength: number;
}

export interface EditReport {
  findings: EditFinding[];
  editedCount: number;
  unchangedCount: number;
  missingCount: number;
  /** Section ids sorted by edit-frequency descending — refinement candidates. */
  hotspots: Array<{ sectionId: string; editedCount: number }>;
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Bigram Dice coefficient — cheap, deterministic, no deps. Returns 1.0 for
 * identical strings and ~0 for fully divergent ones. We only need a relative
 * signal so this beats pulling in a diff library.
 */
function similarity(a: string, b: string): number {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const A = bigrams(na);
  const B = bigrams(nb);
  let overlap = 0;
  for (const [g, count] of A) {
    const other = B.get(g);
    if (other) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (na.length - 1 + nb.length - 1);
}

const EDIT_THRESHOLD = 0.92;

export function detectManualEdits(
  assembled: AssembledProposal,
  stored: StoredBlock[],
): EditReport {
  const storedIndex = new Map<string, StoredBlock>();
  for (const s of stored) {
    storedIndex.set(`${s.assemblySectionId}::${s.localId}`, s);
  }

  const findings: EditFinding[] = [];
  for (const container of assembled.containers as ProposalContainer[]) {
    for (const seed of container.blocks as ProposalBlockSeed[]) {
      const key = `${container.sectionId}::${seed.localId}`;
      const found = storedIndex.get(key);
      if (!found) {
        findings.push({
          containerId: container.id,
          sectionId: container.sectionId,
          localId: seed.localId,
          status: "missing",
          similarity: 0,
          seededLength: seed.content.length,
          storedLength: 0,
        });
        continue;
      }
      const sim = similarity(seed.content, found.content);
      findings.push({
        containerId: container.id,
        sectionId: container.sectionId,
        localId: seed.localId,
        status: sim >= EDIT_THRESHOLD ? "unchanged" : "edited",
        similarity: Math.round(sim * 1000) / 1000,
        seededLength: seed.content.length,
        storedLength: found.content.length,
      });
    }
  }

  const hotspotMap = new Map<string, number>();
  let editedCount = 0;
  let unchangedCount = 0;
  let missingCount = 0;
  for (const f of findings) {
    if (f.status === "edited") {
      editedCount++;
      hotspotMap.set(f.sectionId, (hotspotMap.get(f.sectionId) ?? 0) + 1);
    } else if (f.status === "unchanged") {
      unchangedCount++;
    } else {
      missingCount++;
    }
  }

  const hotspots = [...hotspotMap.entries()]
    .map(([sectionId, count]) => ({ sectionId, editedCount: count }))
    .sort((a, b) => b.editedCount - a.editedCount);

  return { findings, editedCount, unchangedCount, missingCount, hotspots };
}
