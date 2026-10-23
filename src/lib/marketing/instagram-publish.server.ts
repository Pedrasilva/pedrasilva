import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { resolveDraftImages } from './draft-images';
import { carouselBody, containerBody, type ContainerState, type PublishFormat } from './instagram-publish';
import { inspectMedia } from './instagram-media.server';
import { InstagramError, instagramGraph } from './instagram-graph.server';
type Draft = Database['public']['Tables']['marketing_post_drafts']['Row'];
type Db = SupabaseClient<Database>;

/** Every update is a compare-and-set on the persistent lock. Publishing submission is recorded BEFORE the network call. */
export async function publishInstagramDraft(db: Db, draft: Draft, token: string, ig: string, request: typeof fetch = fetch) {
  const lock=draft.publish_lock_id;
  if(!lock || draft.status!=='publishing') return;
  const graph=instagramGraph(token,request);
  const containers=Array.isArray(draft.ig_container_ids) ? draft.ig_container_ids as unknown as ContainerState[] : [];
  let step='preflight';
  const checkpoint=async(patch: Record<string,unknown>={}, send=false)=>{
    const {data,error}=await db.rpc('marketing_publish_checkpoint',{_id:draft.id,_lock:lock,_patch:patch as Json,_send:send});
    if(error) throw new InstagramError('Publication check rejected: '+error.message,'validation');
    if(data!==true) throw new InstagramError('Publication lock is no longer owned','lock');
  };
  const log=async(success:boolean,error?:InstagramError)=>{
    const {error:e}=await db.from('marketing_publish_log').insert({draft_id:draft.id,step,success,meta_error_code:error?.code??null,meta_error_message:error?.message??null});
    if(e)throw new InstagramError('Attempt log unavailable','log');
  };
  const tracked=async(path:string,fields?:Record<string,string>)=>{
    try{const r=await graph(path,fields);await log(true);return r;}catch(e){if(e instanceof InstagramError)await log(false,e);throw e;}
  };
  const ready=async(id:string)=>{
    step='container_status';
    for(let n=0;n<12;n++){
      await checkpoint();
      const r=await tracked(`${id}?fields=status_code,status`);
      if(r.status_code==='FINISHED')return;
      if(r.status_code==='ERROR'||r.status_code==='EXPIRED')throw new InstagramError('Instagram media processing failed or container expired','container');
      if(r.status_code==='PUBLISHED')throw new InstagramError('Container already published; automatic resubmission blocked','unknown');
      await new Promise(resolve=>setTimeout(resolve,2500));
    }
    throw new InstagramError('Instagram media processing timed out','processing_timeout',true);
  };
  const make=async(role:ContainerState['role'],index:number,fields:Record<string,string>)=>{
    const previous=containers.find(c=>c.role===role&&c.index===index);
    if(previous)return previous.id;
    step='create_'+role;const r=await tracked(`${ig}/media`,fields);
    if(typeof r.id!=='string')throw new InstagramError('Instagram container ID missing','container');
    containers.push({id:r.id,role,index});await checkpoint({containers});return r.id;
  };
  try {
    const {data:why,error:gate}=await db.rpc('marketing_publish_blocker',{d:draft});
    if(gate||why)throw new InstagramError(why??'Publication approval check unavailable','validation');
    if(draft.location_tag)throw new InstagramError('Location tags are not supported by automatic publishing; remove the tag and approve again','validation');
    const format:PublishFormat=draft.format==='story'?'story':draft.format==='carousel'?'carousel':draft.format==='reel'||draft.format==='video'?'reel':'single';
    const frames=draft.final_story_frames??draft.ai_story_frames;
    if(format==='story'&&Array.isArray(frames)&&frames.some(f=>f&&typeof f==='object'&&!Array.isArray(f)&&(f.kind==='text'||f.text||f.line||(f.sticker&&typeof f.sticker==='object'&&!Array.isArray(f.sticker)&&f.sticker.type!=='none'))))throw new InstagramError('Story text and stickers must already be rendered in the media; Instagram API does not add overlays','validation');
    const images=await resolveDraftImages(db,draft.asset_ids,3600);
    if(images.length!==draft.asset_ids.length||images.some(i=>!i.url))throw new InstagramError('Some approved media are missing or unreadable','validation');
    if(!images.length||format==='carousel'&&(images.length<2||images.length>10)||format!=='carousel'&&format!=='story'&&images.length!==1)throw new InstagramError('Single/reel requires one file; carousel requires 2–10 files','validation');
    const media=[];
    step='validate_media';
    for(const image of images){ if(!image.url)throw new InstagramError('Private media URL unavailable','validation');try{media.push({url:image.url,video:await inspectMedia(image.url,format,request)});}catch(e){throw new InstagramError(image.file_name+': '+(e instanceof Error?e.message:'Invalid media'),'validation');} }
    if(format==='reel'&&!media[0].video)throw new InstagramError('Reel requires a video file','validation');
    await log(true);
    const caption=[draft.final_copy??draft.ai_copy,(draft.final_hashtags??draft.ai_hashtags).map(h=>'#'+h.replace(/^#+/,'')).join(' ')].filter(Boolean).join('\n\n');
    if(caption.length>2200)throw new InstagramError('Caption exceeds 2200 characters','validation');
    step='publishing_limit';
    const quota=await tracked(`${ig}/content_publishing_limit?fields=config,quota_usage`);
    const q=quota.data?.[0];
    if(!q||typeof q.quota_usage!=='number'||typeof q.config?.quota_total!=='number')throw new InstagramError('Instagram publishing limit unavailable','limit');
    if(q.quota_usage+(format==='story'?media.length:1)>q.config.quota_total)throw new InstagramError('Instagram daily publishing limit reached','daily_limit');
    let id:string;
    if(format==='carousel'){
      const children=[];
      for(let i=0;i<media.length;i++){const child=await make('child',i,containerBody(format,media[i],'',true));await ready(child);children.push(child);}
      id=await make('parent',0,carouselBody(children,caption));
    }else if(format==='story'){
      let lastId:string|null=null;
      for(let i=0;i<media.length;i++){
        const storyId=await make('story',i,containerBody(format,media[i],''));await ready(storyId);
        const {data:send,error:sendError}=await db.rpc('marketing_story_send',{_id:draft.id,_lock:lock,_container:storyId});
        if(sendError||send!==true)throw new InstagramError('Story lock or approval unavailable; no submission made','lock');
        step='media_publish';const result=await tracked(`${ig}/media_publish`,{creation_id:storyId});
        if(typeof result.id!=='string')throw new InstagramError('Story outcome unknown; verify Instagram before any retry','unknown');
        lastId=result.id;const entry=containers.find(c=>c.id===storyId);if(entry){entry.submitted=true;entry.mediaId=result.id;}
        await checkpoint({containers});
      }
      if(!lastId)throw new InstagramError('Story frames missing','validation');
      await checkpoint({media_id:lastId});return;
    }else id=await make('parent',0,containerBody(format,media[0],caption));
    await ready(id);
    step='media_publish';await checkpoint({},true);
    const published=await tracked(`${ig}/media_publish`,{creation_id:id});
    if(typeof published.id!=='string')throw new InstagramError('Instagram publication result is unknown; verify Instagram before retrying','unknown');
    // Persist the ID before reading permalink: a failed permalink read must never republish.
    await checkpoint({media_id:published.id});
    step='permalink';
    try { const result=await tracked(`${published.id}?fields=permalink,timestamp`); if(typeof result.permalink==='string')await db.from('marketing_post_drafts').update({published_url:result.permalink,ig_published_at:typeof result.timestamp==='string'?result.timestamp:new Date().toISOString()}).eq('id',draft.id).eq('ig_media_id',published.id); } catch { /* Feed refresh can repair the permalink later, no publish retry. */ }
  } catch(e) {
    const error=e instanceof InstagramError?e:new InstagramError('Publication could not be completed','internal');
    if(step!=='media_publish')await log(false,error).catch(()=>{});
    await checkpoint({error:error.message,error_code:error.code,retry:error.transient,confirmed_rejection:step==='media_publish'&&error.confirmedRejection}).catch(()=>{});
  }
}

export async function runInstagramPublishing(id?: string) {
  const token=process.env['META_SYSTEM_USER_TOKEN'];
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:settings}=await db.from('marketing_settings').select('instagram_account_id').eq('id',true).single();
  if(!token||!settings?.instagram_account_id)return {processed:0, unavailable:true};
  const {data:claimed,error}=await db.rpc('marketing_claim_publish',{_id:id});
  if(error)throw new Error('Publishing queue unavailable');
  for(const draft of claimed??[]) { await publishInstagramDraft(db,draft,token,settings.instagram_account_id);await deliverDraftFailureEmails(db,draft.id); }
  return {processed:claimed?.length??0, unavailable:false};
}

async function deliverDraftFailureEmails(db:Db,id:string){
  const {data:d}=await db.from('marketing_post_drafts').select('status,publish_error_message,publish_attempts').eq('id',id).single();
  if(d?.status!=='failed')return;
  const {data:a}=await db.from('marketing_post_approvals').select('requested_by,approver_id').eq('draft_id',id).eq('decision','approved').order('decided_at',{ascending:false}).limit(1).maybeSingle();
  if(!a)return;
  const sendOne=async(uid:string)=>{
    const {data:allowed}=await db.rpc('has_module_permission',{_user_id:uid,_key:'marketing.view',_required_scope:'all'});if(!allowed)return;
    try{const {userName,NUDGE_APP_URL}=await import('./nudges.server');const recipient=await userName(uid);if(!recipient.email)return;
      const {sendTemplateEmail}=await import('@/lib/email-templates/send-email');
      await sendTemplateEmail('marketing-publish-failed',recipient.email,{idempotencyKey:`ig-failure-${id}-${d.publish_attempts}-${uid}`,templateData:{reason:d.publish_error_message??'',draftUrl:NUDGE_APP_URL+'/marketing/posts?draft='+id}});
    }catch{ /* Email service handles delivery retries; no email queue or dispatcher. */ }
  };
  await sendOne(a.requested_by);
  if(a.approver_id!==a.requested_by)await sendOne(a.approver_id);
}
