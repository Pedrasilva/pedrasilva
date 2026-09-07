import { useTranslation } from "react-i18next";
import { absenceToken, mix } from "./absence-visuals";

function Swatch({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="h-3 w-5 rounded-[3px] ring-1 ring-border/60"
        style={style}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function AbsenceLegend({ canSeeDetail }: { canSeeDetail: boolean }) {
  const { t } = useTranslation("hr");
  const holiday = absenceToken("ferias");
  const other = absenceToken("autorizada_paga");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Swatch style={{ background: mix(holiday, 70) }} label={t("availability.legend.holiday")} />
      <Swatch
        style={{ background: mix(other, 70) }}
        label={
          canSeeDetail
            ? t("availability.legend.otherAbsence")
            : t("availability.legend.unavailable")
        }
      />
      <Swatch
        style={{
          background: `linear-gradient(to right, ${mix(holiday, 70)} 50%, transparent 50%)`,
        }}
        label={t("availability.legend.halfDay")}
      />
      <Swatch
        style={{
          background: `repeating-linear-gradient(135deg, ${mix(other, 45)} 0 4px, transparent 4px 8px)`,
        }}
        label={t("availability.legend.pending")}
      />
      <Swatch
        style={{ background: mix("var(--hr-accent)", 16) }}
        label={t("availability.legend.remote")}
      />
      <Swatch style={{ background: mix("var(--ink)", 10) }} label={t("availability.legend.publicHoliday")} />
      <Swatch style={{ background: mix("var(--ink)", 6) }} label={t("availability.legend.weekend")} />
    </div>
  );
}
