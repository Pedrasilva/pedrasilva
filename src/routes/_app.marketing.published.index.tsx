import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, ImageIcon, Instagram, Linkedin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PREVIEW, PREVIEW_VERSION, resolveDraftImages } from "@/lib/marketing/draft-images";

export const Route = createFileRoute("/_app/marketing/published/")({
  validateSearch: (s: Record<string, unknown>): { highlight?: string } =>
    typeof s.highlight === "string" && /^[0-9a-f-]{36}$/i.test(s.highlight) ? { highlight: s.highlight } : {},
  component: PublishedPosts,
  head: () => ({
    meta: [
      { title: "Published posts — Portal Pedra Silva" },
      { name: "description", content: "Published Instagram and LinkedIn posts with links and quick metrics." },
      { property: "og:title", content: "Published posts — Portal Pedra Silva" },
      { property: "og:description", content: "Published Instagram and LinkedIn posts with links and quick metrics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = { id: string; platform: string; final_copy: string | null; ai_copy: string | null; asset_ids: string[]; published_at: string | null; ig_published_at: string | null; published_url: string | null; ig_media_id: string | null };

function PublishedPosts() {
  const { t, i18n } = useTranslation("marketing");
  const { highlight } = Route.useSearch();
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-published-posts", PREVIEW_VERSION],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: rows, error } = await db.from("marketing_post_drafts")
        .select("id, platform, final_copy, ai_copy, asset_ids, published_at, ig_published_at, published_url, ig_media_id")
        .eq("status", "published").order("published_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const list = rows as Row[];
      const mediaIds = list.map((r) => r.ig_media_id).filter(Boolean);
      const [imgs, ins] = await Promise.all([
        resolveDraftImages(supabase, [...new Set(list.map((r) => r.asset_ids?.[0]).filter(Boolean))], 3600, { preview: PREVIEW.small * 2 }),
        mediaIds.length ? db.from("marketing_ig_media_insights").select("media_id, permalink, metrics, captured_at").in("media_id", mediaIds).order("captured_at", { ascending: false }) : { data: [] },
      ]);
      const img = new Map(imgs.map((i) => [i.id, i.url]));
      const latest = new Map<string, { permalink: string | null; metrics: Record<string, number> }>();
      for (const m of (ins.data ?? []) as { media_id: string; permalink: string | null; metrics: Record<string, number> }[]) if (!latest.has(m.media_id)) latest.set(m.media_id, m);
      return list.map((r) => ({ ...r, thumb: img.get(r.asset_ids?.[0]) ?? null, insight: r.ig_media_id ? latest.get(r.ig_media_id) ?? null : null }));
    },
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">{t("common:loading")}</p>;
  if (!data?.length) return <Card className="p-10 text-center text-sm text-muted-foreground">{t("published.empty")}</Card>;
  return (
    <div className="space-y-2">
      {data.map((r) => {
        const when = r.ig_published_at ?? r.published_at;
        const link = r.published_url ?? r.insight?.permalink ?? null;
        const m = r.insight?.metrics ?? {};
        const PIcon = r.platform === "linkedin" ? Linkedin : Instagram;
        return (
          <Card key={r.id} className={`flex items-center gap-3 p-2.5 ${highlight === r.id ? "ring-2 ring-primary" : ""}`}>
            <div className="h-16 w-14 shrink-0 overflow-hidden rounded bg-muted">
              {r.thumb ? <img src={r.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-center" /> : <ImageIcon className="m-auto mt-5 h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><PIcon className="h-3.5 w-3.5" />{when ? new Date(when).toLocaleDateString(i18n.language, { timeZone: "Europe/Lisbon" }) : "—"}</p>
              <p className="truncate text-sm">{(r.final_copy ?? r.ai_copy ?? "").split("\n")[0]}</p>
              {Object.keys(m).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {["reach", "likes", "comments", "saved"].filter((k) => m[k] != null).map((k) => `${t(`published.metric.${k}`)} ${m[k]}`).join(" · ")}
                </p>
              )}
            </div>
            {link && <a href={link} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary underline"><ExternalLink className="h-3.5 w-3.5" />{t("published.open")}</a>}
          </Card>
        );
      })}
    </div>
  );
}
