/**
 * Recently visited — a quiet row of the last detail pages the user opened,
 * read from the existing local Recently Viewed tracker. No backend calls.
 */
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Briefcase, Building2, Users, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { useRecentlyViewed, type RecentModule } from "@/hooks/use-recently-viewed";

const ICONS: Record<RecentModule, React.ComponentType<{ className?: string }>> = {
  projects: Briefcase,
  crm: Building2,
  hr: Users,
  finance: Wallet,
};

export function RecentlyVisited() {
  const { t } = useTranslation("home");
  const projects = useRecentlyViewed("projects");
  const crm = useRecentlyViewed("crm");
  const hr = useRecentlyViewed("hr");
  const finance = useRecentlyViewed("finance");

  const items = [...projects, ...crm, ...hr, ...finance]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8);

  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-display text-base tracking-tight">
          {t("recent.title")}
        </h3>
      </div>
      <div className="flex flex-wrap gap-2 px-5 py-4">
        {items.map((i) => {
          const Icon = ICONS[i.module];
          return (
            <Link
              key={`${i.module}-${i.href}`}
              to={i.href}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs transition-colors hover:border-foreground/30 hover:bg-muted/50"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{i.label}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
