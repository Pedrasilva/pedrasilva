import { supabase } from '@/integrations/supabase/client';
import { mp4Metadata, type VideoMetadata } from './mp4-metadata';
import { REEL_MAX_BYTES, validateVideo, VideoValidationError } from './video-validation';

/** Bounded headers only, matching the publisher's fast-start envelope. Never load 1 GiB into memory. */
export async function inspectReelFile(file: File): Promise<VideoMetadata> {
  if (!/\.(mp4|mov)$/i.test(file.name)) throw new VideoValidationError('type', 'MP4 or MOV required');
  if (file.size > REEL_MAX_BYTES) throw new VideoValidationError('size', 'Maximum 1 GiB');
  let metadata: VideoMetadata | null;
  try { metadata = mp4Metadata(new Uint8Array(await file.slice(0, 32 * 1024 * 1024).arrayBuffer()), file.size); }
  catch { throw new VideoValidationError('metadata', 'Unable to read video metadata'); }
  if (!metadata) throw new VideoValidationError('metadata', 'Export a fast-start MP4/MOV; metadata must be within the first 32 MiB');
  validateVideo(metadata, file.size, 'reel');
  return metadata;
}

export async function jpegCover(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  // A reduced whole frame, never a crop; JPEG fits the publisher's image bounds.
  canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--background').trim() || 'Canvas';
  ctx.fillRect(0,0,1080,1920);
  const scale=Math.min(1080/width,1920/height);
  ctx.drawImage(source,(1080-width*scale)/2,(1920-height*scale)/2,width*scale,height*scale);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Cover unavailable')), 'image/jpeg', 0.9));
}

/** Explicit destination fingerprint ensures only this upload session is resumed. */
export async function uploadReelVideo(file: File, path: string, onProgress: (pct: number) => void, onControl: (control: { pause: () => Promise<void>; resume: () => void }) => void) {
  const { Upload } = await import('tus-js-client');
  const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
  if (!token) throw new Error('No session');
  await new Promise<void>((resolve, reject) => {
    const up = new Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'x-upsert': 'false' },
      metadata: { bucketName: 'marketing-assets', objectName: path, contentType: /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4', cacheControl: '3600' },
      fingerprint: async () => `psa-reel:${path}:${file.size}:${file.lastModified}`,
      chunkSize: 6 * 1024 * 1024, retryDelays: [0, 3000, 5000, 10000, 20000], uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(Math.round(sent / total * 100)), onSuccess: () => resolve(), onError: reject,
    });
    onControl({ pause: () => up.abort(), resume: () => up.start() });
    up.findPreviousUploads().then(prev => { if (prev[0]) up.resumeFromPreviousUpload(prev[0]); up.start(); }).catch(reject);
  });
}