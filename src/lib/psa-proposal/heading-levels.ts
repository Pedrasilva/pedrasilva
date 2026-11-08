/**
 * Per-block heading levels (display only). Stored on content_rich.headingLevel;
 * missing values default to H1 so existing proposals render unchanged.
 */
export type BlockHeadingLevel = "h1" | "h2" | "h3" | "none";

export const BLOCK_HEADING_LEVELS: BlockHeadingLevel[] = ["h1", "h2", "h3", "none"];

export function blockHeadingLevel(block: { content_rich?: Record<string, unknown> | null }): BlockHeadingLevel {
  const raw = block.content_rich?.headingLevel;
  return raw === "h2" || raw === "h3" || raw === "none" ? raw : "h1";
}

export interface SectionTocEntry {
  chapter: string;
  title: string;
  level: 1 | 2;
}

/**
 * H1 → "1", "2"…; H2 → "<last H1>.<n>" (unnumbered before the first H1);
 * H3 / none → unnumbered. The index lists H1 and numbered H2 entries.
 */
export function computeSectionNumbers<T>(
  blocks: T[],
  opts: { numbered: (block: T) => boolean; level: (block: T) => BlockHeadingLevel; title: (block: T) => string },
): { chapters: (string | null)[]; toc: SectionTocEntry[] } {
  let major = 0;
  let minor = 0;
  const chapters: (string | null)[] = [];
  const toc: SectionTocEntry[] = [];
  for (const block of blocks) {
    if (!opts.numbered(block)) { chapters.push(null); continue; }
    const level = opts.level(block);
    if (level === "h1") {
      major += 1; minor = 0;
      const chapter = String(major);
      chapters.push(chapter);
      toc.push({ chapter, title: opts.title(block), level: 1 });
    } else if (level === "h2" && major > 0) {
      minor += 1;
      const chapter = `${major}.${minor}`;
      chapters.push(chapter);
      toc.push({ chapter, title: opts.title(block), level: 2 });
    } else {
      chapters.push(null);
    }
  }
  return { chapters, toc };
}
