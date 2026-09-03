import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProductImage } from "./product-image";
import { useUploadProductImage } from "@/lib/products/use-products";
import { toast } from "sonner";

/** Small upload-or-clear image control used by the product/item forms. */
export function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadProductImage();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-3">
        <ProductImage path={value} alt={label} className="h-16 w-16" width={160} />
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
        accept="image/*"
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
