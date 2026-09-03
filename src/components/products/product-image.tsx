import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProductImageUrl } from "@/lib/products/use-products";

/** Thumbnail/preview for a stored product image (private bucket, signed URL). */
export function ProductImage({
  path,
  alt,
  className,
  width = 240,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
  width?: number;
}) {
  const { data: url } = useProductImageUrl(path, width);
  if (!path || !url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border bg-muted/40 text-muted-foreground",
          className,
        )}
        aria-hidden="true"
      >
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn("rounded-md border object-cover", className)}
    />
  );
}
