import { useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProductImage } from "./product-image";
import { useProductImageUrl, useUploadProductImage } from "@/lib/products/use-products";
import { isPdfPath } from "@/lib/products/types";
import { toast } from "sonner";

/** Small upload-or-clear image control used by the product/item forms. */
export function ImageField({
  label,
  value,
  onChange,
  size = "small",
  allowPdf = false,
}: {
  label: string;
  value: string | null;
  onChange: (path: string | null) => void;
  /** "small" = inline thumb (default), "medium"/"large" = generous preview panel. */
  size?: "small" | "medium" | "large";
  /** Accept a PDF sample board in addition to a single image. */
  allowPdf?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadProductImage();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div
        className={
          size === "small"
            ? "flex items-center gap-3"
            : "space-y-2 rounded-lg border bg-muted/20 p-3"
        }
      >
        {isPdfPath(value) ? (
          <PdfPreview path={value} size={size} />
        ) : (
        <ProductImage
          path={value}
          alt={label}
          className={
            size === "large"
              ? "h-64 w-full object-contain"
              : size === "medium"
                ? "h-36 w-full object-contain"
                : "h-16 w-16"
          }
          width={size === "small" ? 160 : 900}
        />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
            {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={allowPdf ? "image/*,application/pdf" : "image/*"}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const path = await upload.mutateAsync(file);
            onChange(path);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

/** Sample PDFs cannot be thumbnailed by storage — show a chip that opens them. */
function PdfPreview({ path, size }: { path: string | null; size: "small" | "medium" | "large" }) {
  const { data: url } = useProductImageUrl(path);
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center justify-center gap-2 rounded-md border border-dashed bg-background text-sm text-muted-foreground hover:text-foreground ${
        size === "large" ? "h-64 w-full" : size === "medium" ? "h-36 w-full" : "h-16 w-16"
      }`}
    >
      <FileText className="h-5 w-5" />
      {size !== "small" && <span>Open sample PDF</span>}
    </a>
  );
}
