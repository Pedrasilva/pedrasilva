import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Layers, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCan } from "@/hooks/use-permissions-v2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PREVIEW, resolveDraftImages } from "@/lib/marketing/draft-images";
import { instagramFeed, scheduleInstagram } from "@/lib/marketing/instagram.functions";
import { buildGrid, neighboursAt, proposeBetween, reorder, UPCOMING, type GridItem } from "@/lib/marketing/grid-preview";

type Draft = { id: string; status: string; scheduled_at: string | null; created_at: string; format: string | null; asset_ids: string[]; final_copy: string | null; ai_copy: string };
type Live = { id: string; caption: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string };
type Item = GridItem<Draft, Live>;
const ORDER_KEY = "marketing-grid-order";
const lisbon = (iso: string) => new Date(iso).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function useGridDrafts() {
  return useQuery({
    queryKey: ["marketing-grid-drafts"],
    refetchInterval: 30000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb.from("marketing_post_drafts")
        .select("id, status, scheduled_at, created_at, format, asset_ids, final_copy, ai_copy")
        .eq("platform", "instagram").in("status", [...UPCOMING]).limit(200);
      if (error) throw error;
      // Stories never appear on the profile grid.
      const rows = ((data ?? []) as Draft[]).filter((d) => d.format !== "story");
      // Signed ~400px WebP previews of the cover only (reused for most of their hour); the bucket stays private.
      const covers = await resolveDraftImages(sb, [...new Set(rows.map((r) => r.asset_ids[0]).filter(Boolean))], 3600, { preview: PREVIEW.tile });
      return { rows, covers: new Map(covers.map((c) => [c.id, c])) };
    },
  });
}

