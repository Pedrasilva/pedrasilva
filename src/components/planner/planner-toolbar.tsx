import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignVerticalJustifyStart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlannerOutlineTools, PlannerZoom } from './planner-surface';
import { GanttHistoryControls } from './gantt-history-controls';
type Zoom='fit'|'year'|'quarter'|'month'|'week';
export function PlannerToolbar({mode,scope,disabled,selected,add,indent,outdent,reflow,reflowing,extras,zoom,setZoom,poolCollapsed,togglePool,getTarget}: {
 mode:'quote'|'project';scope:string;disabled:boolean;selected:boolean;add:()=>void;indent:()=>void;outdent:()=>void;
 reflow:()=>void;reflowing?:boolean;extras?:ReactNode;zoom:Zoom;setZoom:(z:Zoom)=>void;poolCollapsed:boolean;togglePool:()=>void;getTarget:()=>HTMLElement|null;
}){
 const {t}=useTranslation('crm');
 return <div data-planner-toolbar className="flex flex-wrap items-center justify-between gap-3">
  <div className="flex flex-wrap items-center gap-2">
   <PlannerOutlineTools disabled={disabled} selected={selected} add={add} indent={indent} outdent={outdent}/>
   <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={disabled||reflowing} onClick={reflow} title={t('workspace.planning.reflow.tooltip')}>
    <AlignVerticalJustifyStart className="mr-1 h-3.5 w-3.5"/>{t(reflowing?'workspace.planning.reflow.running':'workspace.planning.reflow.button')}
   </Button>
   <GanttHistoryControls mode={mode} scope={scope} disabled={disabled}/>{extras}
  </div>
  <PlannerZoom zoom={zoom} setZoom={setZoom} poolCollapsed={poolCollapsed} togglePool={togglePool} getTarget={getTarget}/>
 </div>;
}
