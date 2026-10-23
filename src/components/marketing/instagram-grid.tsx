import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InstagramPublishControls } from './instagram-publish-controls';

/** One tile in the feed mock-up. The live Instagram feed can be passed in the same shape later. */
export type GridPost = {
  id: string;
  caption: string;
  hashtags?: string[];
  images: string[]; // ordered image URLs (signed or public)
  when?: string | null; // display label, already formatted
  status?: string | null; // e.g. scheduled / approved; omitted for live posts
  permalink?: string | null;
  error?: string | null;
  sentAt?: string | null;
};

function Tile({ post, onOpen }: { post: GridPost; onOpen: () => void }) {
  const { t } = useTranslation("marketing");
  const cover = post.images[0];
  return (
    <Button variant="ghost" type="button" onClick={onOpen} className="group relative h-auto aspect-square rounded-none overflow-hidden bg-muted p-0" aria-label={post.caption.slice(0, 80) || t("calendar.grid.open")}>
      {cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-opacity group-hover:opacity-80" />
        : <span className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">{post.caption.slice(0, 60)}</span>}
      {post.images.length > 1 && <Layers className="absolute right-1.5 top-1.5 h-4 w-4 text-background drop-shadow" />}
      {post.status && <Badge variant={post.status==='failed'?'destructive':'secondary'} className="absolute bottom-1 left-1 px-1 py-0 text-[10px]">{t(`posts.status.${post.status}`)}</Badge>}
    </Button>
  );
}

/** 3-column Instagram-style grid: planned posts on top, then the live feed (or its placeholder). */
export function InstagramGrid({ planned, live, canCurate=false, liveError }: { planned: GridPost[]; live?: GridPost[] | null; canCurate?:boolean;liveError?:string|null }) {
  const { t } = useTranslation("marketing");
  const [open, setOpen] = useState<GridPost | null>(null);
  return (
    <div className="mx-auto max-w-md space-y-1">
      <div className="grid grid-cols-3 gap-0.5">
        {planned.map((p) => <Tile key={p.id} post={p} onOpen={() => setOpen(p)} />)}
      </div>
      {planned.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("calendar.grid.empty")}</p>}
      {liveError&&<p role="status" className="py-2 text-xs text-warning">{t(`publishing.${liveError}`)}</p>}
      {live && live.length > 0 ? (
        <div className="grid grid-cols-3 gap-0.5 opacity-90">
          {live.map((p) => <Tile key={p.id} post={p} onOpen={() => setOpen(p)} />)}
        </div>
      ) : (
        <div className="flex aspect-[3/1] items-center justify-center border border-dashed text-center text-sm text-muted-foreground">
          {t(live===undefined||live===null?'common:loading':'publishing.feedEmpty')}
        </div>
      )}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{open?.when ?? t("calendar.grid.preview")}</DialogTitle></DialogHeader>
          {open && open.images.length > 0 && (
            <Carousel className="mx-10">
              <CarouselContent>
                {open.images.map((src, i) => (
                  <CarouselItem key={`${src}-${i}`}><img src={src} alt="" className="aspect-square w-full object-cover" /></CarouselItem>
                ))}
              </CarouselContent>
              {open.images.length > 1 && <><CarouselPrevious /><CarouselNext /></>}
            </Carousel>
          )}
          <p className="whitespace-pre-wrap text-sm">{open?.caption}</p>
          {!!open?.hashtags?.length && <p className="text-xs text-muted-foreground">{open.hashtags.map((h) => `#${h}`).join(" ")}</p>}
          {open?.status&&<InstagramPublishControls draftId={open.id} status={open.status} canCurate={canCurate} error={open.error} permalink={open.permalink} sentAt={open.sentAt}/>}
          {open?.permalink&&!open.status&&<a href={open.permalink} target="_blank" rel="noreferrer" className="text-sm text-primary underline">{t('publishing.openInstagram')}</a>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