/** Planner Grid view: live @pedrasilva_arquitectos posts merged with upcoming drafts, as cropped on the profile (3:4). */
export function PlannerGrid() {
  const { t } = useTranslation("marketing");
  const qc = useQueryClient();
  const { allowed: canCurate } = useCan("marketing.curate", "all");
  const feedFn = useServerFn(instagramFeed);
  const scheduleFn = useServerFn(scheduleInstagram);
  const feed = useQuery({ queryKey: ["instagram-feed"], queryFn: () => feedFn(), staleTime: 900000 });
  const drafts = useGridDrafts();
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { try { setOrder(JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]")); } catch { /* ignore */ } }, []);
  const saveOrder = (o: string[]) => { setOrder(o); localStorage.setItem(ORDER_KEY, JSON.stringify(o)); };
  const [dragId, setDragId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ draft: Draft; at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => buildGrid(drafts.data?.rows ?? [], (feed.data?.posts ?? []) as Live[], order), [drafts.data, feed.data, order]);
  const caption = (d: Draft) => d.final_copy ?? d.ai_copy;

  const onDrop = (target: number) => {
    const draft = drafts.data?.rows.find((d) => d.id === dragId);
    setDragId(null);
    if (!draft || !canCurate) return;
    const tgt = items[target];
    if (!tgt || (tgt.kind === "draft" && tgt.zone === "unscheduled")) {
      const unsched = items.filter((i): i is Extract<Item, { zone: "unscheduled" }> => i.kind === "draft" && i.zone === "unscheduled").map((i) => i.draft.id);
      saveOrder(reorder(unsched, draft.id, tgt && tgt.kind === "draft" ? tgt.draft.id : null));
      return;
    }
    const without = items.filter((i) => !(i.kind === "draft" && i.draft.id === draft.id));
    const idx = without.indexOf(tgt);
    const { newer, older } = neighboursAt(without, idx);
    setProposal({ draft, at: proposeBetween(newer, older) });
  };

  const confirm = async () => {
    if (!proposal?.at) return;
    setBusy(true);
    try {
      // Same server RPC as the calendar: it refuses anything without a valid approval for the current content hash.
      await scheduleFn({ data: { draftId: proposal.draft.id, at: proposal.at, now: false } });
      toast.success(t("calendar.scheduledToast"));
      setProposal(null);
      qc.invalidateQueries({ queryKey: ["marketing-grid-drafts"] });
      qc.invalidateQueries({ queryKey: ["marketing-calendar"] });
      qc.invalidateQueries({ queryKey: ["marketing-posts"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : t("posts.error")); }
    setBusy(false);
  };

  const renderTile = (item: Item, index: number) => {
    const isDraft = item.kind === "draft";
    const movable = isDraft && canCurate && item.zone === "unscheduled";
    const kind = isDraft ? (item.draft.format === "reel" ? "reel" : item.draft.format === "carousel" || item.draft.asset_ids.length > 1 ? "carousel" : "single")
      : item.live.media_type === "VIDEO" ? "reel" : item.live.media_type === "CAROUSEL_ALBUM" ? "carousel" : "single";
    const cover = isDraft ? drafts.data?.covers.get(item.draft.asset_ids[0]) : null;
    const src = isDraft ? cover?.url ?? null : item.live.thumbnail_url ?? item.live.media_url ?? null;
    const video = isDraft && !!cover?.mime_type?.startsWith("video/");
    const label = isDraft ? caption(item.draft) : item.live.caption;
    const body = (
      <>
        {src ? (video ? <video src={src} muted preload="metadata" className="h-full w-full object-cover" /> : <img src={src} alt="" loading="lazy" decoding="async" width={400} height={533} className="h-full w-full object-cover" />)
          : <span className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">{label.slice(0, 60)}</span>}
        {kind === "carousel" && <Layers className="absolute right-1.5 top-1.5 h-4 w-4 text-background drop-shadow" aria-label={t("grid.carousel")} />}
        {kind === "reel" && <Clapperboard className="absolute right-1.5 top-1.5 h-4 w-4 text-background drop-shadow" aria-label={t("grid.reel")} />}
        {isDraft ? (
          <span className="absolute inset-x-1 bottom-1 flex flex-wrap gap-1">
            <Badge variant={item.draft.status === "failed" ? "destructive" : "secondary"} className="px-1 py-0 text-[10px]">{t(`posts.status.${item.draft.status}`)}</Badge>
            {item.draft.scheduled_at && <Badge variant="outline" className="bg-background/80 px-1 py-0 text-[10px]">{lisbon(item.draft.scheduled_at)}</Badge>}
          </span>
        ) : <Lock className="absolute bottom-1.5 right-1.5 h-3 w-3 text-background drop-shadow" aria-label={t("grid.readOnly")} />}
      </>
    );
    return (
      <div key={isDraft ? item.draft.id : item.live.id} data-grid-tile={isDraft ? item.draft.id : item.live.id} draggable={movable}
        onDragStart={(e) => { if (isDraft) { setDragId(item.draft.id); e.dataTransfer.setData("text/plain", item.draft.id); } }}
        onDragOver={(e) => { if (dragId && canCurate) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); onDrop(index); }}
        className={cn("relative aspect-[3/4] overflow-hidden bg-muted", movable && "cursor-grab", isDraft && "ring-1 ring-inset ring-primary/40")}
        title={label.slice(0, 120)}>
        {isDraft ? body : <a href={item.live.permalink} target="_blank" rel="noreferrer" className="block h-full w-full">{body}</a>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-md space-y-2">
      <div className="flex items-center justify-between text-sm"><span className="font-medium">@pedrasilva_arquitectos</span>
        <span className="text-xs text-muted-foreground">{canCurate ? t("grid.dragHint") : t("calendar.readOnly")}</span></div>
      {feed.data?.error && <p role="status" className="text-xs text-warning">{t(`publishing.${feed.data.error}`)}</p>}
      {feed.isError && <p role="status" className="text-xs text-warning">{t("publishing.feedUnavailable")}</p>}
      {(drafts.isLoading || feed.isLoading) && <p className="text-xs text-muted-foreground">{t("common:loading")}</p>}
      <div className="grid grid-cols-3 gap-0.5" onDragOver={(e) => dragId && e.preventDefault()} onDrop={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onDrop(items.length); } }}>
        {items.map((item, i) => renderTile(item, i))}
      </div>
      {!items.length && !drafts.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">{t("calendar.grid.empty")}</p>}

      <Dialog open={!!proposal} onOpenChange={(v) => !busy && !v && setProposal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("grid.proposeTitle")}</DialogTitle>
            <DialogDescription>{proposal?.draft.status === "approved" ? (proposal.at ? t("grid.proposeBody", { when: lisbon(proposal.at) }) : t("grid.noGap")) : t("grid.needsApproval")}</DialogDescription>
          </DialogHeader>
          <p className="line-clamp-3 text-sm text-muted-foreground">{proposal ? caption(proposal.draft) : ""}</p>
          <p className="text-xs text-muted-foreground">{t("calendar.tzHint")}</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setProposal(null)} disabled={busy}>{t("common:cancel")}</Button>
            {proposal?.draft.status === "approved" && proposal.at && <Button onClick={confirm} disabled={busy}>{t("grid.confirm")}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
