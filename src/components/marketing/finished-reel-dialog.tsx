import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useNavigate } from '@tanstack/react-router';
import { Clapperboard, Loader2, Mic, Pause, Play, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useVoiceRecorder } from './use-voice-recorder';
import { inspectReelFile, jpegCover, uploadReelVideo } from '@/lib/marketing/finished-reels-browser';
import { finishReelUpload, suggestReelCaption } from '@/lib/marketing/finished-reels.functions';
import { reelPortraitWarning, VideoValidationError } from '@/lib/marketing/video-validation';
import { languageChip, resolvePostLanguage } from '@/lib/marketing/post-language';
import type { VideoMetadata } from '@/lib/marketing/mp4-metadata';

export function FinishedReelDialog() {
  const { t } = useTranslation('marketing'); const qc=useQueryClient(); const navigate=useNavigate();
  const finish=useServerFn(finishReelUpload); const suggest=useServerFn(suggestReelCaption);
  const [open,setOpen]=useState(false); const [profileId,setProfile]=useState('');
  const [file,setFile]=useState<File|null>(null); const [meta,setMeta]=useState<VideoMetadata|null>(null);
  const [url,setUrl]=useState(''); const [cover,setCover]=useState<Blob|null>(null); const [coverUrl,setCoverUrl]=useState('');
  const [offset,setOffset]=useState(0); const [copy,setCopy]=useState(''); const [tags,setTags]=useState(''); const [note,setNote]=useState('');
  const [share,setShare]=useState(true); const [busy,setBusy]=useState(false); const [checking,setChecking]=useState(false); const [ai,setAi]=useState(false);
  const [progress,setProgress]=useState(0); const [paused,setPaused]=useState(false); const [error,setError]=useState('');
  const [audio,setAudio]=useState<Blob|null>(null); const voice=useVoiceRecorder('finished-reel');
  const video=useRef<HTMLVideoElement|null>(null); const control=useRef<{pause:()=>Promise<void>;resume:()=>void}|null>(null);
  const upload=useRef<{id:string;video_path:string;cover_path:string}|null>(null);
  const profiles=useQuery({queryKey:['marketing-reel-profiles'],enabled:open,queryFn:async()=>{
    const {data,error}=await supabase.from('marketing_project_profiles').select('id,project_id,post_language,instagram_language,pm_projects(name)').order('updated_at',{ascending:false});
    if(error)throw error; return data??[];
  }});
  const profile=profiles.data?.find(p=>p.id===profileId);
  useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
  useEffect(()=>()=>{if(coverUrl)URL.revokeObjectURL(coverUrl);},[coverUrl]);
  const putCover=(b:Blob)=>{setCover(b);setCoverUrl(URL.createObjectURL(b));};
  const pick=async(f:File|undefined)=>{
    if(!f)return; setChecking(true);setError('');setFile(null);setMeta(null);setCover(null);setCoverUrl('');upload.current=null;
    try { const m=await inspectReelFile(f);setFile(f);setMeta(m);setOffset(0);setUrl(URL.createObjectURL(f)); }
    catch(e){setError(e instanceof VideoValidationError?t(`reels.errors.${e.rule}`):t('reels.errors.metadata'));}
    finally{setChecking(false);}
  };
  const frame=async()=>{const v=video.current;if(!v||!v.videoWidth)return;try{putCover(await jpegCover(v,v.videoWidth,v.videoHeight));}catch{setError(t('reels.errors.cover'));}};
  const coverFile=async(f:File|undefined)=>{if(!f)return;try{
    const bytes=new Uint8Array(await f.slice(0,3).arrayBuffer());if(bytes[0]!==255||bytes[1]!==216)throw new Error();
    const bitmap=await createImageBitmap(f);putCover(await jpegCover(bitmap,bitmap.width,bitmap.height));bitmap.close();setError('');
  }catch{setError(t('reels.errors.cover'));}};
  const assist=async()=>{if(!profileId)return;setAi(true);setError('');try{
    let audioBase64:string|undefined;if(audio){const bytes=new Uint8Array(await audio.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);audioBase64=btoa(binary);}
    const r=await suggest({data:{profileId,note,audioBase64}});setCopy(r.copy);setTags(r.hashtags.join(' '));if(r.transcript)setNote(r.transcript);setAudio(null);
  }catch(e){const msg=e instanceof Error?e.message:String(e);setError(/credits|spending|402|403|limit/i.test(msg)?t('reels.aiBlocked'):msg);}finally{setAi(false);}};
  const save=async()=>{if(!file||!meta||!cover||!profile)return;setBusy(true);setError('');try{
    let row=upload.current;
    if(!row){const id=crypto.randomUUID();const video_path=`reels/${id}/video.${/\.mov$/i.test(file.name)?'mov':'mp4'}`;const cover_path=`reels/${id}/cover.jpg`;
      const {error}=await supabase.from('marketing_reel_uploads').insert({id,profile_id:profile.id,video_path,cover_path,file_name:file.name,mime_type:/\.mov$/i.test(file.name)?'video/quicktime':'video/mp4',metadata:JSON.parse(JSON.stringify(meta))});if(error)throw error;
      row={id,video_path,cover_path};upload.current=row;
    }
    const existing=await supabase.storage.from('marketing-assets').exists(row.video_path);
    if(!existing.data)await uploadReelVideo(file,row.video_path,setProgress,c=>{control.current=c;});
    const coverExists=await supabase.storage.from('marketing-assets').exists(row.cover_path);
    if(!coverExists.data){const {error}=await supabase.storage.from('marketing-assets').upload(row.cover_path,cover,{contentType:'image/jpeg',upsert:false});if(error)throw error;}
    const r=await finish({data:{uploadId:row.id,copy,hashtags:tags.split(/[\s,]+/).map(h=>h.replace(/^#+/,'')).filter(Boolean),shareToFeed:share}});
    for(const key of ['marketing-posts','marketing-grid-drafts','marketing-pipeline'])void qc.invalidateQueries({queryKey:[key]});
    upload.current=null;setFile(null);setMeta(null);setUrl('');setCover(null);setCoverUrl('');setCopy('');setTags('');setNote('');setProgress(0);setOpen(false);
    toast.success(t('reels.saved'));await navigate({to:'/marketing/posts',search:{draft:r.draftId,tab:'review'}});
  }catch(e){setError(e instanceof Error?e.message:t('posts.error'));}finally{setBusy(false);setPaused(false);control.current=null;}};
  return <><Button variant="outline" onClick={()=>setOpen(true)}><Clapperboard className="mr-1 h-4 w-4"/>{t('reels.add')}</Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy&&!voice.recording)setOpen(v);}}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{t('reels.add')}</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">{t('reels.checklist')}</p>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <Label>{t('glossary:entity.project')}</Label><Select value={profileId} disabled={busy||!!upload.current} onValueChange={setProfile}><SelectTrigger aria-label={t('glossary:entity.project')}><SelectValue placeholder={t('reels.projectRequired')}/></SelectTrigger><SelectContent>{profiles.data?.map(p=><SelectItem key={p.id} value={p.id}>{p.pm_projects?.name??p.id}</SelectItem>)}</SelectContent></Select>
          {profile&&<div><Badge variant="outline">{languageChip(resolvePostLanguage(profile as Parameters<typeof resolvePostLanguage>[0],'instagram'))}</Badge></div>}
          <Label htmlFor="finished-reel-video">{t('reels.video')}</Label><Input id="finished-reel-video" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" disabled={busy||checking} onChange={e=>void pick(e.target.files?.[0])}/>
          {checking&&<p role="status" className="text-xs">{t('reels.checking')}</p>}
          {meta&&<><p className="text-xs text-muted-foreground">{meta.width}×{meta.height} · {meta.duration.toFixed(1)} s · {meta.fps.toFixed(1)} fps · {meta.codec}</p>{reelPortraitWarning(meta)&&<p className="text-xs text-warning">{t('reels.ratioWarning')}</p>}</>}
          {url&&<><video ref={video} src={url} controls preload="auto" className="mx-auto aspect-[9/16] max-h-80 w-auto rounded bg-muted object-contain" onError={()=>setError(t('reels.errors.playback'))} onLoadedData={()=>void frame()} onSeeked={()=>void frame()}/><Label>{t('reels.coverFrame',{seconds:offset.toFixed(1)})}</Label><Slider aria-label={t('reels.scrub')} value={[offset]} min={0} max={Math.max(0,(meta?.duration??0)-0.1)} step={0.1} disabled={busy} onValueChange={v=>{setOffset(v[0]);if(video.current)video.current.currentTime=v[0];}}/></>}
          <Label htmlFor="finished-reel-cover">{t('reels.coverUpload')}</Label><Input id="finished-reel-cover" type="file" accept="image/jpeg,.jpg,.jpeg" disabled={busy} onChange={e=>void coverFile(e.target.files?.[0])}/>
          {coverUrl&&<img src={coverUrl} alt={t('reels.cover')} className="h-28 w-auto rounded"/>}
        </div>
        <div className="min-w-0 space-y-3">
          <Label htmlFor="reel-caption">{t('reels.caption')}</Label><Textarea id="reel-caption" value={copy} onChange={e=>setCopy(e.target.value)} rows={6} maxLength={2200} disabled={busy}/>
          <Label htmlFor="reel-tags">{t('posts.hashtags')}</Label><Input id="reel-tags" value={tags} onChange={e=>setTags(e.target.value)} disabled={busy}/>
          <div className="flex items-center justify-between gap-2"><Label htmlFor="reel-feed">{t('reels.shareToFeed')}</Label><Switch id="reel-feed" checked={share} onCheckedChange={setShare} disabled={busy}/></div>
          <Label htmlFor="reel-note">{t('reels.note')}</Label><Textarea id="reel-note" value={note} onChange={e=>setNote(e.target.value)} rows={3} maxLength={4000} disabled={busy||ai}/>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy||ai||voice.starting} onClick={()=>{if(voice.recording)void voice.stop().then(setAudio);else void voice.start();}} title={t('reels.voice')}>{voice.recording?<Square className="h-4 w-4"/>:<Mic className="h-4 w-4"/>}</Button><Button size="sm" variant="outline" disabled={!profileId||(!note.trim()&&!audio)||busy||ai||voice.recording} onClick={()=>void assist()}>{ai?<Loader2 className="mr-1 h-4 w-4 animate-spin"/>:<Sparkles className="mr-1 h-4 w-4"/>}{t('reels.suggest')}</Button></div>
          {audio&&<p className="text-xs text-muted-foreground">{t('reels.voiceReady')}</p>}
          {error&&<p role="alert" className="text-sm text-destructive break-words">{error}</p>}
          {busy&&<><Progress value={progress}/><p role="status" className="text-xs">{progress<100?t('reels.uploading',{progress}):t('reels.verifying')}</p>{control.current&&<Button size="sm" variant="outline" onClick={()=>{if(paused){control.current?.resume();setPaused(false);}else void control.current?.pause().then(()=>setPaused(true));}}>{paused?<Play className="mr-1 h-3 w-3"/>:<Pause className="mr-1 h-3 w-3"/>}{t(paused?'reels.resume':'reels.pause')}</Button>}</>}
          <Button disabled={!file||!meta||!profile||!cover||busy||ai||checking||voice.recording} onClick={()=>void save()}>{busy?<Loader2 className="mr-1 h-4 w-4 animate-spin"/>:<Clapperboard className="mr-1 h-4 w-4"/>}{t('reels.save')}</Button>
        </div>
      </div>
    </DialogContent></Dialog></>;
}