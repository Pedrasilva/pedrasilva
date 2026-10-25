import { useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/hooks/use-permissions-v2';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { useMarketingProjectDirectory } from '@/lib/marketing/projects';
import type { MarketingProjectOption } from '@/lib/marketing/portfolio';
import { PortfolioDialog } from './portfolio-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function MarketingProjectPicker({value,onChange,label,emptyLabel,emptyValue='',profileValue=false,disabled=false,options,allowCreate=true}: {value:string|null;onChange:(v:string)=>void;label:string;emptyLabel?:string;emptyValue?:string;profileValue?:boolean;disabled?:boolean;options?:MarketingProjectOption[];allowCreate?:boolean}) {
  const {t}=useTranslation('marketing');const {allowed}=useCan('marketing.curate','all'); const {data=[]}=useMarketingProjectDirectory();
  const [open,setOpen]=useState(false);const [create,setCreate]=useState(false);
  const qc=useQueryClient();
  const rows=(options??data).filter(p=>!profileValue||p.profile_id||allowed); const key=(p:MarketingProjectOption)=>profileValue?p.profile_id??'':p.id;
  const select=async(p:MarketingProjectOption)=>{
    if(profileValue&&!p.profile_id){
      const {data:created,error}=await supabase.from('marketing_project_profiles').insert({project_id:p.live_project_id??p.id}).select('id').single();
      if(error||!created){toast.error(t('profiles.error'));return;}
      onChange(created.id);await qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('marketing-')});
    }else onChange(key(p));
    setOpen(false);
  };
  const selected=rows.find(p=>key(p)===value);
  return <><Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} className="w-full min-w-0 justify-between font-normal"><span className="truncate">{selected?.name??emptyLabel??label}</span>{selected?.portfolio&&<Badge variant="secondary" className="ml-2 text-xs">{t('portfolio.label')}</Badge>}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/></Button></PopoverTrigger>
    <PopoverContent className="w-[min(360px,calc(100vw-32px))] p-0" align="start"><Command><CommandInput placeholder={t('portfolio.search')}/><CommandList><CommandEmpty>{t('profiles.empty')}</CommandEmpty><CommandGroup>
      {emptyLabel&&<CommandItem value={emptyLabel} onSelect={()=>{onChange(emptyValue);setOpen(false);}}>{emptyLabel}</CommandItem>}
      {rows.map(p=><CommandItem key={p.id} value={`${p.name} ${p.client??''} ${p.id}`} onSelect={()=>void select(p)}><Check className={`h-4 w-4 ${key(p)===value?'opacity-100':'opacity-0'}`}/><span className="min-w-0 flex-1 break-words">{p.name}</span>{p.portfolio&&<Badge variant="secondary" className="text-xs">{t('portfolio.label')}</Badge>}</CommandItem>)}
    </CommandGroup></CommandList></Command>{allowed&&allowCreate&&<Button variant="ghost" className="w-full justify-start border-t" onClick={()=>{setOpen(false);setCreate(true);}}><Plus className="mr-2 h-4 w-4"/>{t('portfolio.create')}</Button>}</PopoverContent></Popover>
    <PortfolioDialog open={create} onOpenChange={setCreate} onCreated={p=>onChange(key(p))}/></>;
}