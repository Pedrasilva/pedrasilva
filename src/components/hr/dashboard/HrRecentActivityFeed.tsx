import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2, XCircle, FileText, Wallet, Calendar, UserPlus,
  Archive, AlertOctagon, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const iconToneMap: Partial<Record<HrActivityKind, string>> = {
  benefit_approved: "text-emerald-600 dark:text-emerald-400",
  benefit_rejected: "text-red-600 dark:text-red-400",
  benefit_paid: "text-emerald-600 dark:text-emerald-400",
  benefit_finance_paid: "text-emerald-600 dark:text-emerald-400",
  benefit_sync_failed: "text-red-600 dark:text-red-400",
  vacation_approved: "text-emerald-600 dark:text-emerald-400",
  vacation_rejected: "text-red-600 dark:text-red-400",
  collaborator_archived: "text-muted-foreground",
};

function timeAgo(iso: string, locale: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diff < 60) return rtf.format(-Math.round(diff), "second");
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 7) return rtf.format(-Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );
}

function absoluteTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function dayBucket(iso: string, locale: string, todayLabel: string, yesterdayLabel: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return todayLabel;
  if (sameDay(d, yest)) return yesterdayLabel;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long" }).format(d);
}

type Props = { items: HrActivity[] | undefined; loading?: boolean };

export function HrRecentActivityFeed({ items, loading }: Props) {
  const { t, i18n } = useTranslation("hr");

  const grouped = useMemo(() => {
    if (!items) return [] as Array<{ label: string; rows: HrActivity[] }>;
    const todayLabel = t("dashboard.activity.today");
    const yLabel = t("dashboard.activity.yesterday");
    const buckets = new Map<string, HrActivity[]>();
    for (const it of items) {
      const key = dayBucket(it.at, i18n.language, todayLabel, yLabel);
      const arr = buckets.get(key) ?? [];
      arr.push(it);
      buckets.set(key, arr);
    }
    return Array.from(buckets.entries()).map(([label, rows]) => ({ label, rows }));
  }, [items, i18n.language, t]);

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
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </div>
                <ul className="space-y-1.5">
                  {g.rows.map((it) => {
                    const Icon = iconMap[it.kind];
                    return (
                      <li
                        key={it.id}
                        className="flex items-start gap-3 text-sm py-1"
                      >
                        <Icon
                          className={cn(
                            "size-4 mt-0.5 shrink-0",
                            iconToneMap[it.kind] ?? "text-muted-foreground",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">
                            <span className="font-medium">{it.subjectName ?? "—"}</span>
                            <span className="text-muted-foreground">
                              {" · "}
                              {t(`dashboard.activity.kind.${it.kind}`)}
                            </span>
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-muted-foreground shrink-0 tabular-nums cursor-default">
                              {timeAgo(it.at, i18n.language)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            {absoluteTime(it.at, i18n.language)}
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
