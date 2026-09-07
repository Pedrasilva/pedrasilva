import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { RemoteWorkStatus } from "@/hooks/use-remote-work";

export function WfhStatusChip({ estado }: { estado: RemoteWorkStatus }) {
  const { t } = useTranslation("hr");
  const tone =
    estado === "aprovada"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : estado === "rejeitada"
        ? "bg-destructive/15 text-destructive"
        : estado === "cancelada"
          ? "bg-muted text-muted-foreground"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return (
    <Badge className={`border-0 ${tone}`} variant="secondary">
      {t(`remoteWork.status.${estado}`)}
    </Badge>
  );
}
