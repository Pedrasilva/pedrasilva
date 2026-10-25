import { SOURCE_UI_KEYS, RELEVANCE_UI_KEYS } from "./editor-labels";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Block settings panel — right sidebar.
 *
 * Lets the user edit title, source_type, source_ref (quote id), rich content,
 * contract_relevance, visibility, lock, per-block page-break-before, plus
 * stage selection for the Individual Stage block and a deliverables list.
 */
import { useEffect, useRef, useState } from "react";
import { canResetBlockTitle, resolveBlockTitle, standardBlockTitleForStorage } from "@/lib/psa-proposal/system-titles";
import { resolveProposalLang } from "@/lib/psa-proposal/live-data";
import { Copy, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateBlock,
  useDeleteBlock,
  useDuplicateBlock,
} from "@/lib/psa-proposal/use-psa-proposal";
import {
  RELEVANCE_LABEL,
  SOURCE_LABEL,
  type PsaContractRelevance,
  type PsaProposalBlock,
  type PsaSourceType,
} from "@/lib/psa-proposal/types";
import { RelevanceBadge } from "./relevance-badge";
import { RichTextEditor } from "./rich-text-editor";
import { useLiveQuoteSnapshot, type LiveStage } from "@/lib/psa-proposal/live-data";
import { buildTokenPickerEntries } from "@/lib/psa-proposal/tokens";
import { ProposalStylePanel } from "./proposal-style-panel";
import type { PsaProposal } from "@/lib/psa-proposal/types";
import {
  buildStageNumberMap,
  compareWbsNumbers,
  formatStageLabel,
} from "@/lib/quotes/stage-numbering";
import {
  useProposalImages,
  useUploadProposalImage,
  useSignedProposalImageUrl,
} from "@/lib/psa-proposal/use-proposal-images";

/** Label row with an inline on/off switch controlling section visibility. */
function SectionLabel({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  useTranslation();
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">
          {checked ? uiI18n.t("common:on") : uiI18n.t("common:off")}
        </span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  );
}


