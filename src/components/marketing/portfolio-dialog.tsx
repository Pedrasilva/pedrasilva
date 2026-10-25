import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { POST_LANGUAGES, type PostLanguage } from '@/lib/marketing/post-language';
import type { MarketingProjectOption } from '@/lib/marketing/portfolio';

export function PortfolioDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v:boolean)=>void; onCreated: (p:MarketingProjectOption)=>void }) {
  const { t } = useTranslation('marketing'); const qc=useQueryClient();
  const [name,setName]=useState(''); const [client,setClient]=useState(''); const [year,setYear]=useState('');
  const [sector,setSector]=useState('other'); const [location,setLocation]=useState(''); const [language,setLanguage]=useState<PostLanguage>('en'); const [busy,setBusy]=useState(false);
  const create=async()=>{setBusy(true);try {
    const {data,error}=await supabase.from('marketing_project_profiles').insert({project_id:null,internal_name:name.trim(),internal_client:client.trim()||null,year_completed:year?Number(year):null,sector:sector as 'other',location:location.trim()||null,post_language:language}).select('id,marketing_key').single();
    if(error||!data)throw error;
    await qc.invalidateQueries({predicate:q=>String(q.queryKey[0]).startsWith('marketing-')});
    onCreated({id:data.marketing_key,profile_id:data.id,name:name.trim(),client:client.trim()||null,portfolio:true});onOpenChange(false);setName('');setClient('');setYear('');setLocation('');
  }catch{toast.error(t('profiles.error'));}finally{setBusy(false);}};
  return <Dialog open={open} onOpenChange={v=>!busy&&onOpenChange(v)}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t('portfolio.create')}</DialogTitle></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="portfolio-name">{t('portfolio.internalName')}</Label><Input id="portfolio-name" value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="portfolio-client">{t('portfolio.internalClient')}</Label><Input id="portfolio-client" value={client} maxLength={200} onChange={e=>setClient(e.target.value)}/></div>
      <div className="space-y-1"><Label htmlFor="portfolio-year">{t('profile.yearCompleted')}</Label><Input id="portfolio-year" type="number" value={year} onChange={e=>setYear(e.target.value)}/></div>
      <div className="space-y-1"><Label>{t('filters.sector')}</Label><Select value={sector} onValueChange={setSector}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['workspace','healthcare','residential','hospitality','other'].map(s=><SelectItem key={s} value={s}>{t(`sector.${s}`)}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="portfolio-location">{t('profile.location')}</Label><Input id="portfolio-location" value={location} onChange={e=>setLocation(e.target.value)}/></div>
      <div className="space-y-1"><Label>{t('postLanguage.title')}</Label><Select value={language} onValueChange={v=>setLanguage(v as PostLanguage)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{POST_LANGUAGES.map(l=><SelectItem key={l} value={l}>{t(`postLanguage.options.${l}`)}</SelectItem>)}</SelectContent></Select></div>
    </div><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{t('common:cancel')}</Button><Button disabled={busy||!name.trim()} onClick={()=>void create()}>{t('profiles.create')}</Button></DialogFooter>
  </DialogContent></Dialog>;
}