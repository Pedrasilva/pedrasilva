/**
 * Block renderer — given a PsaProposalBlock and the resolved LiveQuoteSnapshot,
 * renders the block body in the canvas with PSA-style typography.
 *
 * Live-data blocks reference quote data and never duplicate it. Manual /
 * library blocks render their `content_rich.text` field.
 */
import type { PsaProposalBlock } from "@/lib/psa-proposal/types";
import {
  type LiveQuoteSnapshot,
  formatCurrencyEUR,
  formatDatePT,
} from "@/lib/psa-proposal/live-data";

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-lg font-semibold tracking-tight text-zinc-900">
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

export function BlockBody({
  block,
  live,
  chapterNumber,
}: {
  block: PsaProposalBlock;
  live: LiveQuoteSnapshot | undefined;
  chapterNumber: number | null;
}) {
  const text = (block.content_rich?.text as string | undefined) ?? "";
  const num = chapterNumber ? `${chapterNumber}. ` : "";

  switch (block.block_type) {
    case "cover":
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
            Proposta de Honorários
          </div>
          <div className="mt-6 text-3xl font-light tracking-tight text-zinc-900">
            {live?.projectName ?? "Projeto"}
          </div>
          <div className="mt-2 text-base text-zinc-700">{live?.client ?? "Cliente"}</div>
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
        <div>
          <H>{num}Índice</H>
          <Empty>O índice é gerado automaticamente a partir dos blocos visíveis na exportação PDF.</Empty>
        </div>
      );

    case "about":
      return (
        <div>
          <H>{num}{block.title}</H>
          {text ? <P>{text}</P> : (
            <P>
              A Pedra Silva Arquitectos é um atelier de arquitetura com sede em Lisboa,
              com prática consolidada em projeto, coordenação e acompanhamento de obra.
            </P>
          )}
        </div>
      );

    case "scope":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.projectDescription && <P>{live.projectDescription}</P>}
          {text && <P>{text}</P>}
        </div>
      );

    case "stage_list":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.stages?.length ? (
            <ol className="ml-5 list-decimal space-y-1 text-sm text-zinc-800">
              {live.stages.map((s) => (
                <li key={s.id}>
                  <span className="font-medium">{s.code ? `${s.code} — ` : ""}{s.name}</span>
                  {s.durationDays != null && (
                    <span className="ml-2 text-zinc-500">({s.durationDays} dias)</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Sem fases definidas no orçamento.</Empty>
          )}
        </div>
      );

    case "stage_item":
      return (
        <div>
          <H>{num}{block.title}</H>
          <Empty>Selecione uma fase no painel direito (source_ref: {`{kind:"stage", stage_id}`}).</Empty>
        </div>
      );

    case "timeline":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.stages?.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">Fase</th>
                  <th className="py-1">Início</th>
                  <th className="py-1">Fim</th>
                  <th className="py-1 text-right">Duração</th>
                </tr>
              </thead>
              <tbody>
                {live.stages.map((s) => (
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

    case "consultants":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.consultants?.length ? (
            <table className="w-full border-collapse text-sm">
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

    case "fee_table":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.stages?.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1">Fase</th>
                  <th className="py-1 text-right">Horas</th>
                  <th className="py-1 text-right">Honorários</th>
                </tr>
              </thead>
              <tbody>
                {live.stages.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100">
                    <td className="py-1">{s.name}</td>
                    <td className="py-1 text-right">{s.hours ?? "—"}</td>
                    <td className="py-1 text-right">{formatCurrencyEUR(s.fee)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Total Arquitetura</td>
                  <td />
                  <td className="py-1 text-right">
                    {formatCurrencyEUR(live.totalArchitectureFee)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>Sem honorários para apresentar.</Empty>
          )}
        </div>
      );

    case "construction_fee":
      return (
        <div>
          <H>{num}{block.title}</H>
          <P>{text || "Os honorários da fase de obra são calculados em regime mensal durante a execução."}</P>
        </div>
      );

    case "payment_terms":
      return (
        <div>
          <H>{num}{block.title}</H>
          <P>{text || "Os honorários são facturados de acordo com o plano de pagamentos. IVA à taxa legal em vigor."}</P>
        </div>
      );

    case "payment_schedule":
      return (
        <div>
          <H>{num}{block.title}</H>
          {live?.paymentSchedule?.length ? (
            <table className="w-full border-collapse text-sm">
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
      return (
        <div>
          <H>{num}{block.title}</H>
          {text ? (
            <ul className="ml-5 list-disc space-y-1 text-sm text-zinc-800">
              {text.split("\n").filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          ) : (
            <Empty>Liste as exclusões no painel direito (uma por linha).</Empty>
          )}
        </div>
      );

    case "acceptance":
      return (
        <div>
          <H>{num}{block.title}</H>
          <P>
            A presente proposta é válida por 30 dias a contar da data acima. A aceitação
            far-se-á por assinatura abaixo.
          </P>
          <div className="mt-12 grid grid-cols-2 gap-12 text-sm">
            <div>
              <div className="h-px bg-zinc-400" />
              <div className="mt-1 text-xs text-zinc-500">Pelo Cliente</div>
            </div>
            <div>
              <div className="h-px bg-zinc-400" />
              <div className="mt-1 text-xs text-zinc-500">Pedra Silva Arquitectos</div>
            </div>
          </div>
        </div>
      );

    case "page_break":
      return <div className="my-8 border-t-2 border-dashed border-zinc-300 text-center text-[10px] uppercase tracking-widest text-zinc-400">Quebra de Página</div>;

    case "additional_services":
    case "general":
    case "suspension":
    case "custom_text":
    default:
      return (
        <div>
          <H>{num}{block.title}</H>
          {text ? text.split("\n\n").map((para, i) => <P key={i}>{para}</P>) : (
            <Empty>Sem conteúdo. Edite no painel direito.</Empty>
          )}
        </div>
      );
  }
}
