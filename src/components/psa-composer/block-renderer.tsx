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
  formatCurrencyEUR,
  formatDatePT,
  formatDurationAdaptive,
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
const DEFAULT_TEXT: Partial<Record<string, string>> = {
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
}: {
  block: PsaProposalBlock;
  live: LiveQuoteSnapshot | undefined;
  chapterNumber: number | null;
  toc?: { chapter: number; title: string }[];
  editable?: boolean;
  onPatchContent?: (patch: Record<string, unknown>) => void;
}) {

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
    const t = DEFAULT_TEXT[blockType];
    if (editable && onPatchContent) {
      return rich;
    }
    return t ? <P>{t}</P> : <Empty>Sem conteúdo. Edite no painel direito.</Empty>;
  }


  switch (block.block_type) {
    case "cover":
      return (
        <div className="proposal-cover proposal-avoid-break proposal-page-break-after flex flex-col items-center justify-center py-24 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            Proposta de Honorários
          </div>
          <div className="mt-6 text-3xl font-light tracking-tight text-zinc-900">
            {live?.projectName ?? "Projeto"}
          </div>
          {live?.client && (
            <div className="mt-2 text-base text-zinc-700">{live.client}</div>
          )}
          {live?.location && (
            <div className="mt-1 text-sm text-zinc-500">{live.location}</div>
          )}
          <div className="mt-10 text-xs text-zinc-500">
            {live?.projectNumber ? `Ref. ${live.projectNumber} · ` : ""}
            {formatDatePT(live?.date)}
          </div>
        </div>
      );

    case "index":
      return (
        <div className="proposal-avoid-break">
          <H>Índice</H>
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
            <Empty>O índice é gerado automaticamente a partir dos blocos visíveis.</Empty>
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
            <Empty>Sem fases definidas no orçamento.</Empty>
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
            <Empty>
              Selecione uma fase do orçamento no painel direito para preencher este bloco.
            </Empty>
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
          {richHas && <div className="mb-3">{rich}</div>}
          {deliverables.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                Âmbito e entregáveis
              </div>
              <ul className="ml-5 list-disc space-y-0.5 text-sm text-zinc-800">
                {deliverables.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {clientInfo.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                Informação necessária do cliente
              </div>
              <ul className="ml-5 list-disc space-y-0.5 text-sm text-zinc-800">
                {clientInfo.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Duração</dt>
              <dd className="font-medium text-zinc-900">
                {stage.durationDays != null ? `${stage.durationDays} dias` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Honorários</dt>
              <dd className="font-medium text-zinc-900">{formatCurrencyEUR(stage.fee)}</dd>
            </div>
          </dl>
        </div>
      );
    }

    case "timeline":
      return (
        <div>
          <H>{num}{block.title}</H>
          {selfStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">Fase</th>
                  <th className="py-1">Início</th>
                  <th className="py-1">Fim</th>
                  <th className="py-1 text-right">Duração</th>
                </tr>
              </thead>
              <tbody>
                {selfStages.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100">
                    <td className="py-1">{s.name}</td>
                    <td className="py-1">{formatDatePT(s.startDate)}</td>
                    <td className="py-1">{formatDatePT(s.endDate)}</td>
                    <td className="py-1 text-right">{s.durationDays ?? "—"} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Sem cronograma disponível.</Empty>
          )}
        </div>
      );

    case "gantt_design":
    case "gantt_construction": {
      const scope: "design" | "construction" =
        block.block_type === "gantt_design" ? "design" : "construction";
      const designRe = /\b(design|projeto|projecto)\b/i;
      const constructionRe = /(constru[cç][aã]o|obra|construction|tender|concurso|execu[cç][aã]o)/i;
      const re = scope === "design" ? designRe : constructionRe;
      const overrideId = (block.source_ref as { parent_stage_id?: string } | undefined)?.parent_stage_id;
      const allStages = (live?.stages ?? []).filter((s) => s.isSelf);
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
      const parent =
        (overrideId && allStages.find((s) => s.id === overrideId)) ||
        shallowest ||
        null;

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
              {scope === "design"
                ? "Sem fases de projeto com datas definidas."
                : "Sem fases de obra com datas definidas."}
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
          label: cursor.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""),
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
            {formatDatePT(start.toISOString())} → {formatDatePT(end.toISOString())} ·{" "}
            {totalDays} dias
          </div>
          <div className="overflow-hidden rounded border border-zinc-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="w-[28%] px-2 py-1 text-left font-medium text-zinc-600">
                    Fase
                  </th>
                  <th className="w-[70px] px-2 py-1 text-right font-medium text-zinc-600 whitespace-nowrap">
                    Duração
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
                        {weeks} {weeks === 1 ? "sem" : "sems"}
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
                            title={`${formatDatePT(s.startDate)} → ${formatDatePT(s.endDate)}`}
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
                  <th className="py-1">Especialidade</th>
                  <th className="py-1">Consultor</th>
                  <th className="py-1 text-right">Honorários</th>
                </tr>
              </thead>
              <tbody>
                {live.consultants.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-100">
                    <td className="py-1">{c.discipline ?? "—"}</td>
                    <td className="py-1">{c.name}</td>
                    <td className="py-1 text-right">{formatCurrencyEUR(c.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Sem consultores definidos.</Empty>
          )}
        </div>
      );

    case "fee_table": {
      const total = selfStages.reduce((s, st) => s + (Number(st.fee) || 0), 0);
      return (
        <div>
          <H>{num}{block.title}</H>
          {selfStages.length ? (
            <table className="proposal-print-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">Fase</th>
                  <th className="py-1 text-right">Honorários</th>
                </tr>
              </thead>
              <tbody>
                <StageRows stages={selfStages} />
                <tr className="font-semibold">
                  <td className="py-1">Total Arquitetura</td>
                  <td className="py-1 text-right">{formatCurrencyEUR(total)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>Sem honorários para apresentar.</Empty>
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
                  <th className="py-1">Descrição</th>
                  <th className="py-1">Data prevista</th>
                  <th className="py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {live.paymentSchedule.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100">
                    <td className="py-1">{p.label ?? p.trigger ?? "—"}</td>
                    <td className="py-1">{formatDatePT(p.plannedDate)}</td>
                    <td className="py-1 text-right">{formatCurrencyEUR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Sem plano de pagamentos definido.</Empty>
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
            A presente proposta é válida por 30 dias a contar da data acima.
            A aceitação far-se-á por assinatura abaixo.
          </p>
          <div className="proposal-signature-grid">
            <div className="proposal-signature-cell">
              <div className="proposal-signature-line" />
              <div className="proposal-signature-label">Pelo Cliente</div>
            </div>
            <div className="proposal-signature-cell">
              <div className="proposal-signature-line" />
              <div className="proposal-signature-label">Pedra Silva Arquitectos</div>
            </div>
          </div>
        </div>
      );

    case "page_break":
      return (
        <div className="proposal-page-break-before my-8 border-t-2 border-dashed border-zinc-300 text-center text-[10px] uppercase tracking-widest text-zinc-400 print:border-0 print:text-transparent">
          Quebra de Página
        </div>
      );

    case "custom_text":
    default:
      return (
        <div>
          <H>{num}{block.title}</H>
          {richHas ? rich : <Empty>Sem conteúdo. Edite no painel direito.</Empty>}
        </div>
      );
  }
}
