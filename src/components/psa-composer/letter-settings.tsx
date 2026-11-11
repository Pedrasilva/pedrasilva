import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLetterSettings,useSaveLetterSettings } from '@/lib/psa-proposal/use-letter-settings';
import type { LetterSettings } from '@/lib/psa-proposal/letter';
import { RichTextEditor } from './rich-text-editor';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
function Editor({initial,revision}:{initial:LetterSettings;revision:number}){
  const {t}=useTranslation('common');const [settings,setSettings]=useState(initial);const save=useSaveLetterSettings();
  return <section className="mt-8 space-y-4 border-t pt-6"><h2 className="text-xl font-semibold">{t('letter.settings')}</h2>{['pt-PT','en'].map(lang=><div key={lang}><Label>{lang==='en'?'English':'Português (Portugal)'}</Label><RichTextEditor value={settings.templates[lang]??''} onChange={({html})=>setSettings(s=>({...s,templates:{...s.templates,[lang]:html}}))}/></div>)}<Label htmlFor="signature-file">{t('letter.signature')}</Label><Input id="signature-file" type="file" accept="image/png,image/jpeg" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>1000000){toast.error(t('letter.imageLimit'));return;}const reader=new FileReader();reader.onload=()=>setSettings(s=>({...s,signatureData:String(reader.result)}));reader.readAsDataURL(file);}}/>{settings.signatureData&&<img src={settings.signatureData} alt={settings.signatoryName} className="max-h-24"/>}<p>{settings.signatoryName}</p><Button disabled={save.isPending} onClick={()=>save.mutate({settings,revision},{onSuccess:()=>toast.success(t('masterPage.saved')),onError:e=>toast.error(e.message)})}>{t('save')}</Button></section>;
}
export function PracticeLetterSettings(){const q=useLetterSettings();return q.data?<Editor key={q.data.revision} initial={q.data.settings} revision={q.data.revision}/>:null;}