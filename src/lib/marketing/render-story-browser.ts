import { getStoryRenderContext, storeStoryRenderFrame } from './story-render.functions';
import { renderStoryFrame } from './story-render';
/** Invoked only from explicit browser actions, never on page load or by a job. */
export async function prepareStoryRender(draftId: string) {
  const context = await getStoryRenderContext({ data: { draftId } });
  if (context.manifest) return context;
  for (let i = 0; i < context.frames.length; i++) {
    const frame = context.frames[i]; const image = context.images.find(a => a.id === frame.asset_id);
    if (image?.mime_type.startsWith('video/')) throw new Error('Story burn-in currently requires a photo, not a video');
    const blob = await renderStoryFrame(frame, image?.url ?? undefined);
    const jpeg = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
    await storeStoryRenderFrame({ data: { draftId, hash: context.hash, index: i+1, jpeg, finish: i === context.frames.length - 1 } });
  }
  return getStoryRenderContext({ data: { draftId } });
}