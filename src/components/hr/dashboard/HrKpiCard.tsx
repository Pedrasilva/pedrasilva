import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  icon?: LucideIcon;
  loading?: boolean;
  tone?: "default" | "warning" | "critical" | "success";
  hidden?: boolean;
  hint?: string;
  href?: string;
};

const toneClass: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

const toneAccent: Record<NonNullable<Props["tone"]>, string> = {
  default: "",
  warning: "ring-1 ring-inset ring-amber-500/15",
  critical: "ring-1 ring-inset ring-red-500/20",
  success: "ring-1 ring-inset ring-emerald-500/15",
};

export function HrKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
  tone = "default",
  hidden,
  hint,
  href,
}: Props) {
  if (hidden) return null;

  const body = (
    <Card
      className={cn(
        "h-full transition-colors",
        toneAccent[tone],
        href && "hover:bg-accent/40 cursor-pointer",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="truncate">{label}</span>
              {hint ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 shrink-0 opacity-60 hover:opacity-100" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {hint}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums leading-tight",
                toneClass[tone],
              )}
            >
              {loading ? (
                <Skeleton className="h-7 w-16" />
              ) : value === null || value === undefined ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                value
              )}
            </div>
            {loading ? (
              <Skeleton className="mt-1 h-3 w-20" />
            ) : sub ? (
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

  if (href && !loading) {
    return (
      <Link to={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
