import assert from 'node:assert/strict';
import { publishInstagramDraft } from '../src/lib/marketing/instagram-publish.server.ts';
const jpeg=new Uint8Array([255,216,255,192,0,17,8,4,0,4,0,0,0]);
async function scenario({format='single',files=1,fence=false,unknown=false,stale=false,manual=false}={}){
 const calls=[],checkpoints=[],logs=[];let sendCount=0;
 const ids=Array.from({length:files},(_,i)=>'asset'+i);
 const assetRows=ids.map(id=>({id,storage_path:id,file_name:id+'.jpg',mime_type:'image/jpeg'}));
 const query=(table)=>({select(){return this;},in(){return Promise.resolve({data:table==='marketing_capture_assets'?assetRows:[]});},insert(v){logs.push(v);return Promise.resolve({error:null});},update(){return this;},eq(){return this;},then(resolve){resolve({error:null});}});
 const db={from:query,storage:{from(){return {async createSignedUrls(paths){return {data:paths.map(path=>({path,signedUrl:'https://media.test/'+path}))};}};}},async rpc(name,args){if(name==='marketing_publish_blocker')return {data:null,error:null};if(name==='marketing_publish_checkpoint'){checkpoints.push(args);if(args._send){sendCount++;if(fence)return {data:false,error:null};}return {data:true,error:null};}if(name==='marketing_story_send'){sendCount++;return {data:!fence,error:null};}throw Error(name);}};
 const request=async(url,init)=>{
  if(String(url).startsWith('https://media.test/'))return new Response(format==='story'?new Uint8Array([255,216,255,192,0,17,8,7,128,4,56,0,0]):jpeg,{headers:{'content-length':String(jpeg.length)}});
  const fields=init?.body?Object.fromEntries(init.body):null;calls.push({url:String(url),fields});
  if(String(url).includes('/content_publishing_limit'))return Response.json({data:[{quota_usage:0,config:{quota_total:100}}]});
  if(String(url).includes('status_code'))return Response.json({status_code:'FINISHED'});
  if(String(url).includes('/media_publish')){if(unknown)throw Error('mock lost response');return Response.json({id:'published'+calls.length});}
  if(String(url).includes('?fields=permalink'))return Response.json({permalink:'https://www.instagram.com/p/mock/',timestamp:'2026-10-23T12:00:00Z'});
  return Response.json({id:'container'+calls.length});
 };
 const draft={id:'draft',status:'publishing',publish_lock_id:'lock',ig_container_ids:[],location_tag:null,format,asset_ids:ids,ai_copy:'Caption',ai_hashtags:[],final_copy:null,final_hashtags:null,approved_content_hash:'hash',ai_story_frames:ids.map(asset_id=>({kind:'image',asset_id,text:'Burned in',sticker:{type:'none',text:''}})),story_render_manifest:format==='story'?{content_hash:stale?'old':'hash',paths:ids,automatic:!manual,sha256:[]}:null};
 await publishInstagramDraft(db,draft,'','account',request);return {calls,checkpoints,logs,sendCount};
}
const one=await scenario();assert.equal(one.calls.filter(c=>c.url.includes('/media_publish')).length,1);assert.equal(one.sendCount,1);assert.ok(one.checkpoints.some(c=>c._patch.media_id));
const carousel=await scenario({format:'carousel',files:2});assert.equal(carousel.calls.filter(c=>c.fields?.is_carousel_item==='true').length,2);assert.equal(carousel.calls.filter(c=>c.fields?.media_type==='CAROUSEL').length,1);assert.equal(carousel.calls.filter(c=>c.url.includes('/media_publish')).length,1);
const story=await scenario({format:'story',files:2});assert.equal(story.calls.filter(c=>c.fields?.media_type==='STORIES').length,2);assert.equal(story.sendCount,2);assert.equal(story.calls.filter(c=>c.url.includes('/media_publish')).length,2);assert.ok(story.checkpoints.some(c=>c._patch.containers?.every(e=>e.mediaId)));
const staleStory=await scenario({format:'story',files:2,stale:true});assert.equal(staleStory.calls.length,0);assert.ok(staleStory.checkpoints.some(c=>c._patch.error?.includes('need re-rendering')));
const manualStory=await scenario({format:'story',files:2,manual:true});assert.equal(manualStory.calls.length,0);
const fenced=await scenario({fence:true});assert.equal(fenced.calls.filter(c=>c.url.includes('/media_publish')).length,0);
const ambiguous=await scenario({unknown:true});assert.equal(ambiguous.calls.filter(c=>c.url.includes('/media_publish')).length,1);assert.ok(ambiguous.checkpoints.some(c=>c._patch.error_code==='network'&&c._patch.confirmed_rejection===false));
console.log('5 mocked pipeline scenarios passed: single, carousel, multi-frame Stories, stale lock, lost publish response. No real Graph calls.');
