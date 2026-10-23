/** Pure request/selection helpers; no credentials, storage or provider calls. */
export type PublishFormat = 'single' | 'carousel' | 'reel' | 'story';
export type MediaInput = { url: string; video: boolean };
export type ContainerState = { id: string; role: 'child' | 'parent' | 'story'; index: number; submitted?:boolean; mediaId?:string };
export function dueForPublishing(row: { status: string; platform: string; scheduled_at: string | null; ig_media_id?: string | null; publish_retry_at?: string | null; publish_attempts?: number; publish_sent_at?: string | null }, now: number) {
  if (row.platform !== 'instagram' || row.ig_media_id || row.publish_sent_at) return false;
  return (row.status === 'scheduled' && !!row.scheduled_at && Date.parse(row.scheduled_at) <= now) ||
    (row.status === 'failed' && !!row.publish_retry_at && Date.parse(row.publish_retry_at) <= now && (row.publish_attempts ?? 0) < 2);
}
export function containerBody(format: PublishFormat, media: MediaInput, caption: string, child = false): Record<string,string> {
  if (format === 'story') return { media_type: 'STORIES', [media.video ? 'video_url' : 'image_url']: media.url };
  if (child) return { is_carousel_item: 'true', ...(media.video ? { media_type: 'VIDEO', video_url: media.url } : { image_url: media.url }) };
  return media.video ? { media_type: 'REELS', video_url: media.url, caption } : { image_url: media.url, caption };
}
export function carouselBody(children: string[], caption: string) { return { media_type: 'CAROUSEL', children: children.join(','), caption }; }
export function transientMeta(status: number, code?: number, transient?: boolean) { return status >= 500 || status === 429 || transient === true || [1,2,4,17,32,613].includes(code ?? -1); }
export function ownsPublishLock(row: {status:string;publish_lock_id:string|null}, lock:string) { return row.status==='publishing' && row.publish_lock_id===lock; }
export function safeMetaMessage(message: unknown, token: string) {
  if (typeof message !== 'string') return 'Instagram request failed';
  return (token ? message.split(token).join('[redacted]') : message).replace(/https?:\/\/\S+/g,'[media URL]').replace(/access_token[=:\s]+\S+/gi,'[redacted]').slice(0,800);
}
