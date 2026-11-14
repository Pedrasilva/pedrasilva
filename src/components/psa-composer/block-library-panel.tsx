import { DEFAULT_LETTER_SETTINGS } from "@/lib/psa-proposal/letter";
import { useProposal } from "@/lib/psa-proposal/use-psa-proposal";
import { BLOCK_UI_KEYS } from "./editor-labels";
import { useTranslation } from "react-i18next";
import uiI18n from "@/i18n/index";
/**
 * Block library panel — left sidebar.
 * Shows all library entries grouped by canonical PSA order; click to append
 * a new block to the proposal.
 */
import { Plus, Search, ChevronDown, ChevronRight, GripVertical, MoreHorizontal, Copy, Eye, EyeOff, Trash2, FileText, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useUpdateBlock, useDeleteBlock, useDuplicateBlock } from '@/lib/psa-proposal/use-psa-proposal';
import { stageOrderRanks } from '@/lib/quotes/stage-numbering';
import { LIBRARY_GROUPS, outlineBlocks, moveOutlineBlock, blockLibraryKey, libraryEntryKey, libraryGroup, isRepeatable, appliesToDocument } from './library-model';
import { toast } from '@/lib/toast';
import { useBlockLibrary, useAddLibraryBlock } from "@/lib/psa-proposal/use-psa-proposal";
import { useLiveQuoteSnapshot, resolveProposalLang } from "@/lib/psa-proposal/live-data";

import type { PsaProposalBlock, PsaLibraryEntry } from "@/lib/psa-proposal/types";

