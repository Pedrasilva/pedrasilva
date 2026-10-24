/**
 * Card thumbnails for capture images: ~600px-wide WebP (q75) stored next to the
 * original in the private marketing-assets bucket at {capture_id}/thumb-v2-{asset_id}.webp
 * (top level, so deleteCapture's folder sweep removes it too). Only the storage
 * path is saved in marketing_capture_assets.thumb_path — URLs are signed at render.
 * Resizing uses the storage image transformation (no native image libs in the worker).
 */
const BUCKET = "marketing-assets";
export const THUMB_WIDTH = 600;
export const THUMB_QUALITY = 75;

type Asset = { id: string; capture_id: string; storage_path: string; mime_type: string };
export type ThumbnailFallback = (bytes: Uint8Array) => Promise<Uint8Array>;

export function thumbPathFor(a: { id: string; capture_id: string }) {
  return `${a.capture_id}/thumb-v2-${a.id}.webp`;
}

/** Creates and records one thumbnail. Pass the service-role client. Returns bytes written or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateCaptureThumbnail(admin: any, a: Asset, fallback?: ThumbnailFallback): Promise<number | null> {
  if (!a.mime_type?.startsWith("image/")) return null;
  const { data: signed, error } = await admin.storage.from(BUCKET)
    .createSignedUrl(a.storage_path, 120, { transform: { width: THUMB_WIDTH, quality: THUMB_QUALITY, resize: "contain" } });
  if (error || !signed?.signedUrl) { console.error("thumbnail: sign failed", a.id, error?.message); return null; }
  const res = await fetch(signed.signedUrl, { headers: { Accept: "image/webp" } });
  const type = res.headers.get("content-type") ?? "";
  let bytes: Uint8Array;
  if (!res.ok || !type.startsWith("image/webp")) {
    console.error("thumbnail: transform failed", a.id, res.status, type);
    // Large-image decode must not exhaust the edge request's memory. The maintenance
    // runner supplies an out-of-process EXIF-aware encoder; never use an original as a preview.
    if (!fallback) return null;
    const { data: original, error: downloadError } = await admin.storage.from(BUCKET).download(a.storage_path);
    if (downloadError || !original) return null;
    bytes = await fallback(new Uint8Array(await original.arrayBuffer()));
  } else bytes = new Uint8Array(await res.arrayBuffer());
  const path = thumbPathFor(a);
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/webp", upsert: true });
  if (up.error) { console.error("thumbnail: upload failed", a.id, up.error.message); return null; }
  const { error: uErr } = await admin.from("marketing_capture_assets")
    .update({ thumb_path: path, thumb_size_bytes: bytes.byteLength }).eq("id", a.id);
  if (uErr) { console.error("thumbnail: record failed", a.id, uErr.message); return null; }
  return bytes.byteLength;
}

/** Thumbnails for every image of one capture still missing one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateThumbnailsForCapture(admin: any, captureId: string) {
  const { data } = await admin.from("marketing_capture_assets")
    .select("id, capture_id, storage_path, mime_type").eq("capture_id", captureId)
    .is("thumb_path", null).like("mime_type", "image/%");
  let done = 0;
  for (const a of (data ?? []) as Asset[]) if ((await generateCaptureThumbnail(admin, a)) != null) done++;
  return done;
}

/** Backfill: every image asset without a thumbnail. Idempotent; safe to re-run. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function backfillCaptureThumbnails(admin: any, opts: { limit?: number; overwrite?: boolean; fallback?: ThumbnailFallback } = {}) {
  let query = admin.from("marketing_capture_assets")
    .select("id, capture_id, storage_path, mime_type").like("mime_type", "image/%");
  if (!opts.overwrite) query = query.is("thumb_path", null);
  const { data, error } = await query.order("created_at", { ascending: true }).limit(opts.limit ?? 1000);
  if (error) throw error;
  const assets = (data ?? []) as Asset[];
  const captures = new Set<string>();
  let ok = 0, failed = 0;
  for (const a of assets) {
    if ((await generateCaptureThumbnail(admin, a, opts.fallback)) != null) { ok++; captures.add(a.capture_id); } else failed++;
  }
  return { assets: assets.length, thumbnails: ok, failed, captures: captures.size };
}
