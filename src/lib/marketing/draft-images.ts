/** Draft asset_ids may point at capture assets or library media. Client- and server-safe. */
const BUCKET = "marketing-assets";

export type ResolvedImage = {
  id: string; source: "capture" | "library"; storage_path: string; file_name: string; mime_type: string;
  kind: string; caption: string | null; credit: string | null; url: string | null;
};

/**
 * Looks ids up in marketing_capture_assets and marketing_project_media, keeps order, adds signed URLs.
 * Pass any Supabase client: the caller's (RLS applies) or the service role.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveDraftImages(sb: any, ids: string[], ttl = 3600): Promise<ResolvedImage[]> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return [];
  const [{ data: caps }, { data: lib }] = await Promise.all([
    sb.from("marketing_capture_assets").select("id, storage_path, file_name, mime_type").in("id", uniq),
    sb.from("marketing_project_media").select("id, storage_path, file_name, mime_type, kind, caption, credit").in("id", uniq),
  ]);
  const map = new Map<string, ResolvedImage>();
  for (const a of caps ?? []) map.set(a.id, { ...a, source: "capture", kind: "photo", caption: null, credit: null, url: null });
  for (const m of lib ?? []) map.set(m.id, { ...m, source: "library", url: null });
  const list = ids.map((id) => map.get(id)).filter((x): x is ResolvedImage => !!x);
  const paths = [...new Set(list.map((x) => x.storage_path))];
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, ttl);
    const urls = new Map<string, string>();
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
    for (const x of list) x.url = urls.get(x.storage_path) ?? null;
  }
  return list;
}
