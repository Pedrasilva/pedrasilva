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
import { HelpCircle, MessageSquare, Clock as ClockIcon } from "lucide-react";
import { RAIL_ITEMS, type RailItem, type FlyoutLink } from "./nav-config";
import {
  useRecentlyViewed,
  type RecentModule,
} from "@/hooks/use-recently-viewed";

/**
 * Vertical module rail (Accelo-inspired).
 *
 * Active state strategy:
 *  - The button currently in the active module gets a stronger surface
 *    (bg-accent), an emphasized icon color, and a left accent bar so the
 *    state remains visible even when the flyout is closed.
 *  - Inside the flyout, the link matching the current pathname is
 *    highlighted with `aria-current="page"` plus a subtle accent surface.
 *  - The parent flyout section that contains the active child gets a dot
 *    marker next to its title.
 *
 * Accessibility:
 *  - Each rail button has an aria-label and a Radix Tooltip (visible on
 *    keyboard focus, not just hover).
 *  - The rail uses a real <nav> landmark.
 *  - Popover / Tooltip / Sheet primitives (Radix) handle focus trap,
 *    ESC-to-close, and focus restoration out of the box.
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
    <nav
      aria-label="Primary"
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
    </nav>
  );
}

function isActiveLink(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
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
  const active = item.matches.some(
    (m) => pathname === m || pathname.startsWith(m + "/"),
  );
  const label = t(`shell.rail.${item.labelKey}`);

  // Only certain modules carry a Recently Viewed list. The rail item id
  // doubles as the module key for the tracker.
  const recentModule: RecentModule | null =
    item.id === "projects" || item.id === "crm" || item.id === "hr" || item.id === "finance"
      ? (item.id as RecentModule)
      : null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                active
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {/* Left accent bar for active module — visible even with flyout closed */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full transition-colors",
                  active ? "bg-primary" : "bg-transparent",
                )}
              />
              <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
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
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        </div>
        <div role="menu" className="max-h-[70vh] overflow-y-auto py-2">
          {recentModule ? (
            <RecentlyViewedSection module={recentModule} pathname={pathname} />
          ) : null}
          {item.flyout.map((section) => {
            const links = section.links.filter((l) => can(l.perm));
            if (links.length === 0) return null;
            const sectionActive = links.some((l) => isActiveLink(pathname, l.to));
            return (
              <div key={section.titleKey} className="px-2 py-1.5">
                <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {sectionActive && (
                    <span
                      aria-hidden="true"
                      className="h-1 w-1 rounded-full bg-primary"
                    />
                  )}
                  {t(`shell.section.${section.titleKey}`)}
                </div>
                <div className="flex flex-col">
                  {links.map((l) => (
                    <FlyoutLinkRow
                      key={l.to + l.labelKey}
                      link={l}
                      active={isActiveLink(pathname, l.to)}
                    />
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

function FlyoutLinkRow({ link, active }: { link: FlyoutLink; active: boolean }) {
  const { t } = useTranslation("common");
  return (
    <Link
      to={link.to as never}
      role="menuitem"
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-md px-2 py-1.5 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-accent font-medium text-primary"
          : "text-foreground hover:bg-accent/60",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary"
        />
      )}
      {t(`shell.link.${link.labelKey}`)}
    </Link>
  );
}

function RecentlyViewedSection({
  module,
  pathname,
}: {
  module: RecentModule;
  pathname: string;
}) {
  const { t } = useTranslation("common");
  const items = useRecentlyViewed(module);
  if (items.length === 0) return null;
  return (
    <div className="px-2 py-1.5">
      <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <ClockIcon className="h-3 w-3" />
        {t("shell.section.recentlyViewed")}
      </div>
      <div className="flex flex-col">
        {items.map((it) => {
          const active = isActiveLink(pathname, it.href);
          return (
            <Link
              key={it.href}
              to={it.href as never}
              role="menuitem"
              aria-current={active ? "page" : undefined}
              className={cn(
                "truncate rounded-md px-2 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-accent font-medium text-primary"
                  : "text-foreground hover:bg-accent/60",
              )}
              title={it.label}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
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
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          )}
        >
          <Icon className="h-4 w-4" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
