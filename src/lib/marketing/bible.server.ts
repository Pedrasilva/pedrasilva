import type { BiblePersona, BiblePillar } from "./bible";

export type ActiveMarketingBible = {
  version: number;
  content_md: string;
  pillars: BiblePillar[];
  personas: BiblePersona[];
};

/** Latest Marketing Bible version (service role), or null if none exists. Used by Pass 3 AI enrichment. */
export async function getActiveMarketingBible(): Promise<ActiveMarketingBible | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("marketing_bible_versions")
    .select("version, content_md, pillars, personas")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    version: data.version,
    content_md: data.content_md,
    pillars: (data.pillars ?? []) as unknown as BiblePillar[],
    personas: (data.personas ?? []) as unknown as BiblePersona[],
  };
}
