import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Live microphone input level (0..1) shown while recording. */
export function VoiceLevelMeter({ level, className }: { level: number; className?: string }) {
  const { t } = useTranslation("common");
  const bars = 5;
  const lit = Math.round(level * bars + (level > 0.02 ? 0.5 : 0));
  return (
    <span role="meter" aria-label={t("voice.meter")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}
      className={cn("inline-flex h-4 items-end gap-0.5", className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} className={cn("w-1 rounded-sm bg-current transition-opacity", i < lit ? "opacity-100" : "opacity-25")}
          style={{ height: `${30 + i * 17}%` }} />
      ))}
    </span>
  );
}
