/**
 * Block renderer — given a PsaProposalBlock and the resolved LiveQuoteSnapshot,
 * renders the block body inside the A4 print container.
 *
 * Manual / library / mixed blocks render `content_rich.html` (from the TipTap
 * editor) when present, falling back to the legacy plain `content_rich.text`
 * field. Live-data blocks ignore content_rich and reference the snapshot.
 */
import type { PsaProposalBlock } from "@/lib/psa-proposal/types";
import {
  type LiveQuoteSnapshot,
  type LiveStage,
  type ProposalLang,
  formatCurrencyEUR,
  formatDatePT,
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
    "psa-rich text-sm leading-relaxed text-zinc-800 [&_h2]:proposal-print-heading [&_h3]:proposal-print-heading [&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:mb-0.5 [&_a]:text-blue-700 [&_a]:underline [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-300 [&_th]:bg-zinc-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-zinc-300 [&_td]:px-2 [&_td]:py-1",
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

export function BlockBody({
  block,
  live,
  chapterNumber,
  toc,
  editable,
  onPatchContent,
  lang = "pt-PT",
}: {
  block: PsaProposalBlock;
  live: LiveQuoteSnapshot | undefined;
  chapterNumber: number | null;
  toc?: { chapter: number; title: string }[];
  editable?: boolean;
  onPatchContent?: (patch: Record<string, unknown>) => void;
  lang?: ProposalLang;
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
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
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
      return (
        <div className="proposal-avoid-break">
          <H>{num}{stage.code ? `${stage.code} — ` : ""}{stage.name}</H>
          {stage.description && <P>{stage.description}</P>}
          {richHas && <div className="mb-4">{rich}</div>}
          {deliverables.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold tracking-tight text-zinc-900">
                {L.scopeDeliverables}
              </h3>
              <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-zinc-800">
                {deliverables.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {clientInfo.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold tracking-tight text-zinc-900">
                {L.clientInfoRequired}
              </h3>
              <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-zinc-800">
                {clientInfo.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-4 text-sm">
            <div>
              <dt className="mb-1 text-sm font-semibold tracking-tight text-zinc-900">{L.duration}</dt>
              <dd className="text-zinc-700">
                {stage.durationDays != null ? `${stage.durationDays} ${L.daysUnit}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-sm font-semibold tracking-tight text-zinc-900">{L.fees}</dt>
              <dd className="text-zinc-700">{formatCurrencyEUR(stage.fee, lang)}</dd>
            </div>
          </dl>
          {stage.resources && stage.resources.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold tracking-tight text-zinc-900">
                {L.resourceBreakdown}
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-1.5 font-medium">{L.role}</th>
                    <th className="py-1.5 text-right font-medium">{L.hours}</th>
                  </tr>
                </thead>
                <tbody>
                  {stage.resources.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-100 last:border-0">
                      <td className="py-1.5 text-zinc-800">{r.role}</td>
                      <td className="py-1.5 text-right font-mono text-zinc-800">
                        {r.hours}{L.hoursShort}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                className="py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700"
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
              <td className="py-1 text-right">{s.durationDays ?? "—"} {L.dayShort}</td>
            </tr>,
          );
        }
      };
      for (const r of roots) walk(r, 0);

      return (
        <div>
          <H>{num}{block.title}</H>
          {selfStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">{L.phase}</th>
                  <th className="py-1">{L.start}</th>
                  <th className="py-1">{L.end}</th>
                  <th className="py-1 text-right">{L.duration}</th>
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
          label: formatMonthShort(cursor, lang),
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
            {totalDays} {L.daysUnit}
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
                          className="absolute top-0 flex h-4 items-center justify-center border-l border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500"
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
                  const weeks = Math.max(
                    1,
                    Math.round((sEnd - sStart) / (86400000 * 7)),
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
                        {weeks} {weeks === 1 ? L.weekShort : L.weeksShort}
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
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
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

      // Sum of leaves only (avoid double-counting rolled-up parent fees).
      let total = 0;
      const leafSum = (s: (typeof selfStages)[number]): number => {
        const kids = kidsOf.get(s.id) ?? [];
        if (kids.length === 0) return Number(s.fee) || 0;
        return kids.reduce((acc, k) => acc + leafSum(k), 0);
      };
      total = roots.reduce((acc, r) => acc + leafSum(r), 0);

      const rows: React.ReactNode[] = [];
      const walk = (s: (typeof selfStages)[number], depth: number) => {
        const kids = kidsOf.get(s.id) ?? [];
        const label = s.code ? `${s.code} — ${s.name}` : s.name;
        const pad = { paddingLeft: `${depth * 14}px` } as React.CSSProperties;
        if (kids.length > 0) {
          rows.push(
            <tr key={s.id} className="border-b border-zinc-200 bg-zinc-50">
              <td
                colSpan={2}
                className="py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700"
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
          {selfStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">{L.phase}</th>
                  <th className="py-1 text-right">{L.fees}</th>
                </tr>
              </thead>
              <tbody>
                {rows}
                <tr className="font-semibold">
                  <td className="py-1">{L.totalArchitecture}</td>
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
          {live?.paymentSchedule?.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">{L.description}</th>
                  <th className="py-1">{L.expectedDate}</th>
                  <th className="py-1 text-right">{L.amount}</th>
                </tr>
              </thead>
              <tbody>
                {live.paymentSchedule.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100">
                    <td className="py-1">{p.label ?? p.trigger ?? "—"}</td>
                    <td className="py-1">{formatDatePT(p.plannedDate, lang)}</td>
                    <td className="py-1 text-right">{formatCurrencyEUR(p.amount, lang)}</td>
                  </tr>
                ))}
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
          <p className="proposal-signature-hint">
            {L.proposalValidity}
          </p>
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

    case "custom_text":
    default:
      return (
        <div>
          <H>{num}{block.title}</H>
          {richHas ? rich : <Empty>{L.emptyEditRight}</Empty>}
        </div>
      );
  }
}
