import { describe, it, expect } from 'vitest';
import { resolvePostLanguage, languageInstruction } from '../src/lib/marketing/post-language';
import { wrapStoryText } from '../src/lib/marketing/story-render';
describe('Post language resolution', () => {
  it('defaults existing profiles to English', () => expect(resolvePostLanguage({}, 'instagram')).toBe('en'));
  it('uses project Portuguese for single-capture generation', () => expect(resolvePostLanguage({post_language:'pt-PT'}, 'instagram')).toBe('pt-PT'));
  it('resolves platform overrides independently', () => { const p={post_language:'bilingual' as const,instagram_language:'pt-PT' as const,linkedin_language:'en' as const}; expect(resolvePostLanguage(p,'instagram')).toBe('pt-PT'); expect(resolvePostLanguage(p,'linkedin')).toBe('en'); });
  it('run language overrides platform and project', () => expect(resolvePostLanguage({post_language:'en',instagram_language:'en'},'instagram','bilingual')).toBe('bilingual'));
  it('Portuguese is Portugal never Brazilian', () => { expect(languageInstruction('pt-PT')).toContain('European Portuguese (Portugal)'); expect(languageInstruction('pt-PT')).toContain('NEVER Brazilian Portuguese'); });
  it('bilingual puts Portuguese first and both hashtag sets', () => { expect(languageInstruction('bilingual')).toContain('FIRST'); expect(languageInstruction('bilingual')).toContain('both Portuguese and English hashtag sets'); });
  it('story wrapping preserves Portuguese accents', () => { const text='á ã ç é õ — ação, coração e atenção'; const lines=wrapStoryText(text,120,s=>s.length*10); expect(lines.join(' ')).toBe(text); });
});