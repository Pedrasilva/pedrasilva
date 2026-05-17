/**
 * DateInputWithPreview — native date input with a small dd/mm/yyyy preview
 * below it. Browsers render native date inputs in the OS locale (often
 * mm/dd/yyyy), which is confusing for our PT-PT users; the preview makes
 * the parsed value unambiguous.
 */
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  value: string;
  previewClassName?: string;
};

export function DateInputWithPreview({
  value,
  className,
  previewClassName,
  ...rest
}: Props) {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const preview = (() => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  })();

  return (
    <div className="space-y-0.5">
      <Input type="date" value={value} className={className} {...rest} />
      <div
        className={cn(
          "text-[10px] text-muted-foreground tabular-nums min-h-[12px]",
          previewClassName,
        )}
      >
        {preview}
      </div>
    </div>
  );
}
