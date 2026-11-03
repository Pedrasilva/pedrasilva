import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

/** Quote linkage is provenance, never an operational synchronization switch. */
export function ProjectSyncStatusBadge({ sourceQuoteId }: {
  projectId: string; sourceQuoteId: string | null; canEdit?: boolean;
}) {
  const { t } = useTranslation();
  if (!sourceQuoteId) return null;
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Link2 className="h-3 w-3" />{t("projects:projectSyncStatusBadge.ui.convertedOrigin")}
    </span>
  </TooltipTrigger><TooltipContent>{t("projects:projectSyncStatusBadge.ui.convertedOriginHint")}</TooltipContent></Tooltip></TooltipProvider>;
}
