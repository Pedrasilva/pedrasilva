import { describe, it, expect } from 'vitest';
import { STORY_SIZE, automaticStory, storyRenderReady, wrapStoryText } from '../src/lib/marketing/story-render';
describe('Story render safeguards', () => {
  const f = { kind: 'image' as const, asset_id: 'photo', text: 'Headline', sticker: {type:'question',text:'Ask us'} };
  it('uses 1080×1920 JPEG geometry', () => { expect(STORY_SIZE.width).toBe(1080); expect(STORY_SIZE.height).toBe(1920); });
  it('keeps requested safe zones', () => { expect(STORY_SIZE.top).toBe(250); expect(STORY_SIZE.bottom).toBe(340); });
  it('defaults stickers to blocked', () => expect(automaticStory([f])).toBe(false));
  it('explicit omission permits automatic publishing', () => expect(automaticStory([{...f,sticker_policy:'omit'}])).toBe(true));
  it('manual choice blocks automatic publishing', () => expect(automaticStory([{...f,sticker_policy:'manual'}])).toBe(false));
  it('requires matching approval and every frame', () => { const m={content_hash:'approved',paths:['1','2'],automatic:true,sha256:[]}; expect(storyRenderReady(m,'approved',2)).toBe(true); expect(storyRenderReady(m,'changed',2)).toBe(false); expect(storyRenderReady(m,'approved',3)).toBe(false); expect(storyRenderReady({...m,automatic:false},'approved',2)).toBe(false); });
  it('wraps even a single long word without overflow', () => { const lines=wrapStoryText('a'.repeat(200)+' normal word',90,t=>t.length*10); expect(lines.length).toBeGreaterThan(1); expect(lines.every(l=>l.length<=9)).toBe(true); });
});