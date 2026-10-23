/** Draft asset_ids may point at capture assets or library media. Client- and server-safe. */
const BUCKET = "marketing-assets";

export type ResolvedImage = {
  id: string; source: "capture" | "library"; storage_path: string; file_name: string; mime_type: string;
  kind: string; caption: string | null; credit: string | null; url: string | null;
};

/** Preview sizes. Originals (no preview option) are what publishing sends to Meta. */
export const PREVIEW = { tile: 400, small: 120 } as const;
export type ResolveOptions = { preview?: number; sign?: boolean };

// Browser-only cache so the same signed URL is reused for most of its lifetime and the image stays in HTTP cache.
const cache = new Map<string, { url: string; expires: number }>();
const browser = typeof window !== "undefined";

/**
 * Signed URLs for storage paths. With `preview`, each URL serves a resized WebP (quality 70)
 * via storage image transformations; the bucket stays private. Video paths are never transformed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signPaths(sb: any, items: { path: string; video?: boolean }[], ttl = 3600, preview?: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const key = (p: string, v?: boolean) => `${p}|${v || !preview ? "orig" : preview}`;
  const todo = items.filter((i) => {
    if (out.has(i.path)) return false;
    const hit = browser ? cache.get(key(i.path, i.video)) : undefined;
    // Reuse while more than a quarter of the lifetime remains.
    if (hit && hit.expires - now > (ttl * 1000) / 4) { out.set(i.path, hit.url); return false; }
    return true;
  });
  const remember = (p: string, v: boolean | undefined, url: string) => {
    out.set(p, url);
    if (browser) cache.set(key(p, v), { url, expires: now + ttl * 1000 });
  };
  const plain = todo.filter((i) => i.video || !preview);
  const resized = todo.filter((i) => !i.video && preview);
  if (plain.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls([...new Set(plain.map((i) => i.path))], ttl);
    for (const d of data ?? []) if (d.path && d.signedUrl) remember(d.path, plain.find((i) => i.path === d.path)?.video, d.signedUrl);
  }
  await Promise.all([...new Set(resized.map((i) => i.path))].map(async (p) => {
    const { data } = await sb.storage.from(BUCKET).createSignedUrl(p, ttl, { transform: { width: preview, quality: 70 } });
    if (data?.signedUrl) remember(p, false, data.signedUrl);
  }));
  return out;
}

/**
 * Looks ids up in marketing_capture_assets and marketing_project_media, keeps order, adds signed URLs.
 * Pass any Supabase client: the caller's (RLS applies) or the service role.
 * Without options the URLs point at the full-resolution originals (used for publishing).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveDraftImages(sb: any, ids: string[], ttl = 3600, opts: ResolveOptions = {}): Promise<ResolvedImage[]> {
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
  if (opts.sign === false || !list.length) return list;
  const urls = await signPaths(sb, list.map((x) => ({ path: x.storage_path, video: x.mime_type?.startsWith("video/") })), ttl, opts.preview);
  for (const x of list) x.url = urls.get(x.storage_path) ?? null;
  return list;
}
