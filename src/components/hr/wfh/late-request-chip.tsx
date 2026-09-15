import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

/** Marks a remote-work entry created inside the notice window (out of policy). */
export function LateRequestChip({ reason }: { reason?: string | null }) {
  const { t } = useTranslation("hr");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: "color-mix(in oklab, var(--clay) 16%, transparent)",
        color: "var(--clay)",
      }}
      title={reason || t("remoteWork.lateBadgeHint")}
    >
      <AlertTriangle className="h-3 w-3" />
      {t("remoteWork.lateBadge")}
    </span>
  );
}
