import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {toast} from '@/lib/toast';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {useQuoteTemplates} from '@/lib/quotes/quote-templates';
import {templateSections,defaultTemplateSelection,replacedSections,type TemplatePreview} from '@/lib/quotes/full-template';

export function ImportFullTemplateDialog({quoteId,open,onOpenChange}:{quoteId:string;open:boolean;onOpenChange:(open:boolean)=>void}) {
 const {t}=useTranslation('crm');const qc=useQueryClient();
 const [template,setTemplate]=useState('');const [selection,setSelection]=useState({...defaultTemplateSelection});
 const [confirm,setConfirm]=useState(false);const [undoId,setUndoId]=useState<string|null>(null);
 const templates=useQuoteTemplates();
 const preview=useQuery({queryKey:['full-template-preview',quoteId,template],enabled:open && !!template,queryFn:async()=>{
  const r=await supabase.rpc('quote_template_preview',{_quote_id:quoteId,_template_id:template});if(r.error)throw Error(r.error.message);return r.data as unknown as TemplatePreview;
 }});
 const refresh=()=>qc.invalidateQueries();
 const apply=useMutation({mutationFn:async()=>{
  if(!preview.data)throw Error(t('quoteTemplate.previewRequired'));
  const r=await supabase.rpc('quote_import_full_template',{_quote_id:quoteId,_template_id:template,_sections:selection,_revision:preview.data.revision});if(r.error)throw Error(r.error.message);return r.data;
 },onSuccess:async id=>{setUndoId(id);setConfirm(false);await refresh();toast.success(t('quoteTemplate.imported'));},onError:(e:Error)=>toast.error(e.message)});
 const undo=useMutation({mutationFn:async()=>{if(!undoId)return;const r=await supabase.rpc('quote_undo_template_import',{_import_id:undoId});if(r.error)throw Error(r.error.message);},onSuccess:async()=>{setUndoId(null);await refresh();toast.success(t('quoteTemplate.undone'));},onError:(e:Error)=>toast.error(e.message)});
 const replacements=preview.data?replacedSections(preview.data,selection):[];
 const pending=apply.isPending||undo.isPending;
 return <Dialog open={open} onOpenChange={v=>{onOpenChange(v);setConfirm(false);}}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{t('quoteEditor.importTemplate')}</DialogTitle><DialogDescription>{t('quoteTemplate.relativeHint')}</DialogDescription></DialogHeader>
 {undoId?<><p>{t('quoteTemplate.imported')}</p><p className="text-sm text-muted-foreground">{t('quoteTemplate.undoHint')}</p><Button variant="outline" onClick={()=>undo.mutate()} disabled={pending}>{t('quoteTemplate.undo')}</Button></>:<>
 <Select value={template} onValueChange={v=>{setTemplate(v);setConfirm(false);}}><SelectTrigger aria-label={t('quoteTemplate.choose')}><SelectValue placeholder={t('quoteTemplate.choose')}/></SelectTrigger><SelectContent>{templates.data?.filter(x=>x.is_active).map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {t('quoteEditor.stageCount',{count:x.stages_count})} · {t('quoteEditor.blockCount',{count:x.blocks_count})}</SelectItem>)}</SelectContent></Select>
 {preview.isFetching && <p>{t('common:loading')}</p>}{preview.error && <p className="text-destructive">{preview.error.message}</p>}
 {preview.data && <>{preview.data.version<2 && <p className="text-sm text-destructive">{t('quoteTemplate.legacyHint')}</p>}
 <div className="space-y-4">{templateSections.map(section=><div key={section}><Label className="flex gap-3 items-start"><Checkbox checked={selection[section]} onCheckedChange={v=>{setSelection(x=>({...x,[section]:v===true}));setConfirm(false);}}/><span>{t(`quoteTemplate.${section}`)} <span className="text-muted-foreground">({preview.data.counts[section]})</span></span></Label><p className="ml-7 text-xs text-muted-foreground">{t(`quoteTemplate.${section}Hint`)}</p>{section==='fees' && <Label className="ml-7 mt-2 flex gap-3 items-center"><Checkbox checked={selection.feeValues} disabled={!selection.fees} onCheckedChange={v=>setSelection(x=>({...x,feeValues:v===true}))}/>{t('quoteTemplate.feeValues')}</Label>}</div>)}</div>
 {confirm && <div className="border-l-2 border-destructive pl-3 text-sm" role="alert"><p>{replacements.length?t('quoteTemplate.overwrite',{sections:replacements.map(x=>t(`quoteTemplate.${x}`)).join(', ')}):t('quoteTemplate.blankConfirmation')}</p><p className="mt-2">{t('quoteTemplate.undoHint')}</p></div>}</>}
 </>}
 <DialogFooter><Button variant="ghost" onClick={()=>onOpenChange(false)} disabled={pending}>{t('common:close')}</Button>{!undoId && <Button variant={confirm?'destructive':'default'} disabled={!preview.data||pending||preview.isFetching||!templateSections.some(x=>selection[x])} onClick={()=>confirm?apply.mutate():setConfirm(true)}>{confirm?t('quoteTemplate.confirm'):t('common:continue')}</Button>}</DialogFooter>
 </DialogContent></Dialog>;
}