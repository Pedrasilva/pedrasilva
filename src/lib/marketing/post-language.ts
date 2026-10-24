export const POST_LANGUAGES = ['en', 'pt-PT', 'bilingual'] as const;
export type PostLanguage = (typeof POST_LANGUAGES)[number];
export type RunLanguage = PostLanguage | 'project';
export type LanguageProfile = { post_language?: PostLanguage; instagram_language?: PostLanguage | null; linkedin_language?: PostLanguage | null };
export function resolvePostLanguage(profile: LanguageProfile | null | undefined, platform: 'instagram' | 'linkedin', run: RunLanguage = 'project'): PostLanguage {
  if (run !== 'project') return run;
  return profile?.[`${platform}_language`] ?? profile?.post_language ?? 'en';
}
export function languageChip(language: PostLanguage = 'en') { return language === 'pt-PT' ? 'PT' : language === 'bilingual' ? 'PT+EN' : 'EN'; }
export function languageInstruction(language: PostLanguage): string {
  const voice = "Keep the Bible's honest-expert voice, no hype, no clichés and no invented facts or quotes.";
  if (language === 'pt-PT') return `Write all captions, story headlines, lines and sticker text in European Portuguese (Portugal), NEVER Brazilian Portuguese. Use European Portuguese vocabulary, spelling and syntax. Use relevant Portuguese hashtags, preserving proper names. ${voice}`;
  if (language === 'bilingual') return `Write European Portuguese (Portugal, NEVER Brazilian Portuguese) FIRST, then the equivalent English, separated by a blank line. Both versions must preserve the same facts. Include both Portuguese and English hashtag sets. For story frames put Portuguese first then English within each frame; keep text short enough for both. ${voice}`;
  return `Write captions, hashtags, story headlines, lines and sticker text in English. ${voice}`;
}