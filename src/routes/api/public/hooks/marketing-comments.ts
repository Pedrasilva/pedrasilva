import { createFileRoute } from '@tanstack/react-router';
// Read-only comment sync job; gated by the existing Vault-held Marketing job secret.
export const Route=createFileRoute('/api/public/hooks/marketing-comments')({server:{handlers:{POST:async({request})=>{
  const provided=request.headers.get('x-publish-secret');
  if(!provided)return new Response('Unauthorized',{status:401});
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:ok,error}=await supabaseAdmin.rpc('marketing_enrich_secret_matches' as never,{p_secret:provided} as never);
  if(error||ok!==true)return new Response('Unauthorized',{status:401});
  try{const {syncInstagramComments}=await import('@/lib/marketing/instagram-comments.server');return Response.json(await syncInstagramComments());}
  catch{return Response.json({error:'Comments job unavailable'},{status:503});}
}}}});
