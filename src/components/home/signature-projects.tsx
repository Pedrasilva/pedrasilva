/**
 * Signature Projects — home page gallery backed by the shared PSA image
 * library (public.psa_image_library / bucket 'proposal-images'). The exact
 * same library the Proposal Composer draws from, so anything curated here
 * is immediately available in the Quote Builder image block.
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Images, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useProposalImages,
  useUploadProposalImage,
  useDeleteProposalImage,
  useUpdateProposalImage,
  useSignedProposalImageUrl,
  type PsaImageLibraryEntry,
  type PsaImageCategory,
} from "@/lib/psa-proposal/use-proposal-images";

const CATEGORIES: { id: PsaImageCategory; labelKey: string; fallback: string }[] = [
  { id: "general", labelKey: "home:signature.cat.general", fallback: "General" },
  { id: "residential", labelKey: "home:signature.cat.residential", fallback: "Residential" },
  { id: "workplace", labelKey: "home:signature.cat.workplace", fallback: "Workplace" },
  { id: "hospitality", labelKey: "home:signature.cat.hospitality", fallback: "Hospitality" },
  { id: "team", labelKey: "home:signature.cat.team", fallback: "Team" },
];

export function SignatureProjectsSection({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation(["home"]);
  const images = useProposalImages();
  const upload = useUploadProposalImage();
  const update = useUpdateProposalImage();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [lightbox, setLightbox] = useState<PsaImageLibraryEntry | null>(null);
  const [active, setActive] = useState<PsaImageCategory>("general");

  const list = images.data ?? [];
  const filtered = useMemo(
    () => list.filter((e) => (e.category ?? "general") === active),
    [list, active],
  );

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        await upload.mutateAsync({ file: f, category: active });
        ok += 1;
      } catch (e) {
        toast.error(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (ok)
      toast.success(
        t("home:signature.uploaded", {
          count: ok,
          defaultValue: `${ok} image(s) added to the library`,
        }),
      );
  };

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-2">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("home:signature.kicker", { defaultValue: "Studio Portfolio" })}
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight">
              {t("home:signature.title", { defaultValue: "Signature Projects" })}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("home:signature.subtitle", {
                defaultValue:
                  "Curated imagery used across the studio — the same library the Quote Builder pulls from when filling proposal pages.",
              })}
            </p>
          </div>
          {isAdmin && (
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {upload.isPending
                  ? t("home:signature.uploading", { defaultValue: "Uploading..." })
                  : t("home:signature.upload", {
                      defaultValue: "Add to this category",
                    })}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 border-b bg-muted/30 px-4 py-2">
          {CATEGORIES.map((c) => {
            const count = list.filter(
              (e) => (e.category ?? "general") === c.id,
            ).length;
            const isActive = c.id === active;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                className={
                  "rounded-md px-3 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors " +
                  (isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted")
                }
              >
                {t(c.labelKey, { defaultValue: c.fallback })}
                <span className="ml-1.5 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {images.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-12 text-center">
              <Images className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">
                {t("home:signature.empty.title", {
                  defaultValue: "No images in this category yet",
                })}
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                {isAdmin
                  ? t("home:signature.empty.adminBody", {
                      defaultValue:
                        "Upload photos for this category. They become instantly available inside the Quote Builder image block.",
                    })
                  : t("home:signature.empty.body", {
                      defaultValue:
                        "Ask an admin to upload signature imagery to this category.",
                    })}
              </p>
              {isAdmin && (
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  {t("home:signature.empty.cta", {
                    defaultValue: "Upload first image",
                  })}
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((entry) => (
                <GalleryTile
                  key={entry.id}
                  entry={entry}
                  isAdmin={isAdmin}
                  onOpen={() => setLightbox(entry)}
                  onMove={(cat) =>
                    update.mutate(
                      { id: entry.id, category: cat },
                      {
                        onSuccess: () =>
                          toast.success(
                            t("home:signature.moved", {
                              defaultValue: "Category updated",
                            }),
                          ),
                        onError: (err) => toast.error((err as Error).message),
                      },
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {lightbox && (
        <Lightbox entry={lightbox} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}

function GalleryTile({
  entry,
  isAdmin,
  onOpen,
  onMove,
}: {
  entry: PsaImageLibraryEntry;
  isAdmin: boolean;
  onOpen: () => void;
  onMove: (c: PsaImageCategory) => void;
}) {
  const { t } = useTranslation(["home"]);
  // Low-res thumbnail first — the full image is only fetched in the lightbox.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = useSignedProposalImageUrl(entry.storage_path, entry.bucket, {
    width: 480,
    quality: 55,
  });
  const full = useSignedProposalImageUrl(
    thumbFailed ? entry.storage_path : null,
    entry.bucket,
  );
  const src = thumbFailed ? full.data : thumb.data;
  const del = useDeleteProposalImage();
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-muted">
      <button
        type="button"
        onClick={onOpen}
        className="block aspect-square w-full overflow-hidden"
      >
        {src ? (
          <img
            src={src}
            alt={entry.name}
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="truncate text-xs font-medium text-white">
          {entry.name}
        </div>
      </div>
      {isAdmin && (
        <>
          <select
            value={entry.category ?? "general"}
            onChange={(e) => onMove(e.target.value as PsaImageCategory)}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-2 top-2 rounded-md border bg-background/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            title="Move to category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.labelKey, { defaultValue: c.fallback })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="absolute right-2 top-2 rounded-full bg-background/90 p-1.5 text-zinc-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove "${entry.name}"?`)) {
                del.mutate(entry, {
                  onSuccess: () => toast.success("Image removed"),
                  onError: (err) => toast.error((err as Error).message),
                });
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function Lightbox({
  entry,
  onClose,
}: {
  entry: PsaImageLibraryEntry;
  onClose: () => void;
}) {
  // Show the cached low-res instantly, swap to full-res once it arrives.
  const thumb = useSignedProposalImageUrl(entry.storage_path, entry.bucket, {
    width: 480,
    quality: 55,
  });
  const full = useSignedProposalImageUrl(entry.storage_path, entry.bucket);
  const [fullLoaded, setFullLoaded] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-zinc-700 hover:bg-white"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <div
        className="max-h-[90vh] max-w-6xl"
        onClick={(e) => e.stopPropagation()}
      >
        {thumb.data || full.data ? (
          <div className="relative">
            {thumb.data && !fullLoaded && (
              <img
                src={thumb.data}
                alt={entry.name}
                className="max-h-[85vh] w-auto rounded-md object-contain shadow-2xl blur-sm"
              />
            )}
            {full.data && (
              <img
                src={full.data}
                alt={entry.name}
                onLoad={() => setFullLoaded(true)}
                className={
                  "max-h-[85vh] w-auto rounded-md object-contain shadow-2xl transition-opacity duration-300 " +
                  (fullLoaded
                    ? "opacity-100"
                    : "absolute inset-0 h-full w-full opacity-0")
                }
              />
            )}
          </div>
        ) : (
          <div className="h-96 w-96 animate-pulse bg-zinc-800" />
        )}
        <div className="mt-3 text-center text-sm text-white/90">
          {entry.name}
        </div>
      </div>
    </div>
  );
}
