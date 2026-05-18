import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, MessageSquare } from "lucide-react";
import { RAIL_ITEMS, type RailItem, type FlyoutLink } from "./nav-config";

/**
 * Vertical module rail (Accelo-inspired). Each item opens a structured
 * flyout via Popover on click. Bottom area holds Help / Feedback /
 * Settings utilities.
 */
export function AppRail() {
  const loc = useLocation();
  const { isAdmin } = useAuth();
  const { permissions } = useMyPermissions();
  const can = (key?: PermissionKey) => !key || isAdmin || permissions.has(key);

  const visible = RAIL_ITEMS.filter(
    (i) => can(i.perm) && (!i.adminOnly || isAdmin),
  );
  const top = visible.filter((i) => !i.pinBottom);
  const bottom = visible.filter((i) => i.pinBottom);

  return (
    <aside
      aria-label="Module rail"
      className="hidden md:flex sticky top-0 z-30 h-screen w-14 shrink-0 flex-col items-center justify-between border-r bg-card/80 backdrop-blur"
    >
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-col items-center gap-1 pt-3">
          {top.map((item) => (
            <RailButton key={item.id} item={item} pathname={loc.pathname} can={can} />
          ))}
        </div>

        <div className="flex flex-col items-center gap-1 pb-3">
          <UtilityButton labelKey="help" icon={HelpCircle} href="https://lovable.dev" />
          <UtilityButton labelKey="feedback" icon={MessageSquare} href="mailto:feedback@pedrasilva.pt" />
          {bottom.map((item) => (
            <RailButton key={item.id} item={item} pathname={loc.pathname} can={can} />
          ))}
        </div>
      </TooltipProvider>
    </aside>
  );
}

function RailButton({
  item,
  pathname,
  can,
}: {
  item: RailItem;
  pathname: string;
  can: (k?: PermissionKey) => boolean;
}) {
  const { t } = useTranslation("common");
  const Icon = item.icon;
  const active = item.matches.some((m) => pathname === m || pathname.startsWith(m + "/"));

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t(`shell.rail.${item.labelKey}`)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t(`shell.rail.${item.labelKey}`)}</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 p-0"
      >
        <div className="border-b px-4 py-3">
          <Link
            to={item.to as never}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
          >
            <Icon className="h-4 w-4" />
            {t(`shell.rail.${item.labelKey}`)}
          </Link>
        </div>
        <div className="max-h-[70vh] overflow-y-auto py-2">
          {item.flyout.map((section) => {
            const links = section.links.filter((l) => can(l.perm));
            if (links.length === 0) return null;
            return (
              <div key={section.titleKey} className="px-2 py-1.5">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`shell.section.${section.titleKey}`)}
                </div>
                <div className="flex flex-col">
                  {links.map((l) => (
                    <FlyoutLinkRow key={l.to + l.labelKey} link={l} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FlyoutLinkRow({ link }: { link: FlyoutLink }) {
  const { t } = useTranslation("common");
  return (
    <Link
      to={link.to as never}
      className="rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
    >
      {t(`shell.link.${link.labelKey}`)}
    </Link>
  );
}

function UtilityButton({
  labelKey,
  icon: Icon,
  href,
}: {
  labelKey: string;
  icon: typeof HelpCircle;
  href: string;
}) {
  const { t } = useTranslation("common");
  const label = t(`shell.utility.${labelKey}`);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon className="h-4 w-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
