import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BiblePillar = { key: string; name: string; description?: string };
export type BiblePersona = {
  key: string;
  name: string;
  who?: string;
  wants?: string;
  fears?: string;
  finds_us?: string;
  wins_them?: string;
};
export type BibleVersion = {
  id: string;
  version: number;
  content_md: string;
  pillars: BiblePillar[];
  personas: BiblePersona[];
  change_summary: string;
  created_by: string;
  created_at: string;
};

export const BIBLE_QUERY_KEY = ["marketing-bible-versions"] as const;

/** All versions, newest first. The first entry is the active Bible. */
export function useBibleVersions() {
  return useQuery({
    queryKey: BIBLE_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_bible_versions")
        .select("*")
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BibleVersion[];
    },
  });
}

export function useActiveBible() {
  const q = useBibleVersions();
  return { ...q, data: q.data?.[0] ?? null };
}

export const toSnakeKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
