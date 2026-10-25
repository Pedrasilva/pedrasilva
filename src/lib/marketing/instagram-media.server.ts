import { mp4Metadata } from './mp4-metadata';
import { validateVideo } from './video-validation';
export { validateVideo } from './video-validation';
import type { PublishFormat } from './instagram-publish';

/** Conservative Facebook Login publishing limits. Validate actual file headers, not filename/MIME alone. */
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  let p = 2;
  while (p + 8 < bytes.length) {
    if (bytes[p++] !== 255) return null;
    const marker = bytes[p++];
    if (marker === 217 || marker === 218) break;
    if (marker === 216 || marker === 1) continue;
    const len = (bytes[p] << 8) | bytes[p+1];
    if (len < 2) return null;
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) return { height: (bytes[p+3]<<8)|bytes[p+4], width:(bytes[p+5]<<8)|bytes[p+6] };
    p += len;
  }
  return null;
}
export function validateImage(width: number, height: number, size: number, format: PublishFormat) {
  if (size >= 8*1024*1024) throw new Error('JPEG must be smaller than 8 MiB');
  if (width < 320 || width > 1440 || height <= 0) throw new Error('JPEG width must be 320–1440 pixels');
  const ratio = width / height;
  if (format === 'story' ? Math.abs(ratio-9/16)>0.02 : ratio < 0.8 || ratio > 1.91) throw new Error(format === 'story' ? 'Story image must be 9:16' : 'Image aspect ratio must be between 4:5 and 1.91:1');
}
export async function inspectMedia(url: string, format: PublishFormat, request: typeof fetch = fetch): Promise<boolean> {
  // Workers' fetch rejects redirect "error"; use "manual" and refuse any redirect.
  const response = await request(url,{ signal:AbortSignal.timeout(30000), redirect:'manual' });
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) { await response.body?.cancel().catch(()=>{}); throw new Error('Private media redirected unexpectedly'); }
  if (!response.ok || !response.body) throw new Error('Unable to read private media');
  const size=Number(response.headers.get('content-length'));
   if (!size || size>1024*1024*1024) { await response.body.cancel(); throw new Error('Media size unavailable or exceeds 1 GiB'); }
  const reader=response.body.getReader(); let pos=0; let accumulated:Uint8Array=new Uint8Array();
  let jpeg: Uint8Array | null=null;
  try {
    while (pos < Math.min(size,32*1024*1024)) {
      const {value,done}=await reader.read(); if(done)break;
      if (pos===0 && value[0]===255 && value[1]===216) jpeg=new Uint8Array();
      const next:Uint8Array=new Uint8Array(accumulated.length+value.length);next.set(accumulated);next.set(value,accumulated.length);accumulated=next;
      if(jpeg) { jpeg=accumulated; const dims=jpegDimensions(next);if(dims){validateImage(dims.width,dims.height,size,format);return false;} }
      else { const movie=mp4Metadata(next,size); if(movie){validateVideo(movie,size,format);return true;} }
      pos+=value.length;
    }
    throw new Error(jpeg ? 'Invalid JPEG header' : 'MP4/MOV metadata must be readable within the first 32 MiB (fast start required)');
  } finally { await reader.cancel().catch(()=>{}); }
}
