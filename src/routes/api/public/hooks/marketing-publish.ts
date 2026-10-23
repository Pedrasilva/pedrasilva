import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/hooks/marketing-publish')({server:{handlers:{POST:async({request})=>{
  const provided=request.headers.get('x-publish-secret');
  if(!provided)return new Response('Unauthorized',{status:401});
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  // Reuse the existing server-only Marketing job gate; no browser-readable publishable key authorizes publication.
  const {data:ok,error}=await supabaseAdmin.rpc('marketing_enrich_secret_matches' as never,{p_secret:provided} as never);
  if(error||ok!==true)return new Response('Unauthorized',{status:401});
  const body=await request.text();if(body.trim()&&body.trim()!=='{}')return new Response('Invalid input',{status:400});
  try{const {runInstagramPublishing}=await import('@/lib/marketing/instagram-publish.server');const published=await runInstagramPublishing();
    // Same 15-minute job also refreshes comments (read-only) when the last refresh is older than 14 minutes.
    let comments:unknown=null;try{const {syncInstagramCommentsIfStale}=await import('@/lib/marketing/instagram-comments.server');comments=await syncInstagramCommentsIfStale();}catch{comments={error:'commentsUnavailable'};}
    // ...and insight snapshots (read-only) once a day.
    let insights:unknown=null;try{const {syncInstagramInsightsIfStale}=await import('@/lib/marketing/instagram-insights.server');insights=await syncInstagramInsightsIfStale();}catch{insights={error:'insightsUnavailable'};}
    return Response.json({...published,comments,insights});}
  catch{return Response.json({error:'Publishing job unavailable'},{status:503});}
}}}});