export function BlockLibraryPanel({
  proposalId,
  blocks,
  quoteIdHint,
  selectedId,
  onInserted,
  onSelect,
  onReorder,
  source,
}: {
  proposalId: string;
  blocks: PsaProposalBlock[];
  quoteIdHint?: string | null;
  selectedId?: string | null;
  onInserted?: (id: string) => void;
  onSelect: (id: string) => void;
  onReorder: (blocks: PsaProposalBlock[]) => void;
  source: HTMLDivElement | null;
}) {
  const { t } = useTranslation();
  const proposal = useProposal(proposalId);
  const lib = useBlockLibrary();
  const add = useAddLibraryBlock(proposalId);
  const live = useLiveQuoteSnapshot(quoteIdHint ?? null, resolveProposalLang(proposal.data?.language), proposalId);
  const [q, setQ] = useState("");

  const update = useUpdateBlock(proposalId);
  const del = useDeleteBlock(proposalId);
  const dup = useDuplicateBlock(proposalId);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PsaProposalBlock | null>(null);
  const [pages, setPages] = useState<Record<string,string>>({});
  const ranks = stageOrderRanks((live.data?.stages ?? []).map(s=>({id:s.id,name:s.name,parent_stage_id:s.parentStageId,sort_order:s.sortOrder})));
  const sorted = outlineBlocks(blocks,ranks);
  useEffect(()=>{
    const refresh = () => {
      const frame = source?.closest('[data-composer-layout]')?.querySelector<HTMLIFrameElement>('iframe.proposal-pagination-frame');
      const result: Record<string,string> = {};
      frame?.contentDocument?.querySelectorAll<HTMLElement>('.pagedjs_page').forEach((page,index)=>{
        page.querySelectorAll<HTMLElement>('[data-proposal-block-id]').forEach(node=>{
          const id=node.dataset.proposalBlockId;
          if(id && !result[id]) result[id]=page.dataset.contentNumber || String(index+1);
        });
      });
      setPages(previous=>JSON.stringify(previous)===JSON.stringify(result)?previous:result);
    };
    refresh(); const timer=window.setInterval(refresh,1200);
    return ()=>window.clearInterval(timer);
  },[source]);
  const selectedBlock = selectedId ? sorted.find((b) => b.id === selectedId) : null;
  const lastOrder = sorted.length ? sorted[sorted.length - 1].sort_order : 0;
  const afterOrder = selectedBlock ? selectedBlock.sort_order : lastOrder;

  const manualEntries: PsaLibraryEntry[] = [
    {id:'letter',kind:'letter',label:'Carta',default_title:'Carta',default_content_rich:{html:(proposal.data?.style_settings.letterSettings??DEFAULT_LETTER_SETTINGS).templates[proposal.data?.language??'pt-PT']??DEFAULT_LETTER_SETTINGS.templates['pt-PT'],letterSettings:proposal.data?.style_settings.letterSettings??DEFAULT_LETTER_SETTINGS},default_source_type:'mixed',default_source_ref:{},default_contract_relevance:'proposal_only',sort_hint:1,is_system:false},
    {
      id: "custom",
      kind: "custom_text",
      label: "Texto Livre",
      default_title: "Novo bloco",
      default_content_rich: { text: "" },
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "gantt-partial",
      kind: "gantt_partial",
      label: "Gantt Parcial",
      default_title: "Cronograma — Fase",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "supplier-fee-table",
      kind: "supplier_fee_table",
      label: "Honorários Fornecedores",
      default_title: "Honorários — Fornecedores",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "optional-fee-table",
      kind: "optional_fee_table",
      label: "Honorários Opcionais",
      default_title: "Serviços Opcionais",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "travel-expenses",
      kind: "travel_expenses",
      label: "Despesas de Deslocação",
      default_title: "Despesas de Deslocação",
      default_content_rich: {},
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "billable-hourly-rate",
      kind: "billable_hourly_rate",
      label: "Valor/hora Facturável",
      default_title: "Valor/hora Facturável",
      default_content_rich: { text: "" },
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },
    {
      id: "image",
      kind: "image",
      label: "Imagem",
      default_title: "Imagem",
      default_content_rich: { size: "1/2", image_id: null, caption: "" },
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "proposal_only",
      sort_hint: 999,
      is_system: false,
    },



    {
      id: "appendix-index",
      kind: "appendix_index",
      label: "Índice de Anexos",
      default_title: "Anexos",
      default_content_rich: {},
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "both",
      sort_hint: 1000,
      is_system: false,
    },
    {
      id: "appendix-payment",
      kind: "appendix_payment_schedule",
      label: "Anexo A — Cronograma de Pagamentos",
      default_title: "Cronograma Mensal de Pagamentos",
      default_content_rich: { appendix_letter: "A", enabled: true },
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "both",
      sort_hint: 1001,
      is_system: false,
    },
    {
      id: "appendix-gantt",
      kind: "appendix_gantt",
      label: "Anexo B — Programa (A3 Landscape)",
      default_title: "Programa do Projeto",
      default_content_rich: { appendix_letter: "B", enabled: true, page_orientation: "a3-landscape" },
      default_source_type: "live_quote",
      default_source_ref: {},
      default_contract_relevance: "both",
      sort_hint: 1002,
      is_system: false,
    },
    {
      id: "appendix-general-terms",
      kind: "appendix_general_terms",
      label: "Anexo C — Termos Gerais PSA",
      default_title: "Termos Gerais de Prestação de Serviços",
      default_content_rich: { appendix_letter: "C", enabled: true },
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "both",
      sort_hint: 1003,
      is_system: false,
    },
    {
      id: "page-break",
      kind: "page_break",
      label: "Quebra de Página",
      default_title: "Quebra de Página",
      default_content_rich: {},
      default_source_type: "manual",
      default_source_ref: {},
      default_contract_relevance: "both",
      sort_hint: 999,
      is_system: false,
    },
  ];
  // Semantic variants use existing text blocks; no schema or stored-document migration.
  manualEntries.push({...manualEntries[1], id:'description', default_title:'Descrição do Projeto', default_content_rich:{html:'',libraryRole:'description'}},
    {...manualEntries[1], id:'table', default_title:'Tabela', default_content_rich:{html:'<table><tbody><tr><td></td><td></td></tr></tbody></table>',libraryRole:'table'}});
  const entries = [...new Map([...(lib.data ?? []),...manualEntries].map(entry=>[libraryEntryKey(entry),entry])).values()];
  const counts=new Map<string,number>();
  blocks.forEach(block=>{const key=blockLibraryKey(block); counts.set(key,(counts.get(key)??0)+1); if(key!==block.block_type && block.block_type!=='custom_text') counts.set(block.block_type,(counts.get(block.block_type)??0)+1);});
  const label = (entry: PsaLibraryEntry) => libraryEntryKey(entry)==='description' ? t('crm:quoteEditor.library.description') : libraryEntryKey(entry)==='table' ? t('crm:quoteEditor.library.table') : t(BLOCK_UI_KEYS[entry.kind]);
  const matches=(text:string)=>text.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  const documentType = blocks.some(b=>b.source_type==='contract_clause') ? 'contract' : 'proposal';
  const available=entries.filter(entry=>matches(label(entry)) && (allTypes || appliesToDocument(entry.default_contract_relevance,documentType)));
  const usedSingles=available.filter(entry=>!isRepeatable(libraryEntryKey(entry)) && counts.has(libraryEntryKey(entry))).length;
  const visibleEntries=available.filter(entry=>showAll || isRepeatable(libraryEntryKey(entry)) || !counts.has(libraryEntryKey(entry)));

  function pickNextStageId(): string | undefined {
    const stages = (live.data?.stages ?? []).filter(
      (s) => s.isSelf && !s.isMilestone,
    );
    if (!stages.length) return undefined;
    const used = new Set(
      blocks
        .filter((b) => b.block_type === "stage_item")
        .map((b) => (b.source_ref as { stage_id?: string } | undefined)?.stage_id)
        .filter(Boolean) as string[],
    );
    return (stages.find((s) => !used.has(s.id)) ?? stages[0]).id;
  }

  function addBlock(libEntry: PsaLibraryEntry) {
    let entry = libEntry;
    if (libEntry.kind === "stage_item") {
      const stageId = pickNextStageId();
      if (stageId) {
        entry = {
          ...libEntry,
          default_source_ref: { ...(libEntry.default_source_ref ?? {}), stage_id: stageId },
        };
      }
    }
    add.mutate(
      { lib: entry, afterOrder },
      {
        onSuccess: (res) => {
          toast.success(uiI18n.t("crm:quoteEditor.blockAdded", { value1: entry.default_title }));
          onInserted?.(res.id);
          // Scroll the newly inserted block into view after re-render.

          setTimeout(() => {
            const el = document.querySelector(
              `[data-proposal-block-id="${res.id}"]`,
            );
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 250);
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : uiI18n.t("crm:quoteEditor.addBlockFailed");
          toast.error(msg);
        },
      },
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-background text-sm" data-block-library>
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">{t('crm:quoteEditor.blockLibrary')}</div>
        <div className="relative"><Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('crm:quoteEditor.searchBlocks')} className="h-8 pl-8" /></div>
        <Button variant="ghost" size="sm" className="h-7 w-full justify-start text-xs" aria-pressed={allTypes} onClick={()=>setAllTypes(!allTypes)}>{allTypes ? <Eye className="mr-2 h-3 w-3"/> : <EyeOff className="mr-2 h-3 w-3"/>}{t('crm:quoteEditor.library.otherTypes')}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" data-library-scroll>
        <Button variant="ghost" className="h-8 w-full justify-start text-xs font-semibold uppercase" aria-expanded={outlineOpen} onClick={()=>setOutlineOpen(!outlineOpen)}>{outlineOpen?<ChevronDown className="mr-1 h-3 w-3"/>:<ChevronRight className="mr-1 h-3 w-3"/>}{t('crm:quoteEditor.library.outline')}<span className="ml-auto text-muted-foreground">{blocks.length}</span></Button>
        {outlineOpen && <ul className="mb-4">{sorted.filter(b=>matches(b.title)).map(block=><li key={block.id} data-outline-block={block.id} draggable={!block.is_locked} onDragStart={()=>setDragged(block.id)} onDragEnd={()=>setDragged(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); if(dragged && dragged!==block.id) onReorder(moveOutlineBlock(sorted,dragged,block.id,ranks));setDragged(null);}} className={`flex h-8 min-w-0 items-center rounded-sm ${selectedId===block.id?'bg-accent text-accent-foreground':''} ${!block.is_visible?'text-muted-foreground opacity-50':''}`}>
          <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-muted-foreground" />
          <Button variant="ghost" className="h-8 min-w-0 flex-1 justify-start gap-2 px-1 text-xs" onClick={()=>onSelect(block.id)} title={block.title}><span className="truncate">{block.title || t(BLOCK_UI_KEYS[block.block_type])}</span><span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{block.is_visible ? pages[block.id] ?? '—' : <EyeOff className="h-3 w-3"/>}</span></Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-6 shrink-0" aria-label={t('crm:quoteEditor.library.actions',{title:block.title})}><MoreHorizontal className="h-3.5 w-3.5"/></Button></DropdownMenuTrigger><DropdownMenuContent>
            <DropdownMenuItem disabled={block.is_locked || dup.isPending} onSelect={()=>dup.mutate(block)}><Copy className="mr-2 h-4 w-4"/>{t('common:duplicate')}</DropdownMenuItem>
            <DropdownMenuItem disabled={block.is_locked || update.isPending} onSelect={()=>update.mutate({id:block.id,patch:{is_visible:!block.is_visible}})}><EyeOff className="mr-2 h-4 w-4"/>{t(block.is_visible?'crm:quoteEditor.library.hide':'crm:quoteEditor.library.show')}</DropdownMenuItem>
            <DropdownMenuItem disabled={block.is_locked || del.isPending} onSelect={()=>setDeleteTarget(block)}><Trash2 className="mr-2 h-4 w-4"/>{t('common:delete')}</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </li>)}</ul>}
        <Button variant="ghost" className="h-8 w-full justify-start text-xs font-semibold uppercase" aria-expanded={addOpen} onClick={()=>setAddOpen(!addOpen)}>{addOpen?<ChevronDown className="mr-1 h-3 w-3"/>:<ChevronRight className="mr-1 h-3 w-3"/>}{t('crm:quoteEditor.library.add')}</Button>
        {addOpen && <>
          <Button variant="ghost" size="sm" className="h-7 w-full justify-start text-xs text-muted-foreground" aria-pressed={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?<EyeOff className="mr-2 h-3 w-3"/>:<Eye className="mr-2 h-3 w-3"/>}{t('crm:quoteEditor.library.showAll',{count:usedSingles})}</Button>
          {LIBRARY_GROUPS.map(group=>{
            const grouped=visibleEntries.filter(entry=>libraryGroup(entry)===group);
            if(!grouped.length) return null;
            return <section key={group} className="mt-3" data-library-group={group}><h3 className="px-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">{t(`crm:quoteEditor.library.groups.${group}`)}</h3>
              {grouped.map(entry=>{
                const key=libraryEntryKey(entry); const count=counts.get(key)??0; const used=!isRepeatable(key)&&count>0;
                return <HoverCard key={key} openDelay={350}><HoverCardTrigger asChild><Button variant="ghost" disabled={add.isPending} className={`h-8 w-full justify-start gap-2 px-2 text-xs ${used?'text-muted-foreground':''}`} onClick={()=>{if(used){const block=sorted.find(b=>blockLibraryKey(b)===key);if(block)onSelect(block.id);}else addBlock(entry);}} data-library-key={key}>
                  {used?<ArrowRight className="h-3 w-3 shrink-0"/>:<Plus className="h-3 w-3 shrink-0"/>}<span className="truncate">{label(entry)}</span>{count>0 && <span className="ml-auto shrink-0 text-[10px] tabular-nums">{used?t('crm:quoteEditor.library.inUse'):`×${count}`}</span>}
                </Button></HoverCardTrigger><HoverCardContent side="right" align="start" className="w-64 p-3"><div className="flex gap-3"><div className="flex h-14 w-10 shrink-0 items-center justify-center border border-border bg-muted"><FileText className="h-6 w-6 text-muted-foreground"/></div><div className="min-w-0"><p className="truncate text-xs font-medium">{label(entry)}</p><p className="mt-1 text-xs text-muted-foreground">{t(`crm:quoteEditor.library.descriptions.${group}`)}</p></div></div></HoverCardContent></HoverCard>;
              })}
            </section>;
          })}
          {!visibleEntries.length && <p className="p-3 text-xs text-muted-foreground">{t('crm:quoteEditor.noResults')}</p>}
        </>}
      </div>
      <AlertDialog open={!!deleteTarget} onOpenChange={open=>{if(!open)setDeleteTarget(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('common:delete')}</AlertDialogTitle><AlertDialogDescription>{t('crm:quoteEditor.deleteBlockPrompt')} {deleteTarget?.title}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel><AlertDialogAction onClick={()=>{if(deleteTarget)del.mutate(deleteTarget.id);setDeleteTarget(null);}}>{t('common:delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </aside>
  );
}
