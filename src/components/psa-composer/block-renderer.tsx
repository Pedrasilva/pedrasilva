/**
 * Block renderer — given a PsaProposalBlock and the resolved LiveQuoteSnapshot,
 * renders the block body inside the A4 print container.
 *
 * Manual / library / mixed blocks render `content_rich.html` (from the TipTap
 * editor) when present, falling back to the legacy plain `content_rich.text`
 * field. Live-data blocks ignore content_rich and reference the snapshot.
 */
import React from "react";
import type { PsaProposalBlock } from "@/lib/psa-proposal/types";
import {
  type LiveQuoteSnapshot,
  type LiveStage,
  type ProposalLang,
  formatCurrencyEUR,
  formatDatePT,
  formatDurationHuman,
  formatDurationCompact,
  formatMonthShort,
  getProposalLabels,
} from "@/lib/psa-proposal/live-data";
import {
  buildTokenMap,
  buildTokenPickerEntries,
  resolveTokens,
} from "@/lib/psa-proposal/tokens";
import { cn } from "@/lib/utils";
import {
  RichTextEditor,
  spacingClass,
  lineHeightClass,
} from "./rich-text-editor";
import {
  PSA_GENERAL_TERMS_HTML_EN,
  PSA_GENERAL_TERMS_HTML_PT,
} from "@/lib/psa-proposal/general-terms-content";


type Spacing = "tight" | "normal" | "relaxed" | "loose";
type LineHeight = "tight" | "normal" | "relaxed" | "loose";

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="proposal-print-heading mb-3 text-lg font-semibold tracking-tight text-zinc-900">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-sm leading-relaxed text-zinc-800">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-zinc-400">{children}</p>;
}

function hasRichContent(html?: string, text?: string) {
  const h = (html ?? "").trim();
  if (h && h !== "<p></p>" && h !== "<p><br></p>") return true;
  if ((text ?? "").trim()) return true;
  return false;
}

