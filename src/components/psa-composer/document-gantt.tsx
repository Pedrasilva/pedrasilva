import { documentGanttRows, documentGanttSheets } from '@/lib/psa-proposal/document-gantt';
import { formatDatePT, formatMonthShort, relativeMonthLabel, getProposalLabels, type LiveStage, type ProposalLang } from '@/lib/psa-proposal/live-data';
import type { PsaProposalBlock } from '@/lib/psa-proposal/types';
import { useTranslation } from 'react-i18next';
import { relativeProgrammeRows, relativeProgrammeTiming } from '@/lib/psa-proposal/relative-programme';
import './document-gantt.css';

export function DocumentGantt({block,stages,lang,title}:{block:PsaProposalBlock;stages:LiveStage[];lang:ProposalLang;title:string}) {
  const labels=getProposalLabels(lang);
  const {t}=useTranslation('common');
  const override=relativeProgrammeRows(block.content_rich?.relative_programme);
  const rows=documentGanttRows(stages,block.block_type,(block.source_ref as {parent_stage_id?:string})?.parent_stage_id,block.content_rich?.relative_programme);
  return <>{documentGanttSheets(rows).map((sheet,index)=>{
    const min=Math.min(...sheet.map(r=>r.start)),max=Math.max(...sheet.map(r=>r.end));
    const relative=override.length>0||new Date(min).getUTCFullYear()<2010;
    const span=Math.max(86400000,max-min);
    const months=Math.max(1,Math.ceil(span/(30.4375*86400000)));
    // All gridlines are months. Label thinning retains an 8pt floor for long programmes.
    const every=Math.max(1,Math.ceil(months/14));
    const ticks=Array.from({length:months},(_,i)=>({left:i/months*100,label:relative?relativeMonthLabel(i+1,lang):formatMonthShort(new Date(min+i*30.4375*86400000),lang)}));
    return <section key={index} className="proposal-document-gantt-sheet" data-gantt-sheet="true" data-gantt-kind={block.block_type}>
      {block.block_type==='appendix_gantt'&&<div className="proposal-document-gantt-caption">{labels.appendix} {String(block.content_rich?.appendix_letter??'B')}</div>}
      <h2>{title}{index>0?` (${index+1})`:''}</h2>
      {!sheet.length?<p>{labels.scheduleUnavailable}</p>:<>
        <div className="proposal-document-gantt-caption">{override.length?relativeProgrammeTiming({...override[0],start:Math.min(...override.map(r=>r.start)),end:Math.max(...override.map(r=>r.end))},lang):`${formatDatePT(new Date(min).toISOString(),lang)} → ${formatDatePT(new Date(max).toISOString(),lang)}`}</div>
        <table className="proposal-document-gantt-table"><thead><tr><th className="gantt-name">{labels.phase}</th><th className="gantt-duration">{labels.duration}</th><th><div className="proposal-document-gantt-axis">{ticks.filter((_,i)=>i%every===0).map(t=><span key={t.left} className="proposal-document-gantt-tick" style={{left:`${t.left}%`}}>{t.label}</span>)}</div></th></tr></thead>
        <tbody>{sheet.map(row=><tr key={row.id} className="proposal-document-gantt-row" data-group={row.group} data-gantt-row-id={row.id}>
          <td className="gantt-name">{row.number} {row.name}</td><td className="gantt-duration">{typeof row.duration==='string'?row.duration:t('duration.days',{lng:lang,count:row.duration})}</td>
          <td><div className="proposal-document-gantt-track">{ticks.map(t=><span key={t.left} className="proposal-document-gantt-grid" style={{left:`${t.left}%`}}/>)}<span className="proposal-document-gantt-bar" data-group={row.group} data-construction={row.construction} style={{left:`${(row.start-min)/span*100}%`,width:`${Math.max(.4,(row.end-row.start)/span*100)}%`}}/></div></td>
        </tr>)}</tbody></table>
      </>}
    </section>;
  })}</>;
}