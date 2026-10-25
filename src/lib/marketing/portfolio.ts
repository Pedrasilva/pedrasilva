export type MarketingProjectOption = { id: string; name: string; client?: string | null; profile_id: string | null; portfolio: boolean; live_project_id?: string | null };
export function redactProtectedNames(text: string, names: string[]) {
  return names.filter(n=>n.trim().length>=2).sort((a,b)=>b.length-a.length).reduce((s,n)=>s.replace(new RegExp(n.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'[confidential project]'),text);
}
export function captureProjectPatch(key: string | null, options: MarketingProjectOption[]) {
  const p = options.find(p => p.id === key);
  return { project_id: p?.portfolio ? null : p?.live_project_id ?? key, profile_id: p?.profile_id ?? null };
}
export function safeProfileForAI<T extends { name_rule: string; project_name?: string | null; client?: string | null; aliases?: string[]; sector?: string | null; location?: string | null }>(p: T): T {
  if (p.name_rule === 'name') return p;
  return { ...p, project_name: null, client: null, aliases: [], ...(p.name_rule === 'never_mention' ? { sector: null, location: null } : {}) };
}