import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, FileText, Wallet, Calendar, UserPlus,
  Archive, AlertOctagon, CreditCard,
} from "lucide-react";
import type { HrActivity, HrActivityKind } from "@/hooks/use-hr-recent-activity";

const iconMap: Record<HrActivityKind, typeof FileText> = {
  benefit_submitted: FileText,
  benefit_approved: CheckCircle2,
  benefit_rejected: XCircle,
  benefit_paid: Wallet,
  benefit_finance_paid: CreditCard,
  benefit_sync_failed: AlertOctagon,
  vacation_requested: Calendar,
  vacation_approved: CheckCircle2,
  vacation_rejected: XCircle,
  collaborator_created: UserPlus,
  collaborator_archived: Archive,
};

function timeAgo(iso: string, locale: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diff < 60) return rtf.format(-Math.round(diff), "second");
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

type Props = { items: HrActivity[] | undefined; loading?: boolean };

export function HrRecentActivityFeed({ items, loading }: Props) {
  const { t, i18n } = useTranslation("hr");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("dashboard.activity.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("dashboard.activity.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const Icon = iconMap[it.kind];
              return (
                <li key={it.id} className="flex items-start gap-3 text-sm">
                  <Icon className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{it.subjectName ?? "—"}</span>
                      <span className="text-muted-foreground"> · {t(`dashboard.activity.kind.${it.kind}`)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {timeAgo(it.at, i18n.language)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
