import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/hooks/marketing-publish')({server:{handlers:{POST:async({request})=>{
  const provided=request.headers.get('x-publish-secret');
  if(!provided)return new Response('Unauthorized',{status:401});
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  // Reuse the existing server-only Marketing job gate; no browser-readable publishable key authorizes publication.
  const {data:ok,error}=await supabaseAdmin.rpc('marketing_enrich_secret_matches' as never,{p_secret:provided} as never);
  if(error||ok!==true)return new Response('Unauthorized',{status:401});
  const body=await request.text();if(body.trim()&&body.trim()!=='{}')return new Response('Invalid input',{status:400});
  try{const {runInstagramPublishing}=await import('@/lib/marketing/instagram-publish.server');return Response.json(await runInstagramPublishing());}
  catch{return Response.json({error:'Publishing job unavailable'},{status:503});}
}}}});
