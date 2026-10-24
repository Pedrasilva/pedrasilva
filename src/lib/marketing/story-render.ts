/** Browser-safe rules shared with the publisher. Rendering itself runs only in event handlers. */
export type StoryFrame = { kind?: 'image' | 'text'; asset_id: string; text: string; line?: string | null; sticker: { type: string; text: string }; sticker_policy?: 'omit' | 'manual' };
export type StoryManifest = { content_hash: string; paths: string[]; automatic: boolean; sha256: string[] };
export const STORY_SIZE = { width: 1080, height: 1920, top: 250, bottom: 340, inset: 90 } as const;
export const automaticStory = (frames: StoryFrame[]) => frames.every(f => !f.sticker || f.sticker.type === 'none' || f.sticker_policy === 'omit');
export function storyRenderReady(manifest: StoryManifest | null | undefined, hash: string | null | undefined, count: number) {
  return !!manifest && !!hash && manifest.content_hash === hash && manifest.paths.length === count && count > 0 && manifest.automatic === true;
}
export function wrapStoryText(text: string, max: number, measure: (text: string) => number) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts: string[] = []; let part = '';
    for (const char of word) { if (part && measure(part + char) > max) { parts.push(part); part = char; } else part += char; }
    if (part) parts.push(part);
    for (const p of parts) { const next = line ? line + ' ' + p : p; if (line && measure(next) > max) { lines.push(line); line = p; } else line = next; }
  }
  if (line) lines.push(line);
  return lines;
}
export async function renderStoryFrame(frame: StoryFrame, imageUrl?: string): Promise<Blob> {
  // Read the practice theme rather than duplicating palette or fonts; force the stable light brand theme.
  const probe = document.createElement('div'); probe.className = 'bg-primary text-primary-foreground font-display';
  const body = document.createElement('span'); body.className = 'font-sans'; probe.append(body); document.body.append(probe);
  const theme = getComputedStyle(probe); const background = theme.backgroundColor, foreground = theme.color, display = theme.fontFamily, sans = getComputedStyle(body).fontFamily; probe.remove();
  await Promise.all([document.fonts.load(`96px ${display}`), document.fonts.load(`56px ${sans}`)]); await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = STORY_SIZE.width; canvas.height = STORY_SIZE.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1920);
  const textOnly = frame.kind === 'text';
  if (!textOnly) {
    if (!imageUrl) throw new Error('Story image missing');
    const image = new Image(); image.crossOrigin = 'anonymous'; image.src = imageUrl; await image.decode();
    const scale = Math.max(1080 / image.naturalWidth, 1920 / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, (1080 - w) / 2, (1920 - h) / 2, w, h);
  }
  let font = textOnly ? 96 : 64; let head: string[] = [], sub: string[] = [], height = 0;
  const available = 1920 - STORY_SIZE.top - STORY_SIZE.bottom - 120;
  do {
    ctx.font = `${font}px ${textOnly ? display : sans}`;
    head = wrapStoryText(frame.text, 900, s => ctx.measureText(s).width);
    ctx.font = `${Math.round(font * .58)}px ${sans}`;
    sub = wrapStoryText(frame.line ?? '', 900, s => ctx.measureText(s).width);
    height = head.length * font * 1.22 + (sub.length ? 40 + sub.length * font * .76 : 0);
    if (height <= available) break;
    font -= 2;
  } while (font >= 22);
  if (height > available) throw new Error('Story text cannot fit inside safe zones');
  const top = textOnly ? STORY_SIZE.top + (1920 - STORY_SIZE.top - STORY_SIZE.bottom - height) / 2 : 1920 - STORY_SIZE.bottom - 60 - height;
  if (!textOnly && (head.length || sub.length)) {
    const gradient = ctx.createLinearGradient(0, top - 100, 0, 1920 - STORY_SIZE.bottom);
    gradient.addColorStop(0, 'transparent'); gradient.addColorStop(.3, background); gradient.addColorStop(1, background);
    ctx.globalAlpha = .82; ctx.fillStyle = gradient; ctx.fillRect(0, top - 100, 1080, height + 160); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = foreground; ctx.textBaseline = 'top'; ctx.font = `${font}px ${textOnly ? display : sans}`;
  let y = top; for (const line of head) { ctx.fillText(line, 90, y); y += font * 1.22; }
  if (sub.length) { y += 40; ctx.font = `${Math.round(font * .58)}px ${sans}`; for (const line of sub) { ctx.fillText(line, 90, y); y += font * .76; } }
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('JPEG encoding failed')), 'image/jpeg', .92));
}