function RichContent({
  html,
  text,
  tokenMap,
  paragraphSpacing,
  lineHeight,
}: {
  html?: string;
  text?: string;
  tokenMap?: Record<string, string>;
  paragraphSpacing?: Spacing;
  lineHeight?: LineHeight;
}) {
  const wrapClass = cn(
    "psa-rich text-sm leading-relaxed text-zinc-800 [&_h2]:proposal-print-heading [&_h3]:proposal-print-heading [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-0.5 [&_a]:text-blue-700 [&_a]:underline [&_table]:my-1 [&_table]:w-full [&_table]:border-collapse [&_thead]:hidden [&_th]:border-0 [&_th]:bg-transparent [&_th]:px-0 [&_th]:py-0 [&_th]:text-left [&_th]:font-normal [&_td]:border-0 [&_td]:px-0 [&_td]:py-0 [&_td]:pr-4 [&_td]:align-baseline [&_tr]:leading-relaxed",
    spacingClass(paragraphSpacing),
    lineHeightClass(lineHeight),
  );
  if (html && html.trim() && html !== "<p></p>" && html !== "<p><br></p>") {
    const resolved = tokenMap ? resolveTokens(html, tokenMap).output : html;
    return <div className={wrapClass} dangerouslySetInnerHTML={{ __html: resolved }} />;
  }
  if (text && text.trim()) {
    const resolved = tokenMap
      ? text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k) =>
          Object.prototype.hasOwnProperty.call(tokenMap, k) ? tokenMap[k] : `{{${k}}}`,
        )
      : text;
    return (
      <div className={wrapClass}>
        {resolved.split("\n\n").map((para, i) => (
          <p key={i} className="mb-2">
            {para}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

// Default contractual boilerplate used when a block has no manual content yet.
// Pre-send-safe: clearly neutral PSA language so empty sections do not look
// abandoned in the PDF.
const DEFAULT_TEXT_PT: Partial<Record<string, string>> = {
  about:
    "A Pedra Silva Arquitectos é um atelier de arquitetura com sede em Lisboa, com prática consolidada em projeto, coordenação e acompanhamento de obra. A nossa equipa multidisciplinar acompanha o cliente desde o estudo prévio até à conclusão da obra.",
  scope:
    "A presente proposta abrange os serviços de arquitetura necessários ao desenvolvimento do projeto, incluindo o estudo prévio, anteprojeto, projeto de execução e acompanhamento de obra, conforme detalhado nas fases descritas neste documento.",
  construction_fee:
    "Os honorários da fase de obra são facturados em regime mensal durante a execução, proporcionalmente ao prazo previsto, conforme o plano de pagamentos.",
  payment_terms:
    "Os honorários são facturados de acordo com o plano de pagamentos anexo. Aos valores indicados acresce IVA à taxa legal em vigor. O pagamento deverá ser efectuado no prazo de 30 dias após emissão da factura.",
  additional_services:
    "Quaisquer serviços não incluídos no âmbito desta proposta serão objecto de orçamento adicional, a acordar previamente com o Cliente.",
  general:
    "As condições aqui apresentadas regem-se pela legislação portuguesa aplicável. Qualquer alteração ao âmbito ou ao calendário será formalizada por escrito entre as partes.",
  suspension:
    "Em caso de suspensão do projeto por iniciativa do Cliente, os honorários relativos às fases concluídas e em curso serão integralmente devidos. A rescisão deverá ser comunicada por escrito com 30 dias de antecedência.",
  exclusions:
    "Excluem-se desta proposta: projectos de especialidades não expressamente referidos, levantamentos topográficos, estudos geotécnicos, taxas camarárias, licenças e quaisquer encargos administrativos.",
};

const DEFAULT_TEXT_EN: Partial<Record<string, string>> = {
  about:
    "Pedra Silva Arquitectos is a Lisbon-based architecture practice with an established track record in design, coordination and construction administration. Our multidisciplinary team supports the client from feasibility through to project completion.",
  scope:
    "This proposal covers the architectural services required to develop the project, including preliminary studies, developed design, technical design and construction administration, as detailed in the stages described in this document.",
  construction_fee:
    "Construction-phase fees are invoiced monthly during execution, in proportion to the agreed schedule and in line with the payment plan.",
  payment_terms:
    "Fees are invoiced in accordance with the attached payment schedule. VAT at the applicable legal rate is added to the values shown. Payment is due within 30 days of the invoice date.",
  additional_services:
    "Any services not included within the scope of this proposal will be subject to a separate quote, to be agreed in advance with the Client.",
  general:
    "The terms set out herein are governed by applicable Portuguese law. Any changes to the scope or schedule shall be formalised in writing between the parties.",
  suspension:
    "In the event of suspension of the project by the Client, fees for completed and ongoing stages shall be fully due. Termination shall be notified in writing 30 days in advance.",
  exclusions:
    "The following are excluded from this proposal: specialist engineering disciplines not expressly listed, topographic surveys, geotechnical studies, municipal taxes, licences and any administrative fees.",
};

function StageRows({ stages }: { stages: LiveStage[] }) {
  return (
    <>
      {stages.map((s) => (
        <tr key={s.id} className="border-b border-zinc-100">
          <td className="py-1">{s.name}</td>
          <td className="py-1 text-right">{formatCurrencyEUR(s.fee)}</td>
        </tr>
      ))}
    </>
  );
}

function PhaseSummaryCard({
  stage,
  block,
  lang,
  L,
}: {
  stage: LiveStage;
  block: PsaProposalBlock;
  lang: ProposalLang;
  L: ReturnType<typeof getProposalLabels>;
}) {
  const cr = (block.content_rich ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  };
  const bool = (v: unknown, dflt: boolean): boolean =>
    typeof v === "boolean" ? v : dflt;

  const showCard = bool(cr.show_phase_summary_card, true);
  if (!showCard) return null;

  const showHours = bool(cr.show_estimated_hours_by_phase, true);
  const showFee = bool(cr.show_phase_fee_in_scope, true);
  const showReview = bool(cr.show_review_cycles_by_phase, true);
  const showMeetings = bool(cr.show_meetings_by_phase, true);
  const showCgi = bool(cr.show_cgi_count_by_phase, true);
  const showBim = bool(cr.show_bim_lod_by_phase, false);

  const durationLabel =
    stage.durationDays != null
      ? formatDurationHuman(stage.durationDays, lang)
      : L.toBeDefined;

  const feeLabel =
    stage.fee != null && Number.isFinite(Number(stage.fee))
      ? formatCurrencyEUR(stage.fee, lang)
      : L.toBeDefined;

  const totalHours = (stage.resources ?? []).reduce(
    (sum, r) => sum + Number(r.hours ?? 0),
    0,
  );
  const hoursLabel =
    totalHours > 0
      ? `${new Intl.NumberFormat(lang === "en" ? "en-GB" : "pt-PT", {
          maximumFractionDigits: 0,
        }).format(Math.round(totalHours))} ${L.hoursShort}`
      : null;

  const reviewCycles = num(cr.review_cycles_included) ?? 1;
  const reviewLabel = `${reviewCycles} ${
    reviewCycles === 1 ? L.reviewCycleSingular : L.reviewCyclePlural
  }`;

  const meetings = num(cr.meetings_included);
  const packageType = str(cr.package_type) ?? stage.name;
  const requiresApproval = bool(cr.requires_client_approval, true);
  const cgiCount = num(cr.cgi_count);
  const bimEnabled = bool(cr.bim_enabled, false);
  const bimLod = str(cr.bim_lod);

  type Row = { label: string; value: React.ReactNode };
  const rows: Row[] = [];
  rows.push({ label: L.duration, value: durationLabel });
  if (showFee) rows.push({ label: L.professionalFee, value: feeLabel });
  if (showHours && hoursLabel)
    rows.push({ label: L.teamAllocation, value: hoursLabel });
  if (showMeetings && meetings != null && meetings > 0)
    rows.push({ label: L.coordinationMeetings, value: String(meetings) });
  if (showCgi && cgiCount != null && cgiCount > 0)
    rows.push({ label: L.cgiImagesIncluded, value: String(cgiCount) });
  if (showBim && bimEnabled && bimLod)
    rows.push({ label: L.bimLod, value: bimLod });

  return (
    <div className="proposal-avoid-break mt-8 rounded-md border border-zinc-200 bg-zinc-50/60 p-4">
      <h3 className="proposal-print-heading mb-3 text-sm font-semibold tracking-tight text-zinc-900">
        {L.phaseSummary}
      </h3>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
        {rows.map((r, i) => (
          <React.Fragment key={i}>
            <dt className="text-zinc-500">{r.label}</dt>
            <dd className="text-zinc-900 tabular-nums">{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}


export function BlockBody({
  block,
  live,
  chapterNumber,
  toc,
  editable,
  onPatchContent,
  lang = "pt-PT",
  siblings,
}: {
  block: PsaProposalBlock;
  live: LiveQuoteSnapshot | undefined;
  chapterNumber: number | null;
  toc?: { chapter: number; title: string }[];
  editable?: boolean;
  onPatchContent?: (patch: Record<string, unknown>) => void;
  lang?: ProposalLang;
  siblings?: PsaProposalBlock[];
}) {
  const L = getProposalLabels(lang);

  const text = (block.content_rich?.text as string | undefined) ?? "";
  const html = (block.content_rich?.html as string | undefined) ?? "";
  const paragraphSpacing = block.content_rich?.paragraphSpacing as Spacing | undefined;
  const lineHeight = block.content_rich?.lineHeight as LineHeight | undefined;
  const num = chapterNumber ? `${chapterNumber}. ` : "";
  const richHas = hasRichContent(html, text);
  const tokenMap = buildTokenMap(live);
  const tokenEntries = buildTokenPickerEntries(live);

  const rich =
    editable && onPatchContent ? (
      <RichTextEditor
        value={
          html ||
          (text ? `<p>${text.split("\n\n").join("</p><p>")}</p>` : "")
        }
        onChange={({ html: h, text: t }) => onPatchContent({ html: h, text: t })}
        placeholder="Escreva o conteúdo deste bloco..."
        tokenEntries={tokenEntries}
        paragraphSpacing={paragraphSpacing}
        lineHeight={lineHeight}
        onParagraphSpacingChange={(v) => onPatchContent({ paragraphSpacing: v })}
        onLineHeightChange={(v) => onPatchContent({ lineHeight: v })}
        editorClassName="border-0 rounded-none bg-transparent px-0 py-0 shadow-none focus:ring-0"
      />
    ) : (
      <RichContent
        html={html}
        text={text}
        tokenMap={tokenMap}
        paragraphSpacing={paragraphSpacing}
        lineHeight={lineHeight}
      />
    );

  // Self stages only — PSA-facing tables must exclude supplier rows. The
  // consultants block is the place where suppliers appear.
  const selfStages = (live?.stages ?? []).filter((s) => s.isSelf);

  function fallback(blockType: string) {
    const dict = lang === "en" ? DEFAULT_TEXT_EN : DEFAULT_TEXT_PT;
    const t = dict[blockType];
    if (editable && onPatchContent) {
      return rich;
    }
    return t ? <P>{t}</P> : <Empty>{L.emptyEditRight}</Empty>;
  }


  switch (block.block_type) {
    case "cover":
      return (
        <div className="proposal-cover proposal-avoid-break proposal-page-break-after flex flex-col items-center justify-center py-24 text-center">
          <div className="text-xs tracking-[0.3em] text-zinc-500">
            {L.proposalCover}
          </div>
          <div className="mt-6 text-3xl font-light tracking-tight text-zinc-900">
            {live?.projectName ?? L.project}
          </div>
          {live?.client && (
            <div className="mt-2 text-base text-zinc-700">{live.client}</div>
          )}
          {live?.location && (
            <div className="mt-1 text-sm text-zinc-500">{live.location}</div>
          )}
          <div className="mt-10 text-xs text-zinc-500">
            {live?.projectNumber ? `${L.refPrefix} ${live.projectNumber} · ` : ""}
            {formatDatePT(live?.date, lang)}
          </div>
        </div>
      );

    case "index":
      return (
        <div className="proposal-avoid-break">
          <H>{L.index}</H>
          {toc && toc.length ? (
            <ol className="space-y-1 text-sm text-zinc-800 list-none ml-0">
              {toc.map((e) => (
                <li key={e.chapter} className="flex items-baseline gap-2">
                  <span className="font-medium tabular-nums w-6">{e.chapter}.</span>
                  <span className="flex-1">{e.title}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{L.indexAuto}</Empty>
          )}
        </div>
      );


    case "about":
      return (
        <div>
          <H>{num}{block.title}</H>
          {richHas ? rich : fallback("about")}
        </div>
      );

    case "scope":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.projectDescription && <P>{live.projectDescription}</P>}
          {richHas ? rich : !live?.projectDescription && fallback("scope")}
        </div>
      );

    case "stage_list": {
      const nonMilestone = selfStages.filter((s) => !s.isMilestone);
      const byParent = new Map<string | null, LiveStage[]>();
      for (const s of nonMilestone) {
        const k = s.parentStageId ?? null;
        const arr = byParent.get(k) ?? [];
        arr.push(s);
        byParent.set(k, arr);
      }
      const knownIds = new Set(nonMilestone.map((s) => s.id));
      // Orphans (parent missing or filtered out) → treat as root.
      const roots: LiveStage[] = [];
      for (const s of nonMilestone) {
        if (!s.parentStageId || !knownIds.has(s.parentStageId)) roots.push(s);
      }
      const stageLabel = (s: LiveStage) => (
        <span>{s.code ? `${s.code} — ` : ""}{s.name}</span>
      );

      const renderNode = (s: LiveStage, depth: number): React.ReactNode => {
        const kids = byParent.get(s.id) ?? [];
        if (!kids.length) {
          return <li key={s.id}>{stageLabel(s)}</li>;
        }
        const HeadingTag = depth === 0 ? "h2" : "h3";
        const headingCls =
          depth === 0
            ? "proposal-print-heading mb-1 text-base font-semibold tracking-tight text-zinc-900"
            : "proposal-print-heading mb-1 text-sm font-semibold tracking-tight text-zinc-900";
        const leafKids = kids.filter((k) => !(byParent.get(k.id)?.length));
        const branchKids = kids.filter((k) => (byParent.get(k.id)?.length ?? 0) > 0);
        return (
          <div key={s.id} className={depth === 0 ? "" : "ml-4"}>
            <HeadingTag className={headingCls}>{stageLabel(s)}</HeadingTag>
            {branchKids.length > 0 && (
              <div className="space-y-2">
                {branchKids.map((k) => renderNode(k, depth + 1))}
              </div>
            )}
            {leafKids.length > 0 && (
              <ol className="ml-5 list-decimal space-y-1 text-sm text-zinc-800">
                {leafKids.map((k) => (
                  <li key={k.id}>{stageLabel(k)}</li>
                ))}
              </ol>
            )}
          </div>
        );
      };

      return (
        <div>
          <H>{num}{block.title}</H>
          {richHas && <div className="mb-3">{rich}</div>}
          {nonMilestone.length ? (
            <div className="space-y-3">
              {roots.map((r) => renderNode(r, 0))}
            </div>
          ) : (
            <Empty>{L.noPhasesDefined}</Empty>
          )}
        </div>
      );
    }

    case "stage_item": {
      const stageId = (block.source_ref as { stage_id?: string } | undefined)?.stage_id;
      const stage = stageId ? live?.stages.find((s) => s.id === stageId) : undefined;
      if (!stage) {
        return (
          <div>
            <H>{num}{block.title}</H>
            <Empty>{L.chooseStage}</Empty>
          </div>
        );
      }
      const deliverables = ((block.content_rich?.deliverables as string | undefined) ?? "")
        .split("\n").map((l) => l.trim()).filter(Boolean);
      const clientInfoVisible =
        (block.content_rich?.client_info_visible as boolean | undefined) ?? true;
      const clientInfo = clientInfoVisible
        ? ((block.content_rich?.client_info as string | undefined) ?? "")
            .split("\n").map((l) => l.trim()).filter(Boolean)
        : [];


      const objectiveHtml = (block.content_rich?.objective_html as string | undefined) ?? "";
      const objectiveText = (block.content_rich?.objective_text as string | undefined) ?? "";
      const keyActivitiesHtml = (block.content_rich?.key_activities_html as string | undefined) ?? "";
      const keyActivitiesText = (block.content_rich?.key_activities_text as string | undefined) ?? "";
      const stageApprovalHtml = (block.content_rich?.stage_approval_html as string | undefined) ?? "";
      const stageApprovalText = (block.content_rich?.stage_approval_text as string | undefined) ?? "";
      const showObjective = (block.content_rich?.show_objective as boolean | undefined) ?? true;
      const showKeyActivities = (block.content_rich?.show_key_activities as boolean | undefined) ?? true;
      const showStageApproval = (block.content_rich?.show_stage_approval as boolean | undefined) ?? true;

      const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="proposal-print-heading mb-2 text-sm font-semibold tracking-tight text-zinc-900">
          {children}
        </h3>
      );

      return (
        <div className="proposal-avoid-break">
          <H>{num}{stage.code ? `${stage.code} — ` : ""}{stage.name}</H>
          {stage.description && <P>{stage.description}</P>}
          {richHas && <div className="mb-4">{rich}</div>}

          {showObjective && hasRichContent(objectiveHtml, objectiveText) && (
            <div className="mt-6">
              <SectionTitle>{L.objective}</SectionTitle>
              <RichContent html={objectiveHtml} text={objectiveText} tokenMap={tokenMap} />
            </div>
          )}

          {showKeyActivities && hasRichContent(keyActivitiesHtml, keyActivitiesText) && (
            <div className="mt-6">
              <SectionTitle>{L.keyActivities}</SectionTitle>
              <RichContent html={keyActivitiesHtml} text={keyActivitiesText} tokenMap={tokenMap} />
            </div>
          )}

          {deliverables.length > 0 && (
            <div className="mt-6">
              <SectionTitle>{L.scopeDeliverables}</SectionTitle>
              <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-zinc-800">
                {deliverables.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {clientInfo.length > 0 && (
            <div className="mt-6">
              <SectionTitle>{L.clientInfoRequired}</SectionTitle>
              <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-zinc-800">
                {clientInfo.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {showStageApproval && hasRichContent(stageApprovalHtml, stageApprovalText) && (
            <div className="mt-6">
              <SectionTitle>{L.stageApproval}</SectionTitle>
              <RichContent html={stageApprovalHtml} text={stageApprovalText} tokenMap={tokenMap} />
            </div>
          )}

          <PhaseSummaryCard
            stage={stage}
            block={block}
            lang={lang}
            L={L}
          />



        </div>

      );
    }




    case "timeline": {
      // Group by hierarchy: parents/grandparents render as titles (header rows),
      // only leaves render as data rows with dates + duration.
      const inSet = new Set(selfStages.map((s) => s.id));
      const kidsOf = new Map<string, typeof selfStages>();
      for (const s of selfStages) {
        const p = s.parentStageId && inSet.has(s.parentStageId) ? s.parentStageId : null;
        if (!p) continue;
        const arr = kidsOf.get(p) ?? [];
        arr.push(s);
        kidsOf.set(p, arr);
      }
      const startKey = (s: (typeof selfStages)[number]) => s.startDate ?? "";
      const sortFn = (a: (typeof selfStages)[number], b: (typeof selfStages)[number]) => {
        const ak = startKey(a);
        const bk = startKey(b);
        if (ak !== bk) return ak < bk ? -1 : 1;
        return 0;
      };
      for (const [, arr] of kidsOf) arr.sort(sortFn);
      const roots = selfStages
        .filter((s) => !s.parentStageId || !inSet.has(s.parentStageId))
        .slice()
        .sort(sortFn);

      const rows: React.ReactNode[] = [];
      const walk = (s: (typeof selfStages)[number], depth: number) => {
        const kids = kidsOf.get(s.id) ?? [];
        const label = s.code ? `${s.code} — ${s.name}` : s.name;
        const pad = { paddingLeft: `${depth * 14}px` } as React.CSSProperties;
        if (kids.length > 0) {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-200 bg-zinc-50">
              <td
                colSpan={4}
                className="proposal-print-heading py-1 text-sm font-semibold tracking-tight text-zinc-800"
                style={pad}
              >
                {label}
              </td>
            </tr>,
          );
          for (const k of kids) walk(k, depth + 1);
        } else {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-100">
              <td className="py-1" style={pad}>{label}</td>
              <td className="py-1">{formatDatePT(s.startDate, lang)}</td>
              <td className="py-1">{formatDatePT(s.endDate, lang)}</td>
              <td className="py-1 text-right">{formatDurationHuman(s.durationDays, lang)}</td>
            </tr>,
          );
        }
      };
      for (const r of roots) walk(r, 0);

      const introHtml = (block.content_rich?.html as string | undefined) ?? "";
      const introText = (block.content_rich?.text as string | undefined) ?? "";

      return (
        <div>
          <H>{num}{block.title}</H>
          {hasRichContent(introHtml, introText) && (
            <div className="mb-3">
              <RichContent html={introHtml} text={introText} tokenMap={tokenMap} />
            </div>
          )}
          {selfStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500">
                  <th className="py-1 font-semibold">{L.phase}</th>
                  <th className="py-1 font-semibold">{L.start}</th>
                  <th className="py-1 font-semibold">{L.end}</th>
                  <th className="py-1 text-right font-semibold">{L.duration}</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
          ) : (
            <Empty>{L.scheduleUnavailable}</Empty>
          )}
        </div>
      );
    }


    case "gantt_design":
    case "gantt_construction":
    case "gantt_partial": {
      const overrideId = (block.source_ref as { parent_stage_id?: string } | undefined)?.parent_stage_id;
      const allStages = (live?.stages ?? []).filter((s) => s.isSelf);

      let parent: LiveStage | null = null;
      if (block.block_type === "gantt_partial") {
        parent = (overrideId && allStages.find((s) => s.id === overrideId)) || null;
      } else {
        const scope: "design" | "construction" =
          block.block_type === "gantt_design" ? "design" : "construction";
        const designRe = /\b(design|projeto|projecto)\b/i;
        const constructionRe = /(constru[cç][aã]o|obra|construction|tender|concurso|execu[cç][aã]o)/i;
        const re = scope === "design" ? designRe : constructionRe;
        // Search all stages (not just roots) — the design/construction parent
        // is often nested under an "Architecture" root.
        const matches = allStages.filter(
          (s) => re.test(s.name) || re.test(s.code ?? ""),
        );
        // Prefer the shallowest match (closest to root) so we get the parent
        // grouping stage, not one of its own descendants.
        const depthOf = (id: string): number => {
          let d = 0;
          let cur: LiveStage | undefined = allStages.find((x) => x.id === id);
          while (cur?.parentStageId) {
            d++;
            cur = allStages.find((x) => x.id === cur!.parentStageId);
          }
          return d;
        };
        const shallowest = matches.slice().sort((a, b) => depthOf(a.id) - depthOf(b.id))[0];
        parent =
          (overrideId && allStages.find((s) => s.id === overrideId)) ||
          shallowest ||
          null;
      }

      // Collect all descendants of the matched parent (depth-first).
      const collectDescendants = (parentId: string): LiveStage[] => {
        const direct = allStages.filter((s) => s.parentStageId === parentId);
        const out: LiveStage[] = [];
        for (const s of direct) {
          out.push(s);
          out.push(...collectDescendants(s.id));
        }
        return out;
      };
      const rows = (parent ? collectDescendants(parent.id) : [])
        .filter((s) => !s.isMilestone && s.startDate && s.endDate);

      if (!parent || !rows.length) {
        return (
          <div>
            <H>{num}{block.title}</H>
            <Empty>
              {block.block_type === "gantt_design"
                ? L.noDesignPhases
                : block.block_type === "gantt_construction"
                ? L.noConstructionPhases
                : L.chooseParentInSettings}
            </Empty>
          </div>
        );
      }

      const tsList = rows.flatMap((s) => [
        new Date(s.startDate!).getTime(),
        new Date(s.endDate!).getTime(),
      ]);
      const minTs = Math.min(...tsList);
      const maxTs = Math.max(...tsList);
      const start = new Date(minTs);
      const end = new Date(maxTs);
      // Snap header to month boundaries.
      const headStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const headEnd = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      const span = headEnd.getTime() - headStart.getTime();

      const months: { label: string; left: number; width: number }[] = [];
      const cursor = new Date(headStart);
      while (cursor < headEnd) {
        const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const left = ((cursor.getTime() - headStart.getTime()) / span) * 100;
        const width = ((next.getTime() - cursor.getTime()) / span) * 100;
        months.push({
          label: formatMonthShort(cursor, lang).charAt(0).toUpperCase(),
          left,
          width,
        });

        cursor.setMonth(cursor.getMonth() + 1);
      }

      const totalDays = Math.round(
        (new Date(maxTs).getTime() - new Date(minTs).getTime()) / 86400000,
      );

      return (
        <div className="proposal-avoid-break">
          <H>{num}{block.title}</H>
          <div className="mb-2 text-xs text-zinc-500">
            {parent.code ? `${parent.code} — ` : ""}{parent.name} ·{" "}
            {formatDatePT(start.toISOString(), lang)} → {formatDatePT(end.toISOString(), lang)} ·{" "}
            {formatDurationHuman(totalDays, lang)}
          </div>
          <div className="overflow-hidden rounded border border-zinc-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="w-[28%] px-2 py-1 text-left font-medium text-zinc-600">
                    {L.phase}
                  </th>
                  <th className="w-[70px] px-2 py-1 text-right font-medium text-zinc-600 whitespace-nowrap">
                    {L.duration}
                  </th>
                  <th className="px-0 py-1">
                    <div className="relative h-4 w-full">
                      {months.map((m, i) => (
                        <div
                          key={i}
                          className="absolute top-0 flex h-4 items-center justify-center border-l border-zinc-200 text-[10px] tracking-wide text-zinc-500"
                          style={{ left: `${m.left}%`, width: `${m.width}%` }}
                        >
                          {m.label}
                        </div>
                      ))}

                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const sStart = new Date(s.startDate!).getTime();
                  const sEnd = new Date(s.endDate!).getTime();
                  const left = ((sStart - headStart.getTime()) / span) * 100;
                  const width = Math.max(
                    0.8,
                    ((sEnd - sStart) / span) * 100,
                  );
                  const stageDays = Math.max(
                    1,
                    Math.round((sEnd - sStart) / 86400000),
                  );
                  return (
                    <tr key={s.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-2 py-1.5 align-middle text-zinc-800">
                        <div className="truncate">
                          {s.code ? <span className="text-zinc-500">{s.code} — </span> : null}
                          {s.name}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right align-middle text-zinc-700 whitespace-nowrap">
                        {formatDurationCompact(stageDays, lang)}
                      </td>
                      <td className="px-0 py-1.5">
                        <div className="relative h-4 w-full">
                          {months.map((m, i) => (
                            <div
                              key={i}
                              className="absolute top-0 h-4 border-l border-zinc-100"
                              style={{ left: `${m.left}%`, width: `${m.width}%` }}
                            />
                          ))}
                          <div
                            className="absolute top-1 h-2 rounded-sm bg-zinc-800 print:bg-zinc-700"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${formatDatePT(s.startDate, lang)} → ${formatDatePT(s.endDate, lang)}`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }



    case "consultants":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.consultants?.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500">
                  <th className="py-1">{L.discipline}</th>
                  <th className="py-1">{L.consultant}</th>
                  <th className="py-1 text-right">{L.fees}</th>
                </tr>
              </thead>
              <tbody>
                {live.consultants.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100">
                    <td className="py-1">{c.discipline ?? "—"}</td>
                    <td className="py-1">{c.name}</td>
                    <td className="py-1 text-right">{formatCurrencyEUR(c.fee, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>{L.noConsultants}</Empty>
          )}
        </div>
      );

    case "fee_table": {
      // Hierarchy: grandparents/parents render as title rows (no fee);
      // only leaves render fee values. Total = sum of leaf fees.
      const feeStages = selfStages.filter((s) => !s.isMilestone);
      const inSet = new Set(feeStages.map((s) => s.id));

      const kidsOf = new Map<string, typeof feeStages>();
      for (const s of feeStages) {
        const p = s.parentStageId && inSet.has(s.parentStageId) ? s.parentStageId : null;
        if (!p) continue;
        const arr = kidsOf.get(p) ?? [];
        arr.push(s);
        kidsOf.set(p, arr);
      }
      const startKey = (s: (typeof feeStages)[number]) => s.startDate ?? "";
      const sortFn = (a: (typeof feeStages)[number], b: (typeof feeStages)[number]) => {
        const ak = startKey(a);
        const bk = startKey(b);
        if (ak !== bk) return ak < bk ? -1 : 1;
        return 0;
      };
      for (const [, arr] of kidsOf) arr.sort(sortFn);
      const roots = feeStages
        .filter((s) => !s.parentStageId || !inSet.has(s.parentStageId))
        .slice()
        .sort(sortFn);


      // Sum of leaves only (avoid double-counting rolled-up parent fees).
      let total = 0;
      const leafSum = (s: (typeof feeStages)[number]): number => {
        const kids = kidsOf.get(s.id) ?? [];
        if (kids.length === 0) return Number(s.fee) || 0;
        return kids.reduce((acc, k) => acc + leafSum(k), 0);
      };
      total = roots.reduce((acc, r) => acc + leafSum(r), 0);

      const rows: React.ReactNode[] = [];
      const walk = (s: (typeof feeStages)[number], depth: number) => {

        const kids = kidsOf.get(s.id) ?? [];
        const label = s.code ? `${s.code} — ${s.name}` : s.name;
        const pad = { paddingLeft: `${depth * 14}px` } as React.CSSProperties;
        if (kids.length > 0) {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-200 bg-zinc-50">
              <td
                colSpan={3}
                className="py-1 text-[11px] font-semibold tracking-wide text-zinc-700"
                style={pad}
              >
                {label}
              </td>
            </tr>,
          );
          for (const k of kids) walk(k, depth + 1);
          if (depth >= 1) {
            const subtotal = leafSum(s);
            rows.push(
              <tr key={`${s.id}-subtotal`} className="font-semibold">
                <td className="py-1" />
                <td className="py-1" />
                <td className="py-1 text-right whitespace-nowrap">{formatCurrencyEUR(subtotal, lang)}</td>
              </tr>,
            );
          }
        } else {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-100">
              <td className="py-1" style={pad}>{label}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatCurrencyEUR(Number(s.fee) || 0, lang)}</td>
              <td className="py-1" />
            </tr>,
          );
        }
      };
      for (const r of roots) walk(r, 0);

      const feeIntroHtml = (block.content_rich?.html as string | undefined) ?? "";
      const feeIntroText = (block.content_rich?.text as string | undefined) ?? "";

      return (

        <div>
          <H>{num}{block.title}</H>
          {hasRichContent(feeIntroHtml, feeIntroText) && (
            <div className="mb-3">
              <RichContent html={feeIntroHtml} text={feeIntroText} tokenMap={tokenMap} />
            </div>
          )}
          {feeStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <tbody>
                {rows}
                <tr className="font-semibold">
                  <td className="pt-6 pb-1">{L.totalArchitecture}</td>
                  <td className="pt-6 pb-1" />
                  <td className="pt-6 pb-1 text-right whitespace-nowrap">{formatCurrencyEUR(total, lang)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>{L.noFeesToShow}</Empty>
          )}
        </div>


      );
    }

    case "supplier_fee_table": {
      // Fee table for supplier (non-self) stages from the Gantt.
      // Mirrors fee_table but on supplier stages, and excludes optional
      // subtrees (matches the Consultants block behaviour).
      const allStages = live?.stages ?? [];
      const byId = new Map(allStages.map((s) => [s.id, s]));
      const isOptionalWithAncestors = (s: LiveStage): boolean => {
        let cur: LiveStage | undefined = s;
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
          if (cur.isOptional) return true;
          seen.add(cur.id);
          cur = cur.parentStageId ? byId.get(cur.parentStageId) : undefined;
        }
        return false;
      };
      const supplierStages = allStages.filter(
        (s) => !s.isSelf && !s.isMilestone && !isOptionalWithAncestors(s),
      );

      const inSet = new Set(supplierStages.map((s) => s.id));
      const kidsOf = new Map<string, LiveStage[]>();
      for (const s of supplierStages) {
        const p = s.parentStageId && inSet.has(s.parentStageId) ? s.parentStageId : null;
        if (!p) continue;
        const arr = kidsOf.get(p) ?? [];
        arr.push(s);
        kidsOf.set(p, arr);
      }
      const startKey = (s: LiveStage) => s.startDate ?? "";
      const sortFn = (a: LiveStage, b: LiveStage) => {
        const ak = startKey(a);
        const bk = startKey(b);
        if (ak !== bk) return ak < bk ? -1 : 1;
        return 0;
      };
      for (const [, arr] of kidsOf) arr.sort(sortFn);
      const roots = supplierStages
        .filter((s) => !s.parentStageId || !inSet.has(s.parentStageId))
        .slice()
        .sort(sortFn);

      const leafSum = (s: LiveStage): number => {
        const kids = kidsOf.get(s.id) ?? [];
        if (kids.length === 0) return Number(s.fee) || 0;
        return kids.reduce((acc, k) => acc + leafSum(k), 0);
      };
      const total = roots.reduce((acc, r) => acc + leafSum(r), 0);

      const rows: React.ReactNode[] = [];
      const walk = (s: LiveStage, depth: number) => {
        const kids = kidsOf.get(s.id) ?? [];
        const label = s.code ? `${s.code} — ${s.name}` : s.name;
        const pad = { paddingLeft: `${depth * 14}px` } as React.CSSProperties;
        if (kids.length > 0) {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-200 bg-zinc-50">
              <td
                colSpan={2}
                className="py-1 text-[11px] font-semibold tracking-wide text-zinc-700"
                style={pad}
              >
                {label}
              </td>
            </tr>,
          );
          for (const k of kids) walk(k, depth + 1);
        } else {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-100">
              <td className="py-1" style={pad}>{label}</td>
              <td className="py-1 text-right">{formatCurrencyEUR(Number(s.fee) || 0, lang)}</td>
            </tr>,
          );
        }
      };
      for (const r of roots) walk(r, 0);

      return (
        <div>
          <H>{num}{block.title}</H>
          {supplierStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500">
                  <th className="py-1">{L.phase}</th>
                  <th className="py-1 text-right">{L.fees}</th>
                </tr>
              </thead>
              <tbody>
                {rows}
                <tr className="font-semibold">
                  <td className="py-1">{L.totalSuppliers}</td>
                  <td className="py-1 text-right">{formatCurrencyEUR(total, lang)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>{L.noFeesToShow}</Empty>
          )}
        </div>
      );
    }

    case "optional_fee_table": {
      // Fee table for optional stages (isOptional or descendants of optional).
      const allStages = live?.stages ?? [];
      const byId = new Map(allStages.map((s) => [s.id, s]));
      const isOptionalWithAncestors = (s: LiveStage): boolean => {
        let cur: LiveStage | undefined = s;
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
          if (cur.isOptional) return true;
          seen.add(cur.id);
          cur = cur.parentStageId ? byId.get(cur.parentStageId) : undefined;
        }
        return false;
      };
      const optionalStages = allStages.filter(
        (s) => !s.isMilestone && isOptionalWithAncestors(s),
      );

      const inSet = new Set(optionalStages.map((s) => s.id));
      const kidsOf = new Map<string, LiveStage[]>();
      for (const s of optionalStages) {
        const p = s.parentStageId && inSet.has(s.parentStageId) ? s.parentStageId : null;
        if (!p) continue;
        const arr = kidsOf.get(p) ?? [];
        arr.push(s);
        kidsOf.set(p, arr);
      }
      const startKey = (s: LiveStage) => s.startDate ?? "";
      const sortFn = (a: LiveStage, b: LiveStage) => {
        const ak = startKey(a);
        const bk = startKey(b);
        if (ak !== bk) return ak < bk ? -1 : 1;
        return 0;
      };
      for (const [, arr] of kidsOf) arr.sort(sortFn);
      const selectedRootId = (block.source_ref as { stage_id?: string } | undefined)?.stage_id;
      const roots = optionalStages
        .filter((s) => !s.parentStageId || !inSet.has(s.parentStageId))
        .filter((s) => (selectedRootId ? s.id === selectedRootId : true))
        .slice()
        .sort(sortFn);

      const leafSum = (s: LiveStage): number => {
        const kids = kidsOf.get(s.id) ?? [];
        if (kids.length === 0) return Number(s.fee) || 0;
        return kids.reduce((acc, k) => acc + leafSum(k), 0);
      };
      const rows: React.ReactNode[] = [];
      const walk = (s: LiveStage, depth: number) => {
        const kids = kidsOf.get(s.id) ?? [];
        const label = s.code ? `${s.code} — ${s.name}` : s.name;
        const pad = { paddingLeft: `${depth * 14}px` } as React.CSSProperties;
        if (kids.length > 0) {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-200 bg-zinc-50">
              <td
                colSpan={3}
                className="py-1 text-[11px] font-semibold tracking-wide text-zinc-700"
                style={pad}
              >
                {label}
              </td>
            </tr>,
          );
          for (const k of kids) walk(k, depth + 1);
          if (depth >= 1) {
            const subtotal = leafSum(s);
            rows.push(
              <tr key={`${s.id}-subtotal`} className="font-semibold">
                <td className="py-1" />
                <td className="py-1" />
                <td className="py-1 text-right whitespace-nowrap">{formatCurrencyEUR(subtotal, lang)}</td>
              </tr>,
            );
          }
        } else {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-100">
              <td className="py-1" style={pad}>{label}</td>
              <td className="py-1 text-right whitespace-nowrap">{formatCurrencyEUR(Number(s.fee) || 0, lang)}</td>
              <td className="py-1" />
            </tr>,
          );
        }
      };
      for (let i = 0; i < roots.length; i++) {
        const r = roots[i];
        walk(r, 0);
        const rootTotal = leafSum(r);
        rows.push(
          <tr key={`${r.id}-root-total`} className="font-semibold">
            <td className="pt-6 pb-1">{r.code ? `${r.code} — ${r.name}` : r.name}</td>
            <td className="pt-6 pb-1" />
            <td className="pt-6 pb-1 text-right whitespace-nowrap">{formatCurrencyEUR(rootTotal, lang)}</td>
          </tr>,
        );
      }

      const optIntroHtml = (block.content_rich?.html as string | undefined) ?? "";
      const optIntroText = (block.content_rich?.text as string | undefined) ?? "";
      const optObjectiveHtml = (block.content_rich?.objective_html as string | undefined) ?? "";
      const optObjectiveText = (block.content_rich?.objective_text as string | undefined) ?? "";
      const optScopeHtml = (block.content_rich?.scope_html as string | undefined) ?? "";
      const optScopeText = (block.content_rich?.scope_text as string | undefined) ?? "";

      const OptSectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="proposal-print-heading mb-2 text-sm font-semibold tracking-tight text-zinc-900">
          {children}
        </h3>
      );

      return (
        <div>
          <H>{num}{block.title}</H>
          {hasRichContent(optIntroHtml, optIntroText) && (
            <div className="mb-3">
              <RichContent html={optIntroHtml} text={optIntroText} tokenMap={tokenMap} />
            </div>
          )}
          {hasRichContent(optObjectiveHtml, optObjectiveText) && (
            <div className="mb-3">
              <OptSectionTitle>{L.objective}</OptSectionTitle>
              <RichContent html={optObjectiveHtml} text={optObjectiveText} tokenMap={tokenMap} />
            </div>
          )}
          <div className="mb-3">
            <OptSectionTitle>{L.scopeIncludes}</OptSectionTitle>
            {hasRichContent(optScopeHtml, optScopeText) ? (
              <RichContent html={optScopeHtml} text={optScopeText} tokenMap={tokenMap} />
            ) : (
              <p className="text-sm italic text-zinc-400">
                Adicione o âmbito incluído nas definições do bloco.
              </p>
            )}
          </div>

          {optionalStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <tbody>
                {rows}
              </tbody>
            </table>
          ) : (
            <Empty>{L.noFeesToShow}</Empty>
          )}
        </div>
      );
    }



    case "construction_fee":
    case "payment_terms":
    case "additional_services":
    case "general":
    case "suspension":
      return (
        <div>
          <H>{num}{block.title}</H>
          {richHas ? rich : fallback(block.block_type)}
        </div>
      );

    case "payment_schedule":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.paymentInvoices?.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500">
                  <th className="py-1 w-20">{L.invoiceCol}</th>
                  <th className="py-1 w-24">{L.dateCol}</th>
                  <th className="py-1">{L.description}</th>
                  <th className="py-1 text-right">{L.netCol}</th>
                  <th className="py-1 text-right">{L.vatCol}</th>
                  <th className="py-1 text-right">{L.grossCol}</th>
                </tr>
              </thead>
              <tbody>
                {live.paymentInvoices.map((inv, invIdx) => (
                  <React.Fragment key={inv.key}>
                    {inv.lines.map((ln, li) => (
                      <tr
                        key={`${inv.key}:${li}`}
                        className={li === 0 && invIdx > 0 ? "proposal-payment-invoice-start" : ""}
                      >
                        <td className="py-1 align-top text-xs font-semibold">{li === 0 ? inv.label : ""}</td>
                        <td className="py-1 align-top tabular-nums text-xs">{li === 0 ? formatDatePT(inv.plannedDate, lang) : ""}</td>
                        <td className="py-1">{ln.description}</td>
                        <td className="py-1 text-right tabular-nums">{formatCurrencyEUR(ln.net, lang)}</td>
                        <td className="py-1 text-right tabular-nums text-zinc-500">{formatCurrencyEUR(ln.vat, lang)}</td>
                        <td className="py-1 text-right tabular-nums font-medium">{formatCurrencyEUR(ln.net + ln.vat, lang)}</td>
                      </tr>
                    ))}

                    {inv.lines.length > 1 && (
                      <tr className="text-xs bg-zinc-50">
                        <td className="py-1" />
                        <td className="py-1" />
                        <td className="py-1 font-semibold">{L.subtotal} {inv.label}</td>
                        <td className="py-1 text-right tabular-nums font-semibold">{formatCurrencyEUR(inv.net, lang)}</td>
                        <td className="py-1 text-right tabular-nums text-zinc-500">{formatCurrencyEUR(inv.vat, lang)}</td>
                        <td className="py-1 text-right tabular-nums font-semibold">{formatCurrencyEUR(inv.total, lang)}</td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                <tr className="border-t-2 border-zinc-400 font-semibold">
                  <td className="py-1" colSpan={3}>{L.total}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrencyEUR(live.paymentInvoicesTotal.net, lang)}</td>
                  <td className="py-1 text-right tabular-nums text-zinc-500">{formatCurrencyEUR(live.paymentInvoicesTotal.vat, lang)}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrencyEUR(live.paymentInvoicesTotal.total, lang)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>{L.noPaymentSchedule}</Empty>
          )}
        </div>
      );

    case "exclusions":
      if (richHas) {
        return (
          <div>
            <H>{num}{block.title}</H>
            {rich}
          </div>
        );
      }
      return (
        <div>
          <H>{num}{block.title}</H>
          {text ? (
            <ul className="ml-5 list-disc space-y-1 text-sm text-zinc-800">
              {text.split("\n").filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          ) : (
            fallback("exclusions")
          )}
        </div>
      );

    case "acceptance":
      return (
        <div className="proposal-signature-block proposal-avoid-break">
          <H>{num}{block.title}</H>
          {richHas ? (
            rich
          ) : (
            <p className="proposal-signature-hint">{L.proposalValidity}</p>
          )}
          <div className="proposal-signature-grid">
            <div className="proposal-signature-cell">
              <div className="proposal-signature-line" />
              <div className="proposal-signature-label">{L.clientSignatory}</div>
            </div>
            <div className="proposal-signature-cell">
              <div className="proposal-signature-line" />
              <div className="proposal-signature-label">{L.psaSignatory}</div>
            </div>
          </div>
        </div>
      );

    case "page_break":
      return (
        <div className="proposal-page-break-before my-8 border-t-2 border-dashed border-zinc-300 text-center text-[10px] uppercase tracking-widest text-zinc-400 print:border-0 print:text-transparent">
          {L.pageBreak}
        </div>
      );

    case "travel_expenses": {
      const rows = live?.siteTrips ?? [];
      const total = live?.siteTripsTotal ?? 0;
      const isEn = lang === "en";
      const intro = isEn
        ? "Site trips planned during construction (or other stages). Cost per trip = km × price/km × 2 + trip hours × hourly rate × 2 (return included)."
        : "Deslocações previstas durante a obra (ou outras fases). Custo por deslocação = km × €/km × 2 + horas × €/h × 2 (ida e volta incluídas).";
      const T = {
        label: isEn ? "Ref." : "Ref.",
        stage: isEn ? "Stage" : "Fase",
        criteria: isEn ? "Criteria" : "Critério",
        frequency: isEn ? "Frequency" : "Frequência",
        trips: isEn ? "Trips" : "Deslocações",
        cost: isEn ? "Total" : "Total",
        totalRow: isEn ? "Total" : "Total",
        perMonth: isEn ? "per month" : "por mês",
        totalMode: isEn ? "total" : "total",
      };
      const criteriaFor = (r: (typeof rows)[number]) => {
        const parts: string[] = [];
        if (r.km > 0 && r.pricePerKm > 0) {
          parts.push(`${r.km} km × ${formatCurrencyEUR(r.pricePerKm, lang)}/km × 2`);
        }
        if (r.tripHours > 0 && r.hourlyRate > 0) {
          parts.push(
            `${r.tripHours} ${L.hoursShort} × ${formatCurrencyEUR(r.hourlyRate, lang)}/${L.hoursShort} × 2`,
          );
        }
        return parts.join(" + ") || "—";
      };
      const frequencyFor = (r: (typeof rows)[number]) => {
        if (r.frequencyMode === "per_month") {
          return `${r.frequencyValue} ${T.perMonth}`;
        }
        return `${r.frequencyValue} ${T.totalMode}`;
      };
      return (
        <div>
          <H>{num}{block.title}</H>
          <P>{intro}</P>
          {rows.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500">
                  <th className="py-1 w-12">{T.label}</th>
                  <th className="py-1">{T.stage}</th>
                  <th className="py-1">{T.criteria}</th>
                  <th className="py-1">{T.frequency}</th>
                  <th className="py-1 text-right">{T.trips}</th>
                  <th className="py-1 text-right">{T.cost}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 align-top">
                    <td className="py-1 font-medium">{r.label || "—"}</td>
                    <td className="py-1">
                      {r.stageNumber ? `${r.stageNumber} ` : ""}
                      {r.stageName ?? "—"}
                    </td>
                    <td className="py-1 text-zinc-700">{criteriaFor(r)}</td>
                    <td className="py-1">{frequencyFor(r)}</td>
                    <td className="py-1 text-right tabular-nums">
                      {Number.isFinite(r.totalTrips)
                        ? Math.round(r.totalTrips * 100) / 100
                        : "—"}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatCurrencyEUR(r.totalCost, lang)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-zinc-400 font-semibold">
                  <td className="py-1" colSpan={5}>{T.totalRow}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCurrencyEUR(total, lang)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>
              {isEn
                ? "No site trips defined in the Construction Assistance tab."
                : "Sem deslocações definidas no separador Assistência à Obra."}
            </Empty>
          )}
        </div>
      );
    }


    case "appendix_index": {
      const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
      const appendices = (siblings ?? [])
        .filter(
          (b) =>
            b.is_visible &&
            (b.block_type === "appendix_payment_schedule" ||
              b.block_type === "appendix_gantt" ||
              b.block_type === "appendix_general_terms") &&
            ((b.content_rich as { enabled?: boolean } | undefined)?.enabled ?? true),
        )
        .sort((a, b) => a.sort_order - b.sort_order);
      const introHtmlIdx = (block.content_rich?.html as string | undefined) ?? "";
      const introTextIdx = (block.content_rich?.text as string | undefined) ?? "";
      return (
        <div className="proposal-appendix proposal-page-break-before">
          <div className="mb-8 text-center">
            <div className="text-xs tracking-[0.4em] text-zinc-500">
              {L.appendicesLabel}
            </div>
            <div className="mt-4 text-3xl font-light tracking-tight text-zinc-900">
              {block.title || L.appendicesLabel}
            </div>
          </div>
          {hasRichContent(introHtmlIdx, introTextIdx) && (
            <div className="mb-6">
              <RichContent html={introHtmlIdx} text={introTextIdx} tokenMap={tokenMap} />
            </div>
          )}
          {appendices.length ? (
            <ul className="mt-4 divide-y divide-zinc-200 border-t border-b border-zinc-200">
              {appendices.map((ap, i) => {
                const letter =
                  (ap.content_rich as { appendix_letter?: string } | undefined)
                    ?.appendix_letter || letters[i] || String(i + 1);
                return (
                  <li key={ap.id} className="flex items-baseline justify-between py-3">
                    <div className="flex items-baseline gap-4">
                      <div className="w-24 text-xs uppercase tracking-widest text-zinc-500">
                        {L.appendix} {letter}
                      </div>
                      <div className="text-sm text-zinc-900">{ap.title}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>{L.noAppendices}</Empty>
          )}
        </div>
      );
    }

    case "appendix_payment_schedule": {
      const letter =
        (block.content_rich as { appendix_letter?: string } | undefined)
          ?.appendix_letter || "A";
      const introHtmlA = (block.content_rich?.html as string | undefined) ?? "";
      const introTextA = (block.content_rich?.text as string | undefined) ?? "";
      const defaultIntro =
        lang === "en"
          ? "The following Monthly Payment Schedule illustrates the anticipated invoicing throughout the project based on the proposed programme and resource allocation. Should the programme or scope change, this schedule will be updated accordingly."
          : "O seguinte Cronograma Mensal de Pagamentos ilustra a facturação prevista ao longo do projecto com base no programa proposto e na afectação de recursos. Caso o programa ou o âmbito sejam alterados, este cronograma será actualizado em conformidade.";
      return (
        <div className="proposal-appendix proposal-page-break-before">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-zinc-500">
            {L.appendix} {letter}
          </div>
          <H>{block.title}</H>
          <div className="mb-4">
            {hasRichContent(introHtmlA, introTextA) ? (
              <RichContent html={introHtmlA} text={introTextA} tokenMap={tokenMap} />
            ) : (
              <P>{defaultIntro}</P>
            )}
          </div>
          {live?.paymentInvoices?.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs tracking-wide text-zinc-500">
                  <th className="py-1 w-20">{L.invoiceCol}</th>
                  <th className="py-1 w-24">{L.dateCol}</th>
                  <th className="py-1">{L.description}</th>
                  <th className="py-1 text-right">{L.netCol}</th>
                  <th className="py-1 text-right">{L.vatCol}</th>
                  <th className="py-1 text-right">{L.grossCol}</th>
                </tr>
              </thead>
              <tbody>
                {live.paymentInvoices.map((inv) => (
                  <React.Fragment key={inv.key}>
                    {inv.lines.map((ln, li) => (
                      <tr key={`${inv.key}:${li}`} className={li === 0 ? "border-t border-zinc-200" : ""}>
                        <td className="py-1 align-top text-xs font-semibold">{li === 0 ? inv.label : ""}</td>
                        <td className="py-1 align-top tabular-nums text-xs">{li === 0 ? formatDatePT(inv.plannedDate, lang) : ""}</td>
                        <td className="py-1">{ln.description}</td>
                        <td className="py-1 text-right tabular-nums">{formatCurrencyEUR(ln.net, lang)}</td>
                        <td className="py-1 text-right tabular-nums text-zinc-500">{formatCurrencyEUR(ln.vat, lang)}</td>
                        <td className="py-1 text-right tabular-nums font-medium">{formatCurrencyEUR(ln.net + ln.vat, lang)}</td>
                      </tr>
                    ))}
                    {inv.lines.length > 1 && (
                      <tr className="text-xs bg-zinc-50">
                        <td className="py-1" />
                        <td className="py-1" />
                        <td className="py-1 font-semibold">{L.subtotal} {inv.label}</td>
                        <td className="py-1 text-right tabular-nums font-semibold">{formatCurrencyEUR(inv.net, lang)}</td>
                        <td className="py-1 text-right tabular-nums text-zinc-500">{formatCurrencyEUR(inv.vat, lang)}</td>
                        <td className="py-1 text-right tabular-nums font-semibold">{formatCurrencyEUR(inv.total, lang)}</td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                <tr className="border-t-2 border-zinc-400 font-semibold">
                  <td className="py-1" colSpan={3}>{L.total}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrencyEUR(live.paymentInvoicesTotal.net, lang)}</td>
                  <td className="py-1 text-right tabular-nums text-zinc-500">{formatCurrencyEUR(live.paymentInvoicesTotal.vat, lang)}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrencyEUR(live.paymentInvoicesTotal.total, lang)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>{L.noPaymentSchedule}</Empty>
          )}
        </div>
      );
    }

    case "appendix_gantt": {
      const letterB =
        (block.content_rich as { appendix_letter?: string } | undefined)
          ?.appendix_letter || "B";
      const orientationSetting =
        ((block.content_rich as { page_orientation?: string } | undefined)
          ?.page_orientation ?? "auto") as "auto" | "portrait" | "a3-landscape";
      const introHtmlB = (block.content_rich?.html as string | undefined) ?? "";
      const introTextB = (block.content_rich?.text as string | undefined) ?? "";

      // Build hierarchy, skipping stages with no dates ("empty lines")
      const datedStages = selfStages.filter((s) => s.startDate && s.endDate);
      const inSetB = new Set(datedStages.map((s) => s.id));
      const kidsOfB = new Map<string, typeof datedStages>();
      for (const s of datedStages) {
        const p = s.parentStageId && inSetB.has(s.parentStageId) ? s.parentStageId : null;
        if (!p) continue;
        const arr = kidsOfB.get(p) ?? [];
        arr.push(s);
        kidsOfB.set(p, arr);
      }
      const sortFnB = (a: (typeof datedStages)[number], b: (typeof datedStages)[number]) => {
        const ak = a.startDate ?? "";
        const bk = b.startDate ?? "";
        if (ak !== bk) return ak < bk ? -1 : 1;
        return 0;
      };
      for (const [, arr] of kidsOfB) arr.sort(sortFnB);
      const rootsB = datedStages
        .filter((s) => !s.parentStageId || !inSetB.has(s.parentStageId))
        .slice()
        .sort(sortFnB);

      type Row = {
        stage: (typeof datedStages)[number];
        depth: number;
        isGroup: boolean;
      };
      const rows: Row[] = [];
      const walkB = (s: (typeof datedStages)[number], depth: number) => {
        const kids = kidsOfB.get(s.id) ?? [];
        rows.push({ stage: s, depth, isGroup: kids.length > 0 });
        for (const k of kids) walkB(k, depth + 1);
      };
      for (const r of rootsB) walkB(r, 0);

      // Compute date range
      let minTs = Infinity;
      let maxTs = -Infinity;
      for (const r of rows) {
        const s = new Date(r.stage.startDate as string).getTime();
        const e = new Date(r.stage.endDate as string).getTime();
        if (!Number.isNaN(s)) minTs = Math.min(minTs, s);
        if (!Number.isNaN(e)) maxTs = Math.max(maxTs, e);
      }
      const hasRange = rows.length > 0 && Number.isFinite(minTs) && Number.isFinite(maxTs) && maxTs > minTs;
      const totalDays = hasRange ? Math.max(1, Math.round((maxTs - minTs) / 86400000)) : 1;
      const totalMonths = hasRange
        ? Math.max(1, Math.round(totalDays / 30))
        : 1;

      // Auto-orientation: portrait when the schedule is small enough to be
      // legible on A4 portrait, otherwise A3 landscape.
      const resolvedOrientation: "portrait" | "a3-landscape" =
        orientationSetting === "auto"
          ? rows.length <= 10 && totalMonths <= 6
            ? "portrait"
            : "a3-landscape"
          : orientationSetting;

      // Month & year ticks along the timeline
      const monthTicks: { label: string; leftPct: number; nextLeftPct: number }[] = [];
      const yearBands: { year: number; leftPct: number; widthPct: number }[] = [];
      if (hasRange) {
        const start = new Date(minTs);
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor.getTime() < minTs) cursor.setMonth(cursor.getMonth() + 1);
        const pcts: { ts: number; label: string; year: number }[] = [];
        while (cursor.getTime() <= maxTs) {
          pcts.push({
            ts: cursor.getTime(),
            label: formatMonthShort(new Date(cursor), lang),
            year: cursor.getFullYear(),
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
        for (let i = 0; i < pcts.length; i++) {
          const leftPct = ((pcts[i].ts - minTs) / (maxTs - minTs)) * 100;
          const nextTs = i + 1 < pcts.length ? pcts[i + 1].ts : maxTs;
          const nextLeftPct = ((nextTs - minTs) / (maxTs - minTs)) * 100;
          monthTicks.push({ label: pcts[i].label, leftPct, nextLeftPct });
        }
        // Year bands
        const yearsSeen = new Map<number, { start: number; end: number }>();
        for (const p of pcts) {
          const y = p.year;
          const b = yearsSeen.get(y);
          if (!b) yearsSeen.set(y, { start: p.ts, end: p.ts });
          else b.end = p.ts;
        }
        // Include end of range to close the last year band
        const sortedYears = Array.from(yearsSeen.keys()).sort((a, b) => a - b);
        for (let i = 0; i < sortedYears.length; i++) {
          const y = sortedYears[i];
          const band = yearsSeen.get(y)!;
          const startTs = band.start;
          const nextStart =
            i + 1 < sortedYears.length ? yearsSeen.get(sortedYears[i + 1])!.start : maxTs;
          const leftPct = ((startTs - minTs) / (maxTs - minTs)) * 100;
          const widthPct = ((nextStart - startTs) / (maxTs - minTs)) * 100;
          yearBands.push({ year: y, leftPct, widthPct: Math.max(0, widthPct) });
        }
      }

      const barFor = (r: Row) => {
        const s = new Date(r.stage.startDate as string).getTime();
        const e = new Date(r.stage.endDate as string).getTime();
        const leftPct = ((s - minTs) / (maxTs - minTs)) * 100;
        const widthPct = Math.max(0.4, ((e - s) / (maxTs - minTs)) * 100);
        return { leftPct, widthPct };
      };

      // Fill the entire appendix page. Heights are print-page sizes minus
      // margins so the chart makes best use of the paper.
      const pageMinHeight =
        resolvedOrientation === "a3-landscape" ? "260mm" : "240mm";
      // Column widths for WBS / stage name / duration
      const isLandscape = resolvedOrientation === "a3-landscape";
      const wbsColW = isLandscape ? "6%" : "8%";
      const nameColW = isLandscape ? "18%" : "24%";
      const durColW = isLandscape ? "5%" : "6%";
      const outlineTotalPct = isLandscape ? 29 : 38;
      const baseFontPx = isLandscape ? 12 : 10;
      const rotateForScreen = isLandscape;

      const durLabel = (r: Row) => {
        if (r.stage.durationDays == null) return "";
        const d = Math.max(0, Math.round(r.stage.durationDays));
        return `${d}d`;
      };

      const chartInner = (
        <div className="flex h-full w-full flex-1 flex-col text-zinc-800" style={{ fontSize: `${baseFontPx}px` }}>
          {/* Header: outline columns + year band + month band */}
          <div className="flex border-b border-zinc-400" style={{ fontSize: `${baseFontPx - 1}px` }}>
            <div className="flex shrink-0 items-end gap-1 pr-2 uppercase tracking-wide text-zinc-500" style={{ width: `${outlineTotalPct}%` }}>
              <div className="shrink-0 py-1" style={{ width: wbsColW }}>WBS</div>
              <div className="flex-1 py-1 font-semibold">{L.phase}</div>
              <div className="shrink-0 py-1 text-right" style={{ width: durColW }}>{L.duration}</div>
            </div>
            <div className="relative flex-1">
              {/* Year band */}
              <div className="relative h-4 border-b border-zinc-300">
                {yearBands.map((yb, i) => (
                  <div
                    key={`yb-${i}`}
                    className="absolute top-0 h-full border-l border-zinc-400 pl-1 font-semibold text-zinc-700"
                    style={{ left: `${yb.leftPct}%`, width: `${yb.widthPct}%` }}
                  >
                    {yb.year}
                  </div>
                ))}
              </div>
              {/* Month band */}
              <div className="relative h-4">
                {monthTicks.map((t, i) => (
                  <div
                    key={`m-${i}`}
                    className="absolute top-0 h-full border-l border-zinc-200 pl-0.5 text-[9px] uppercase tracking-wide text-zinc-500"
                    style={{ left: `${t.leftPct}%`, width: `${Math.max(0, t.nextLeftPct - t.leftPct)}%` }}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rows */}
          <div className="flex w-full flex-1 flex-col">
            {rows.map((r) => {
              const { leftPct, widthPct } = barFor(r);
              const name = r.stage.name;
              const wbs = r.stage.code ?? "";
              return (
                <div
                  key={r.stage.id}
                  className={cn(
                    "flex flex-1 items-center border-b border-zinc-100",
                    r.isGroup && "bg-zinc-50",
                  )}
                  style={{ minHeight: "14px" }}
                >
                  <div className="flex shrink-0 items-center pr-2" style={{ width: `${outlineTotalPct}%` }}>
                    <div className="shrink-0 truncate text-zinc-500" style={{ width: wbsColW, fontSize: `${baseFontPx - 1}px` }}>
                      {wbs}
                    </div>
                    <div
                      className={cn(
                        "flex-1 truncate",
                        r.isGroup ? "font-semibold uppercase tracking-wide text-zinc-800" : "text-zinc-700",
                      )}
                      style={{ paddingLeft: `${r.depth * 8}px` }}
                      title={name}
                    >
                      {name}
                    </div>
                    <div className="shrink-0 truncate text-right text-zinc-500" style={{ width: durColW, fontSize: `${baseFontPx - 1}px` }}>
                      {durLabel(r)}
                    </div>
                  </div>
                  <div className="relative h-full flex-1">
                    {/* month gridlines */}
                    {monthTicks.map((t, i) => (
                      <div
                        key={i}
                        className="absolute top-0 h-full border-l border-zinc-100"
                        style={{ left: `${t.leftPct}%` }}
                      />
                    ))}
                    {/* year gridlines */}
                    {yearBands.map((yb, i) => (
                      <div
                        key={`yg-${i}`}
                        className="absolute top-0 h-full border-l border-zinc-300"
                        style={{ left: `${yb.leftPct}%` }}
                      />
                    ))}
                    {/* bar */}
                    {r.stage.isMilestone ? (
                      <div
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rotate-45 bg-emerald-600"
                        style={{ left: `${leftPct}%` }}
                      />
                    ) : r.isGroup ? (
                      <>
                        {/* Group summary bracket */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 bg-zinc-800"
                          style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: "3px" }}
                        />
                        <div
                          className="absolute bg-zinc-800"
                          style={{ left: `${leftPct}%`, top: "38%", width: "2px", height: "24%" }}
                        />
                        <div
                          className="absolute bg-zinc-800"
                          style={{ left: `calc(${leftPct + widthPct}% - 2px)`, top: "38%", width: "2px", height: "24%" }}
                        />
                      </>
                    ) : (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 rounded-[2px] bg-emerald-500"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: "60%" }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: range summary */}
          {hasRange && (
            <div className="mt-2 flex justify-between text-zinc-500" style={{ fontSize: `${baseFontPx - 1}px` }}>
              <span>{formatDatePT(new Date(minTs).toISOString(), lang)}</span>
              <span>{formatDatePT(new Date(maxTs).toISOString(), lang)}</span>
            </div>
          )}
        </div>
      );

      return (
        <div
          className={cn(
            "proposal-appendix proposal-page-break-before flex flex-col",
            resolvedOrientation === "a3-landscape" && "proposal-appendix-landscape",
          )}
          style={{ minHeight: pageMinHeight }}
        >
          <div className="mb-2 text-xs uppercase tracking-[0.3em] text-zinc-500">
            {L.appendix} {letterB}
          </div>
          <H>{block.title}</H>
          {hasRichContent(introHtmlB, introTextB) && (
            <div className="mb-2">
              <RichContent html={introHtmlB} text={introTextB} tokenMap={tokenMap} />
            </div>
          )}
          {rows.length === 0 ? (
            <Empty>{L.scheduleUnavailable}</Empty>
          ) : rotateForScreen ? (
            // Rotate the chart 90° so the time axis runs down the long
            // side of the portrait preview page. The inner element uses
            // swapped dimensions (page height × page width) and rotates
            // back into the outer frame.
            <div
              className="proposal-gantt-rotate-outer relative w-full overflow-hidden"
              style={{ height: "240mm" }}
            >
              <div
                className="proposal-gantt-rotate-inner absolute left-0 top-0 flex flex-col"
                style={{
                  width: "240mm",
                  height: "170mm",
                  transformOrigin: "top left",
                  transform: "rotate(-90deg) translate(-100%, 0)",
                }}
              >
                {chartInner}
              </div>
            </div>
          ) : (
            chartInner
          )}
        </div>
      );
    }

    case "appendix_general_terms": {
      const letterC =
        (block.content_rich as { appendix_letter?: string } | undefined)
          ?.appendix_letter || "C";
      const introHtmlC = (block.content_rich?.html as string | undefined) ?? "";
      const introTextC = (block.content_rich?.text as string | undefined) ?? "";
      const isEn = lang === "en";
      const defaultTerms = isEn ? PSA_GENERAL_TERMS_HTML_EN : PSA_GENERAL_TERMS_HTML_PT;
      const body = hasRichContent(introHtmlC, introTextC) ? introHtmlC || introTextC : defaultTerms;
      return (
        <div className="proposal-appendix proposal-page-break-before">
          <div className="mb-4 text-xs uppercase tracking-[0.3em] text-zinc-500">
            {L.appendix} {letterC}
          </div>
          <H>{block.title}</H>
          <div
            className="psa-general-terms-columns text-[11px] leading-snug text-zinc-800 [column-count:2] [column-gap:2rem] [column-rule:1px_solid_theme(colors.zinc.200)] [&_h3]:break-after-avoid [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[12px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-zinc-900 [&_h3:first-child]:mt-0 [&_p]:mb-2 [&_p]:break-inside-avoid [&_strong]:font-semibold"
            dangerouslySetInnerHTML={{
              __html: tokenMap ? resolveTokens(body, tokenMap).output : body,
            }}
          />
        </div>
      );
    }


    case "custom_text":
    default: {
      const cObjHtml = (block.content_rich?.objective_html as string | undefined) ?? "";
      const cObjText = (block.content_rich?.objective_text as string | undefined) ?? "";
      const cScopeHtml = (block.content_rich?.scope_html as string | undefined) ?? "";
      const cScopeText = (block.content_rich?.scope_text as string | undefined) ?? "";
      const cShowObjective = (block.content_rich?.show_objective as boolean | undefined) ?? true;
      const cShowScope = (block.content_rich?.show_scope_includes as boolean | undefined) ?? true;
      const CustomSectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="proposal-print-heading mb-2 text-sm font-semibold tracking-tight text-zinc-900">
          {children}
        </h3>
      );
      const hasAnyStructured =
        hasRichContent(cObjHtml, cObjText) || hasRichContent(cScopeHtml, cScopeText);
      return (
        <div>
          <H>{num}{block.title}</H>
          {richHas && <div className="mb-3">{rich}</div>}
          {cShowObjective && hasRichContent(cObjHtml, cObjText) && (
            <div className="mb-3">
              <CustomSectionTitle>{L.objective}</CustomSectionTitle>
              <RichContent html={cObjHtml} text={cObjText} tokenMap={tokenMap} />
            </div>
          )}
          {block.block_type === "custom_text" && cShowScope && (
            <div className="mb-3">
              <CustomSectionTitle>{L.scopeIncludes}</CustomSectionTitle>
              {hasRichContent(cScopeHtml, cScopeText) ? (
                <RichContent html={cScopeHtml} text={cScopeText} tokenMap={tokenMap} />
              ) : (
                <p className="text-sm italic text-zinc-400">
                  Adicione o âmbito incluído nas definições do bloco.
                </p>
              )}
            </div>
          )}
          {!richHas && !hasAnyStructured && block.block_type !== "custom_text" && (
            <Empty>{L.emptyEditRight}</Empty>
          )}
        </div>
      );
    }
  }
}
