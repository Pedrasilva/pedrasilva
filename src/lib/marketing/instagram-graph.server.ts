import { META_GRAPH_VERSION } from './meta-connection';
import { safeMetaMessage, transientMeta } from './instagram-publish';
export class InstagramError extends Error {
  constructor(message: string, public code: string, public transient=false, public confirmedRejection=false) { super(message); }
}
const isRedirect = (r: Response) => r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400);
export function instagramGraph(token: string, request: typeof fetch = fetch) {
  return async (path: string, fields?: Record<string,string>) => {
    let response: Response;
    // Workers' fetch rejects redirect "error"; "manual" + refusing 3xx keeps the token from being forwarded.
    try { response=await request(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path}`,{method:fields?'POST':'GET',headers:{Authorization:`Bearer ${token}`},body:fields?new URLSearchParams(fields):undefined,signal:AbortSignal.timeout(20000),redirect:'manual'}); }
    catch { throw new InstagramError('Instagram network response unavailable','network',true,false); }
    if (isRedirect(response)) { await response.body?.cancel().catch(()=>{}); throw new InstagramError(`Meta redirected unexpectedly (HTTP ${response.status})`,'redirect',false,false); }
    let data: Record<string,any>;
    try { data=await response.json(); } catch { throw new InstagramError('Instagram response unreadable',String(response.status),response.status>=500,false); }
    if (!response.ok || data.error) {
      const e=data.error ?? {}; throw new InstagramError(safeMetaMessage(e.message,token),String(e.code ?? response.status),transientMeta(response.status,e.code,e.is_transient),false);
    }
    return data;
  };
}
