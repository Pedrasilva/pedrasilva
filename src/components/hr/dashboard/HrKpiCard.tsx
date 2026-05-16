import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  icon?: LucideIcon;
  loading?: boolean;
  tone?: "default" | "warning" | "critical" | "success";
  hidden?: boolean;
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

export function HrKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
  tone = "default",
  hidden,
}: Props) {
  if (hidden) return null;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
              {label}
            </div>
            <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass[tone])}>
              {loading ? (
                <Skeleton className="h-7 w-20" />
              ) : value === null || value === undefined ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                value
              )}
            </div>
            {sub ? (
              <div className="mt-1 text-xs text-muted-foreground truncate">{sub}</div>
            ) : null}
          </div>
          {Icon ? (
            <Icon className="size-4 shrink-0 text-muted-foreground" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