export function BlockSettingsPanel({
  proposalId,
  proposal,
  quoteIdHint,
  block,
}: {
  proposalId: string;
  proposal: PsaProposal;
  quoteIdHint: string | null;
  block: PsaProposalBlock | null;
}) {
  useTranslation();
  const update = useUpdateBlock(proposalId);
  const del = useDeleteBlock(proposalId);
  const dup = useDuplicateBlock(proposalId);

  const lang = resolveProposalLang(proposal.language);
  // Standard headings are shown in the proposal language; saving only
  // happens when the user actually types something different.
  const shownTitle = block ? resolveBlockTitle(block.block_type, block.title, lang) : "";
  const [title, setTitle] = useState(shownTitle);
  const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitle(shownTitle);
  }, [block?.id, shownTitle]);

  // Debounced autosave for the title so a refresh mid-edit doesn't lose it.
  useEffect(() => {
    if (!block) return;
    if (title === shownTitle) return;
    if (titleDebounce.current) clearTimeout(titleDebounce.current);
    titleDebounce.current = setTimeout(() => {
      update.mutate({ id: block.id, patch: { title } });
    }, 600);
    return () => {
      if (titleDebounce.current) clearTimeout(titleDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, block?.id]);

  // Always call hooks — pass null when no block to keep order stable.
  const sourceRef = (block?.source_ref ?? {}) as { quote_id?: string; stage_id?: string; parent_stage_id?: string };
  // Imported templates can carry a quote id from their source proposal.
  // Only accept a block-level reference when it belongs to this proposal.
  const effectiveQuoteId = sourceRef.quote_id === quoteIdHint ? sourceRef.quote_id : quoteIdHint ?? "";
  const liveQuery = useLiveQuoteSnapshot(effectiveQuoteId || null);

  // Number stages with the WBS/Gantt scheme and sort by that number so the
  // dropdown mirrors the Gantt outline exactly.
  const numberedStages = (() => {
    const raw = liveQuery.data?.stages ?? [];
    const numberable = raw.map((s: LiveStage) => ({
      id: s.id,
      name: s.name,
      sort_order: s.sortOrder,
      parent_stage_id: s.parentStageId,
    }));
    const numMap = buildStageNumberMap(numberable);
    return [...raw]
      .sort((a, b) => compareWbsNumbers(numMap.get(a.id), numMap.get(b.id)))
      .map((s) => ({ stage: s, number: numMap.get(s.id) }));
  })();

  if (!block) {
    return (
      <aside className="flex h-full w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-muted/30 p-3 text-sm xl:w-80">
        <ProposalStylePanel proposal={proposal} />
        <div className="mt-2 rounded-md border border-dashed bg-background/60 p-2 text-[11px] text-zinc-500">
           {uiI18n.t("crm:quoteEditor.selectBlockHint")} </div>
      </aside>
    );
  }

  const html = (block.content_rich?.html as string | undefined) ?? "";
  const legacyText = (block.content_rich?.text as string | undefined) ?? "";
  const pageBreakBefore = Boolean(
    (block.content_rich as { pageBreakBefore?: boolean } | undefined)?.pageBreakBefore,
  );

  const supportsRich =
    block.source_type === "manual" ||
    block.source_type === "library" ||
    block.source_type === "mixed" ||
    block.block_type === "stage_item" ||
    block.block_type === "stage_list" ||
    block.block_type === "timeline" ||
    block.block_type === "fee_table" ||
    block.block_type === "supplier_fee_table" ||
    block.block_type === "optional_fee_table";



  return (
    <aside className="flex h-full w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-muted/30 p-3 text-sm xl:w-80">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
           {uiI18n.t("crm:quoteEditor.blockSettings")} </div>
        <RelevanceBadge value={block.contract_relevance} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("common:title")} </Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() =>
            title !== shownTitle &&
            update.mutate({ id: block.id, patch: { title } })
          }
        />
        {canResetBlockTitle(block.block_type, block.title) && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-[11px]"
            onClick={() => {
              const std = standardBlockTitleForStorage(block.block_type);
              if (titleDebounce.current) clearTimeout(titleDebounce.current);
              if (std) update.mutate({ id: block.id, patch: { title: std } });
            }}
          >
            {lang === "en" ? uiI18n.t("crm:quoteEditor.resetTitle") : uiI18n.t("crm:quoteEditor.resetTitle")}
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.sourceType")} </Label>
        <Select
          value={block.source_type}
          onValueChange={(v) =>
            update.mutate({
              id: block.id,
              patch: { source_type: v as PsaSourceType },
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SOURCE_LABEL) as PsaSourceType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {uiI18n.t(SOURCE_UI_KEYS[k])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(block.source_type === "live_quote" || block.source_type === "mixed") && (
        <div className="space-y-1">
          <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.quoteIdSource")} </Label>
          <Input
            value={effectiveQuoteId}
            onChange={(e) =>
              update.mutate({
                id: block.id,
                patch: {
                  source_ref: { ...sourceRef, quote_id: e.target.value },
                },
              })
            }
            placeholder={uiI18n.t("crm:quoteEditor.quoteUuid")}
          />
        </div>
      )}

      {block.block_type === "stage_item" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.quoteStage")} </Label>
            <Select
              value={sourceRef.stage_id ?? ""}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { source_ref: { ...sourceRef, stage_id: v } },
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={uiI18n.t("crm:quoteEditor.chooseStage")} />
              </SelectTrigger>
              <SelectContent>
                {numberedStages.map(({ stage: s, number }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatStageLabel({ id: s.id, name: s.name }, number)}
                  </SelectItem>
                ))}
                {!liveQuery.data?.stages?.length && (
                  <div className="px-2 py-1.5 text-xs text-zinc-500">
                     {uiI18n.t("crm:quoteEditor.setQuoteIdHint")} </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs"> {uiI18n.t("common:content")} </Label>
            <RichTextEditor
              value={html || (legacyText ? `<p>${legacyText.replace(/\n/g, "</p><p>")}</p>` : "")}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), html, text },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.stageDescriptionHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
            <p className="text-[10px] text-zinc-500">
               {uiI18n.t("crm:quoteEditor.usePrefix")} <code className="rounded bg-zinc-100 px-1">{"{{token}}"}</code>  {uiI18n.t("crm:quoteEditor.insertQuoteSuffix")} </p>
          </div>

          <div className="space-y-1">
            <SectionLabel
              label={uiI18n.t("common:objective")}
              checked={(block.content_rich?.show_objective as boolean | undefined) ?? true}
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { content_rich: { ...(block.content_rich ?? {}), show_objective: v } },
                })
              }
            />
            <RichTextEditor
              value={(block.content_rich?.objective_html as string | undefined) ?? ""}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      objective_html: html,
                      objective_text: text,
                    },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.stageObjectiveHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
          </div>

          <div className="space-y-1">
            <SectionLabel
              label={uiI18n.t("crm:quoteEditor.keyActivities")}
              checked={(block.content_rich?.show_key_activities as boolean | undefined) ?? true}
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { content_rich: { ...(block.content_rich ?? {}), show_key_activities: v } },
                })
              }
            />
            <RichTextEditor
              value={(block.content_rich?.key_activities_html as string | undefined) ?? ""}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      key_activities_html: html,
                      key_activities_text: text,
                    },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.activitiesHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
          </div>

          <div>
            <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.deliverables")} </Label>
            <Textarea
              rows={10}
              className="min-h-[220px]"
              value={(block.content_rich?.deliverables as string | undefined) ?? ""}
              onChange={(e) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      deliverables: e.target.value,
                    },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.deliverablesHint")}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-background p-2">
            <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showClientInfo")} </Label>
            <Switch
              checked={
                (block.content_rich?.client_info_visible as boolean | undefined) ?? true
              }
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      client_info_visible: v,
                    },
                  },
                })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-background p-2">
            <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showResourcesTable")} </Label>
            <Switch
              checked={
                (block.content_rich?.resources_visible as boolean | undefined) ?? true
              }
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      resources_visible: v,
                    },
                  },
                })
              }
            />
          </div>


          {((block.content_rich?.client_info_visible as boolean | undefined) ?? true) && (
            <div>
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.clientInfoLines")} </Label>
              <Textarea
                rows={5}
                value={(block.content_rich?.client_info as string | undefined) ?? ""}
                onChange={(e) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: {
                        ...(block.content_rich ?? {}),
                        client_info: e.target.value,
                      },
                    },
                  })
                }
                placeholder={uiI18n.t("crm:quoteEditor.clientInfoHint")}
              />
            </div>
          )}

          <div className="space-y-1">
            <SectionLabel
              label={uiI18n.t("crm:quoteEditor.stageApproval")}
              checked={(block.content_rich?.show_stage_approval as boolean | undefined) ?? true}
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { content_rich: { ...(block.content_rich ?? {}), show_stage_approval: v } },
                })
              }
            />
            <RichTextEditor
              value={(block.content_rich?.stage_approval_html as string | undefined) ?? ""}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      stage_approval_html: html,
                      stage_approval_text: text,
                    },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.approvalCriteriaHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
          </div>

          <div className="space-y-2 rounded-md border bg-background p-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
               {uiI18n.t("projects:stageSummaryLabel")} </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showSummary")} </Label>
              <Switch
                checked={(block.content_rich?.show_phase_summary_card as boolean | undefined) ?? true}
                onCheckedChange={(v) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: { ...(block.content_rich ?? {}), show_phase_summary_card: v },
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showEstimatedHours")} </Label>
              <Switch
                checked={(block.content_rich?.show_estimated_hours_by_phase as boolean | undefined) ?? true}
                onCheckedChange={(v) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: { ...(block.content_rich ?? {}), show_estimated_hours_by_phase: v },
                    },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.showStageFee")} </Label>
              <Switch
                checked={(block.content_rich?.show_phase_fee_in_scope as boolean | undefined) ?? true}
                onCheckedChange={(v) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: { ...(block.content_rich ?? {}), show_phase_fee_in_scope: v },
                    },
                  })
                }
              />
            </div>

            <div>
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.reviewCycles")} </Label>
              <Input
                type="number"
                min={0}
                value={(block.content_rich?.review_cycles_included as number | undefined) ?? 1}
                onChange={(e) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: {
                        ...(block.content_rich ?? {}),
                        review_cycles_included: e.target.value === "" ? null : Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </div>

            <div>
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.coordinationMeetings")} </Label>
              <Input
                type="number"
                min={0}
                value={
                  block.content_rich?.meetings_included == null
                    ? ""
                    : String(block.content_rich?.meetings_included)
                }
                onChange={(e) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: {
                        ...(block.content_rich ?? {}),
                        meetings_included: e.target.value === "" ? null : Number(e.target.value),
                      },
                    },
                  })
                }
                placeholder="—"
              />
            </div>

            <div>
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.deliveryPackage")} </Label>
              <Input
                value={(block.content_rich?.package_type as string | undefined) ?? ""}
                onChange={(e) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: { ...(block.content_rich ?? {}), package_type: e.target.value },
                    },
                  })
                }
                placeholder={uiI18n.t("crm:quoteEditor.packageHint")}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.clientApprovalRequired")} </Label>
              <Switch
                checked={(block.content_rich?.requires_client_approval as boolean | undefined) ?? true}
                onCheckedChange={(v) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: { ...(block.content_rich ?? {}), requires_client_approval: v },
                    },
                  })
                }
              />
            </div>

            <div>
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.cgiIncluded")} </Label>
              <Input
                type="number"
                min={0}
                value={
                  block.content_rich?.cgi_count == null
                    ? ""
                    : String(block.content_rich?.cgi_count)
                }
                onChange={(e) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: {
                        ...(block.content_rich ?? {}),
                        cgi_count: e.target.value === "" ? null : Number(e.target.value),
                      },
                    },
                  })
                }
                placeholder="0"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bimActive")} </Label>
              <Switch
                checked={(block.content_rich?.bim_enabled as boolean | undefined) ?? false}
                onCheckedChange={(v) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: { ...(block.content_rich ?? {}), bim_enabled: v, show_bim_lod_by_phase: v },
                    },
                  })
                }
              />
            </div>

            {((block.content_rich?.bim_enabled as boolean | undefined) ?? false) && (
              <div>
                <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.bimLod")} </Label>
                <Input
                  value={(block.content_rich?.bim_lod as string | undefined) ?? ""}
                  onChange={(e) =>
                    update.mutate({
                      id: block.id,
                      patch: {
                        content_rich: { ...(block.content_rich ?? {}), bim_lod: e.target.value },
                      },
                    })
                  }
                  placeholder={uiI18n.t("crm:quoteEditor.lodHint")}
                />
              </div>
            )}
          </div>
        </div>
      )}


      {(block.block_type === "gantt_partial" ||
        block.block_type === "gantt_design" ||
        block.block_type === "gantt_construction") && (
        <div className="space-y-1">
          <Label className="text-xs">
             {uiI18n.t("crm:quoteEditor.parentStage")} {block.block_type === "gantt_partial" ? uiI18n.t("crm:quoteEditor.requiredParenthesis") : uiI18n.t("crm:quoteEditor.overrideParenthesis")}
          </Label>
          <Select
            value={sourceRef.parent_stage_id ?? ""}
            onValueChange={(v) =>
              update.mutate({
                id: block.id,
                patch: {
                  source_ref: {
                    ...sourceRef,
                    parent_stage_id: v === "__auto__" ? undefined : v,
                  },
                },
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={uiI18n.t("crm:quoteEditor.chooseParent")} />
            </SelectTrigger>
            <SelectContent>
              {block.block_type !== "gantt_partial" && (
                <SelectItem value="__auto__"> {uiI18n.t("common:automatic")} </SelectItem>
              )}
              {numberedStages
                .filter(({ stage: s }) => s.isSelf && !s.isMilestone)
                .map(({ stage: s, number }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {formatStageLabel({ id: s.id, name: s.name }, number)}
                  </SelectItem>
                ))}
              {!liveQuery.data?.stages?.length && (
                <div className="px-2 py-1.5 text-xs text-zinc-500">
                   {uiI18n.t("crm:quoteEditor.setQuoteIdHint")} </div>
              )}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-zinc-500">
             {uiI18n.t("crm:quoteEditor.partialGanttHint")} </p>
        </div>
      )}

      {supportsRich && block.block_type !== "stage_item" && block.block_type !== "optional_fee_table" && (
        <div className="space-y-1">
          <Label className="text-xs"> {uiI18n.t("common:content")} </Label>
          <RichTextEditor
            value={html || (legacyText ? `<p>${legacyText.replace(/\n/g, "</p><p>")}</p>` : "")}
            onChange={({ html, text }) =>
              update.mutate({
                id: block.id,
                patch: {
                  content_rich: { ...(block.content_rich ?? {}), html, text },
                },
              })
            }
            placeholder={uiI18n.t("crm:quoteEditor.writeBlockHint")}
            tokenEntries={buildTokenPickerEntries(liveQuery.data)}
          />
          <p className="text-[10px] text-zinc-500">
             {uiI18n.t("crm:quoteEditor.richTextHint")} {" "}
            <code className="rounded bg-zinc-100 px-1">{"{{token}}"}</code>  {uiI18n.t("crm:quoteEditor.insertMenuSuffix")} </p>
        </div>
      )}

      {block.block_type === "optional_fee_table" && (() => {
        const allStages = liveQuery.data?.stages ?? [];
        const byId = new Map(allStages.map((s) => [s.id, s]));
        const isOptional = (s: LiveStage): boolean => {
          let cur: LiveStage | undefined = s;
          const seen = new Set<string>();
          while (cur && !seen.has(cur.id)) {
            if (cur.isOptional) return true;
            seen.add(cur.id);
            cur = cur.parentStageId ? byId.get(cur.parentStageId) : undefined;
          }
          return false;
        };
        const optionalRoots = allStages.filter(
          (s) => !s.isMilestone && isOptional(s) &&
            (!s.parentStageId || !isOptional(byId.get(s.parentStageId)!)),
        );
        const current = (block.source_ref as { stage_id?: string } | undefined)?.stage_id ?? "__all__";
        return (
          <div className="space-y-1">
            <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.optionalRoot")} </Label>
            <Select
              value={current}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    source_ref: {
                      ...sourceRef,
                      stage_id: v === "__all__" ? undefined : v,
                    },
                  },
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__"> {uiI18n.t("crm:quoteEditor.allOptionalStages")} </SelectItem>
                {optionalRoots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code ? `${s.code} — ${s.name}` : s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-zinc-500">
               {uiI18n.t("crm:quoteEditor.optionalStageHint")} </p>
          </div>
        );
      })()}

      {block.block_type === "image" && (
        <ImageBlockPanel
          block={block}
          onPatch={(patch) =>
            update.mutate({
              id: block.id,
              patch: { content_rich: { ...(block.content_rich ?? {}), ...patch } },
            })
          }
        />
      )}

      {(block.block_type === "optional_fee_table" || block.block_type === "custom_text") && (
        <div className="space-y-3">
          <div className="space-y-1">
            <SectionLabel
              label={uiI18n.t("common:objective")}
              checked={(block.content_rich?.show_objective as boolean | undefined) ?? true}
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { content_rich: { ...(block.content_rich ?? {}), show_objective: v } },
                })
              }
            />
            <RichTextEditor
              value={(block.content_rich?.objective_html as string | undefined) ?? ""}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      objective_html: html,
                      objective_text: text,
                    },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.optionalObjectiveHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
          </div>
          <div className="space-y-1">
            <SectionLabel
              label={uiI18n.t("crm:quoteEditor.includedScope")}
              checked={(block.content_rich?.show_scope_includes as boolean | undefined) ?? true}
              onCheckedChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: { content_rich: { ...(block.content_rich ?? {}), show_scope_includes: v } },
                })
              }
            />
            <RichTextEditor
              value={(block.content_rich?.scope_html as string | undefined) ?? ""}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: {
                      ...(block.content_rich ?? {}),
                      scope_html: html,
                      scope_text: text,
                    },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.scopeListHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
          </div>
        </div>
      )}

      {(block.block_type === "appendix_index" ||
        block.block_type === "appendix_payment_schedule" ||
        block.block_type === "appendix_gantt" ||
        block.block_type === "appendix_general_terms") && (
        <div className="space-y-3 rounded-md border border-dashed bg-background/60 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
             {uiI18n.t("crm:quoteEditor.appendix")} </div>
          {block.block_type !== "appendix_index" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.letter")} </Label>
                  <Input
                    value={(block.content_rich?.appendix_letter as string | undefined) ?? ""}
                    onChange={(e) =>
                      update.mutate({
                        id: block.id,
                        patch: {
                          content_rich: {
                            ...(block.content_rich ?? {}),
                            appendix_letter: e.target.value.toUpperCase(),
                          },
                        },
                      })
                    }
                    placeholder="A"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Switch
                    checked={(block.content_rich?.enabled as boolean | undefined) ?? true}
                    onCheckedChange={(v) =>
                      update.mutate({
                        id: block.id,
                        patch: {
                          content_rich: {
                            ...(block.content_rich ?? {}),
                            enabled: v,
                          },
                        },
                      })
                    }
                  />
                  <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.active")} </Label>
                </div>
              </div>
            </>
          )}
          {block.block_type === "appendix_gantt" && (
            <div className="space-y-1">
              <Label className="text-xs"> {uiI18n.t("common:orientation")} </Label>
              <Select
                value={
                  (block.content_rich?.page_orientation as string | undefined) ??
                  "auto"
                }
                onValueChange={(v) =>
                  update.mutate({
                    id: block.id,
                    patch: {
                      content_rich: {
                        ...(block.content_rich ?? {}),
                        page_orientation: v,
                      },
                    },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto"> {uiI18n.t("common:automatic")} </SelectItem>
                  <SelectItem value="portrait"> {uiI18n.t("crm:quoteEditor.a4Portrait")} </SelectItem>
                  <SelectItem value="a3-landscape"> {uiI18n.t("crm:quoteEditor.a3Landscape")} </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.introduction")} </Label>
            <RichTextEditor
              value={(block.content_rich?.html as string | undefined) ?? ""}
              onChange={({ html, text }) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), html, text },
                  },
                })
              }
              placeholder={uiI18n.t("crm:quoteEditor.appendixIntroHint")}
              tokenEntries={buildTokenPickerEntries(liveQuery.data)}
            />
            <p className="text-[10px] text-zinc-500">
               {uiI18n.t("crm:quoteEditor.appendixIntroHelp")} </p>
          </div>
        </div>
      )}




      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.contractRelevance")} </Label>
        <Select
          value={block.contract_relevance}
          onValueChange={(v) =>
            update.mutate({
              id: block.id,
              patch: { contract_relevance: v as PsaContractRelevance },
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RELEVANCE_LABEL) as PsaContractRelevance[]).map((k) => (
              <SelectItem key={k} value={k}>
                {uiI18n.t(RELEVANCE_UI_KEYS[k])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.visible")} </Label>
        <Switch
          checked={block.is_visible}
          onCheckedChange={(v) =>
            update.mutate({ id: block.id, patch: { is_visible: v } })
          }
        />
      </div>
      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.layoutLocked")} </Label>
        <Switch
          checked={block.is_locked}
          onCheckedChange={(v) =>
            update.mutate({ id: block.id, patch: { is_locked: v } })
          }
        />
      </div>
      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.breakBefore")} </Label>
        <Switch
          checked={pageBreakBefore}
          onCheckedChange={(v) =>
            update.mutate({
              id: block.id,
              patch: {
                content_rich: { ...(block.content_rich ?? {}), pageBreakBefore: v },
              },
            })
          }
        />
      </div>
      <div className="flex items-center justify-between rounded-md border bg-background p-2">
        <div className="flex flex-col">
          <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.breakAfter")} </Label>
          <span className="text-[10px] text-zinc-500">
             {uiI18n.t("crm:quoteEditor.breakAfterHint")} </span>
        </div>
        <Switch
          checked={
            ((block.content_rich as { pageBreakAfter?: boolean } | undefined)?.pageBreakAfter) ??
            (block.block_type === "index")
          }
          onCheckedChange={(v) =>
            update.mutate({
              id: block.id,
              patch: {
                content_rich: { ...(block.content_rich ?? {}), pageBreakAfter: v },
              },
            })
          }
        />
      </div>


      <div className="space-y-2 rounded-md border bg-background p-2">
        <Label className="text-xs font-semibold"> {uiI18n.t("crm:quoteEditor.pageAlignment")} </Label>
        <p className="text-[10px] text-zinc-500">
           {uiI18n.t("crm:quoteEditor.pageAlignmentHint")} </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-zinc-500"> {uiI18n.t("common:vertical")} </Label>
            <Select
              value={(block.content_rich?.pageAlignY as string | undefined) ?? "none"}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), pageAlignY: v },
                  },
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none"> {uiI18n.t("common:automatic")} </SelectItem>
                <SelectItem value="top"> {uiI18n.t("crm:quoteEditor.top")} </SelectItem>
                <SelectItem value="middle"> {uiI18n.t("crm:quoteEditor.middle")} </SelectItem>
                <SelectItem value="bottom"> {uiI18n.t("crm:quoteEditor.bottom")} </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-zinc-500"> {uiI18n.t("common:horizontal")} </Label>
            <Select
              value={(block.content_rich?.pageAlignX as string | undefined) ?? "none"}
              onValueChange={(v) =>
                update.mutate({
                  id: block.id,
                  patch: {
                    content_rich: { ...(block.content_rich ?? {}), pageAlignX: v },
                  },
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none"> {uiI18n.t("common:automatic")} </SelectItem>
                <SelectItem value="left"> {uiI18n.t("crm:quoteEditor.left")} </SelectItem>
                <SelectItem value="center"> {uiI18n.t("crm:quoteEditor.center")} </SelectItem>
                <SelectItem value="right"> {uiI18n.t("crm:quoteEditor.right")} </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>


      <div className="mt-auto flex gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => dup.mutate(block)}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("common:duplicate")} </Button>
        <Button
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={() => {
            if (confirm(uiI18n.t("crm:quoteEditor.deleteBlockPrompt"))) del.mutate(block.id);
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />  {uiI18n.t("common:delete")} </Button>
      </div>
    </aside>
  );
}

// ---- Image block settings panel ----

function ImageBlockPanel({
  block,
  onPatch,
}: {
  block: PsaProposalBlock;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  useTranslation();
  const cr = (block.content_rich ?? {}) as Record<string, unknown>;
  const imageId = (cr.image_id as string | undefined) ?? null;
  const size = (cr.size as string | undefined) ?? "1/2";
  const caption = (cr.caption as string | undefined) ?? "";
  const images = useProposalImages();
  const upload = useUploadProposalImage();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const selected = imageId ? images.data?.find((i) => i.id === imageId) : null;
  const selectedSigned = useSignedProposalImageUrl(
    selected?.storage_path ?? null,
    selected?.bucket,
  );

  const handleFile = async (f: File | null | undefined) => {
    if (!f) return;
    const entry = await upload.mutateAsync({ file: f });
    onPatch({ image_id: entry.id });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("common:size")} </Label>
        <Select value={size} onValueChange={(v) => onPatch({ size: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1/4"> {uiI18n.t("crm:quoteEditor.quarterPage")} </SelectItem>
            <SelectItem value="1/3"> {uiI18n.t("crm:quoteEditor.thirdPage")} </SelectItem>
            <SelectItem value="1/2"> {uiI18n.t("crm:quoteEditor.halfPage")} </SelectItem>
            <SelectItem value="2/3"> {uiI18n.t("crm:quoteEditor.twoThirdsPage")} </SelectItem>
            <SelectItem value="full"> {uiI18n.t("crm:quoteEditor.fullPage")} </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs"> {uiI18n.t("crm:quoteEditor.optionalCaption")} </Label>
        <Input
          value={caption}
          onChange={(e) => onPatch({ caption: e.target.value })}
          placeholder={uiI18n.t("common:caption")}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs"> {uiI18n.t("common:image")} </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? uiI18n.t("common:uploading") : uiI18n.t("crm:quoteEditor.uploadNew")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        {selected && (
          <div className="rounded border bg-background p-2 text-[11px]">
            <div className="mb-1 font-medium"> {uiI18n.t("common:selectedPrefix")} {selected.name}</div>
            {selectedSigned.data && (
              <img
                src={selectedSigned.data}
                alt={selected.name}
                className="max-h-32 w-full rounded object-cover"
              />
            )}
          </div>
        )}

        <div className="mt-2 max-h-72 overflow-auto rounded border">
          <div className="grid grid-cols-2 gap-1 p-1">
            {(images.data ?? []).map((img) => (
              <ImageThumb
                key={img.id}
                entry={img}
                selected={img.id === imageId}
                onSelect={() => onPatch({ image_id: img.id })}
              />
            ))}
            {!images.data?.length && (
              <div className="col-span-2 p-3 text-center text-[11px] text-zinc-500">
                 {uiI18n.t("crm:quoteEditor.emptyImageLibrary")} </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageThumb({
  entry,
  selected,
  onSelect,
}: {
  entry: import("@/lib/psa-proposal/use-proposal-images").PsaImageLibraryEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  useTranslation();
  const signed = useSignedProposalImageUrl(entry.storage_path, entry.bucket);
  return (
    <button
      type="button"
      onClick={onSelect}
      title={entry.name}
      className={`group relative overflow-hidden rounded border ${selected ? "border-blue-500 ring-2 ring-blue-300" : "border-zinc-200 hover:border-zinc-400"}`}
    >
      {signed.data ? (
        <img
          src={signed.data}
          alt={entry.name}
          className="h-20 w-full object-cover"
        />
      ) : (
        <div className="h-20 w-full bg-zinc-100" />
      )}
      <div className="truncate px-1 py-0.5 text-[10px] text-zinc-600">
        {entry.name}
      </div>
    </button>
  );
}

