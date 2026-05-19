/**
 * Quote Proposal Intelligence Panel (Milestone 4 — Stage D)
 *
 * Assistive, additive surface that lives inside the existing proposal tab.
 * It calls `useResolvedProposal` and exposes the resolved structure, phase
 * narratives, clauses, commercial notes and cover content as *insertable
 * suggestions*. Inserted items become normal editable blocks via the
 * existing block system — no schema changes, no auto-insertion, no
 * overwrites.
 *
 * Legacy proposals (no ontology metadata): panel renders a small inert hint
 * and offers nothing else.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { useResolvedProposal } from "@/lib/proposal-rendering";
import type {
  ProposalRenderKind,
  RenderTokens,
  ResolvedClause,
  ResolvedPhaseNarrative,
  ResolvedSection,
  ResolvedCommercialNote,
} from "@/lib/proposal-rendering";

import {
  useQuoteProposalDocumentBlocks,
  type QuoteProposalDocumentBlock,
} from "@/lib/quotes/use-quote-proposal-document";
import {
  blockOntologyKey,
  useInsertProposalBlocks,
  type InsertableBlock,
} from "@/lib/quotes/use-insert-proposal-blocks";

interface Props {
  quoteId: string;
  documentId: string | undefined;
  proposalKind: ProposalRenderKind;
  tokens?: RenderTokens;
}

// Stable ontology keys we store on `generated_content.ontology_section_key`.
const sectionKey = (s: ResolvedSection) => `section:${s.id}`;
const phaseKey = (p: ResolvedPhaseNarrative) => `phase:${p.phaseCode}`;
const clauseKey = (c: ResolvedClause) => `clause:${c.code}`;
const commercialKey = (c: ResolvedCommercialNote) => `commercial:${c.code}`;
const COVER_PAGE_KEY = "cover:page";
const COVER_LETTER_KEY = "cover:letter";

function bulletJoin(items: string[]): string {
  return items.filter(Boolean).map((s) => `• ${s}`).join("\n");
}

function phaseBody(p: ResolvedPhaseNarrative, labels: {
  outputs: string;
  deliverables: string;
  exclusions: string;
  notes: string;
  coordination: string;
}): string {
  const parts: string[] = [];
  if (p.purpose) parts.push(p.purpose);
  if (p.coordinationScope) {
    parts.push(`${labels.coordination}\n${p.coordinationScope}`);
  }
  if (p.outputs.length) parts.push(`${labels.outputs}\n${bulletJoin(p.outputs)}`);
  if (p.deliverables.length)
    parts.push(`${labels.deliverables}\n${bulletJoin(p.deliverables)}`);
  if (p.exclusions.length)
    parts.push(`${labels.exclusions}\n${bulletJoin(p.exclusions)}`);
  if (p.notes.length) parts.push(`${labels.notes}\n${bulletJoin(p.notes)}`);
  return parts.join("\n\n");
}

function coverLetterBody(paragraphs: string[], closing: string, signatory: string) {
  return [...paragraphs, "", closing, signatory].join("\n\n");
}

function coverPageBody(cover: {
  subtitle: string;
  client: string;
  project: string;
  familyLabel: string;
  proposalCode: string;
  isoDate: string;
}): string {
  return [
    cover.subtitle,
    "",
    cover.project,
    cover.client,
    "",
    cover.familyLabel,
    cover.proposalCode,
    cover.isoDate,
  ]
    .filter((line) => line !== undefined && line !== null)
    .join("\n");
}

export function QuoteProposalIntelligencePanel({
  quoteId,
  documentId,
  proposalKind,
  tokens,
}: Props) {
  const { t } = useTranslation("crm");
  const tr = (k: string, opts?: Record<string, unknown>) =>
    t(`workspace.proposal.intelligence.${k}`, opts);

  const { view, isLoading } = useResolvedProposal({
    quoteId,
    proposalKind,
    tokens,
  });
  const { data: blocks = [] } = useQuoteProposalDocumentBlocks(documentId);
  const insert = useInsertProposalBlocks(documentId);
  const [open, setOpen] = useState(true);

  const existingKeys = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const b of blocks as QuoteProposalDocumentBlock[]) {
      const k = blockOntologyKey(b.generated_content);
      if (k) s.add(k);
    }
    return s;
  }, [blocks]);

  // Legacy / no-ontology proposals: tiny inline hint, no panel.
  if (!isLoading && (!view || !view.applied)) {
    return (
      <p className="text-xs italic text-muted-foreground">
        {tr("legacyHint")}
      </p>
    );
  }

  if (!view) return null;

  const canInsert = Boolean(documentId);

  const phaseLabels = {
    outputs: tr("phase.outputs"),
    deliverables: tr("phase.deliverables"),
    exclusions: tr("phase.exclusions"),
    notes: tr("phase.notes"),
    coordination: tr("phase.coordination"),
  };

  // Build candidate insertables ─────────────────────────────────────
  const sectionItems: InsertableBlock[] = view.structure
    .filter((s) => s.id !== "cover_page" && s.id !== "cover_letter")
    .map((s) => ({
      title: s.title,
      content: s.subtitle ?? "",
      ontologyKey: sectionKey(s),
      kind: "section",
      relatedSectionId: s.id,
    }));

  const phaseItems: InsertableBlock[] = view.phaseNarratives.map((p) => ({
    title: p.aliasLabel ?? p.label,
    content: phaseBody(p, phaseLabels),
    ontologyKey: phaseKey(p),
    kind: "phase_narrative",
    relatedPhaseCode: p.phaseCode,
  }));

  const clauseItems: InsertableBlock[] = view.clauses.map((c) => ({
    title: c.title,
    content: c.body,
    ontologyKey: clauseKey(c),
    kind: "clause",
    relatedClauseKey: c.code,
  }));

  const commercialItems: InsertableBlock[] = view.commercialNotes.map((c) => ({
    title: c.title,
    content: c.body,
    ontologyKey: commercialKey(c),
    kind: "commercial_note",
  }));

  const coverPageItem: InsertableBlock | null = view.cover
    ? {
        title: view.cover.title,
        content: coverPageBody(view.cover),
        ontologyKey: COVER_PAGE_KEY,
        kind: "cover_page",
      }
    : null;

  const coverLetterItem: InsertableBlock | null = view.coverLetter
    ? {
        title: tr("group.coverLetter"),
        content: coverLetterBody(
          [view.coverLetter.greeting, ...view.coverLetter.paragraphs],
          view.coverLetter.closing,
          view.coverLetter.signatory,
        ),
        ontologyKey: COVER_LETTER_KEY,
        kind: "cover_letter",
      }
    : null;

  const insertOne = async (item: InsertableBlock, allowDuplicate = false) => {
    if (!canInsert) return;
    if (!allowDuplicate && existingKeys.has(item.ontologyKey)) {
      if (
        !window.confirm(
          tr("confirmDuplicate", { title: item.title }) as string,
        )
      ) {
        return;
      }
    }
    await insert.mutateAsync({ blocks: [item] });
    toast.success(tr("toastInserted", { title: item.title }) as string);
  };

  const insertMissing = async (items: InsertableBlock[]) => {
    if (!canInsert) return;
    const missing = items.filter((i) => !existingKeys.has(i.ontologyKey));
    if (missing.length === 0) {
      toast.message(tr("nothingMissing") as string);
      return;
    }
    await insert.mutateAsync({ blocks: missing });
    toast.success(tr("toastInsertedMany", { count: missing.length }) as string);
  };

  return (
    <Card className="border-dashed">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              {tr("title")}
              <Badge variant="outline" className="text-[10px]">
                {tr("assistive")}
              </Badge>
            </CardTitle>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <p className="text-xs text-muted-foreground">{tr("subtitle")}</p>
          {!canInsert && (
            <p className="text-xs italic text-muted-foreground">
              {tr("noDocumentHint")}
            </p>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-5 pt-0">
            {/* Cover */}
            {(coverPageItem || coverLetterItem) && (
              <Group title={tr("group.cover")}>
                {coverPageItem && (
                  <Row
                    item={coverPageItem}
                    inserted={existingKeys.has(coverPageItem.ontologyKey)}
                    onInsert={insertOne}
                    disabled={!canInsert || insert.isPending}
                    insertLabel={tr("insert")}
                    insertedLabel={tr("alreadyIn")}
                  />
                )}
                {coverLetterItem && (
                  <Row
                    item={coverLetterItem}
                    inserted={existingKeys.has(coverLetterItem.ontologyKey)}
                    onInsert={insertOne}
                    disabled={!canInsert || insert.isPending}
                    insertLabel={tr("insert")}
                    insertedLabel={tr("alreadyIn")}
                  />
                )}
              </Group>
            )}

            {/* Structure */}
            {sectionItems.length > 0 && (
              <Group
                title={tr("group.structure")}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!canInsert || insert.isPending}
                    onClick={() => insertMissing(sectionItems)}
                  >
                    {tr("insertAllMissing")}
                  </Button>
                }
              >
                {sectionItems.map((it) => {
                  const meta = view.structure.find(
                    (s) => sectionKey(s) === it.ontologyKey,
                  );
                  return (
                    <Row
                      key={it.ontologyKey}
                      item={it}
                      inserted={existingKeys.has(it.ontologyKey)}
                      onInsert={insertOne}
                      disabled={!canInsert || insert.isPending}
                      reason={meta?.reason}
                      tags={meta?.tags}
                      insertLabel={tr("insert")}
                      insertedLabel={tr("alreadyIn")}
                    />
                  );
                })}
              </Group>
            )}

            {/* Phase narratives */}
            {phaseItems.length > 0 && (
              <Group
                title={tr("group.phases")}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!canInsert || insert.isPending}
                    onClick={() => insertMissing(phaseItems)}
                  >
                    {tr("insertAllMissing")}
                  </Button>
                }
              >
                {phaseItems.map((it) => (
                  <Row
                    key={it.ontologyKey}
                    item={it}
                    inserted={existingKeys.has(it.ontologyKey)}
                    onInsert={insertOne}
                    disabled={!canInsert || insert.isPending}
                    insertLabel={tr("insert")}
                    insertedLabel={tr("alreadyIn")}
                  />
                ))}
              </Group>
            )}

            {/* Clauses */}
            {clauseItems.length > 0 && (
              <Group
                title={tr("group.clauses")}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!canInsert || insert.isPending}
                    onClick={() => insertMissing(clauseItems)}
                  >
                    {tr("insertAllMissing")}
                  </Button>
                }
              >
                {clauseItems.map((it, i) => (
                  <Row
                    key={it.ontologyKey}
                    item={it}
                    inserted={existingKeys.has(it.ontologyKey)}
                    onInsert={insertOne}
                    disabled={!canInsert || insert.isPending}
                    reason={view.clauses[i]?.reason}
                    insertLabel={tr("insert")}
                    insertedLabel={tr("alreadyIn")}
                  />
                ))}
              </Group>
            )}

            {/* Commercial notes */}
            {commercialItems.length > 0 && (
              <Group title={tr("group.commercial")}>
                {commercialItems.map((it) => (
                  <Row
                    key={it.ontologyKey}
                    item={it}
                    inserted={existingKeys.has(it.ontologyKey)}
                    onInsert={insertOne}
                    disabled={!canInsert || insert.isPending}
                    insertLabel={tr("insert")}
                    insertedLabel={tr("alreadyIn")}
                  />
                ))}
              </Group>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        {action}
      </div>
      <div className="divide-y rounded-md border bg-muted/20">{children}</div>
    </div>
  );
}

function Row({
  item,
  inserted,
  onInsert,
  disabled,
  reason,
  tags,
  insertLabel,
  insertedLabel,
}: {
  item: InsertableBlock;
  inserted: boolean;
  onInsert: (item: InsertableBlock) => void;
  disabled: boolean;
  reason?: string;
  tags?: string[];
  insertLabel: string;
  insertedLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{item.title}</span>
          {tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
        {reason && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {reason}
          </p>
        )}
      </div>
      {inserted ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5" />
          {insertedLabel}
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={disabled}
          onClick={() => onInsert(item)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {insertLabel}
        </Button>
      )}
    </div>
  );
}
