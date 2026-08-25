import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type AppNotification,
} from "@/hooks/use-notifications";

function isOverdue(n: AppNotification) {
  return n.kind === "reminder_overdue";
}

export function NotificationBell() {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const { items, unreadCount, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.link_path) navigate({ to: n.link_path as never });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={t("notifications.title")}
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2">
          <span className="text-sm">{t("notifications.title")}</span>
          {unreadCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {t("notifications.unread", { count: unreadCount })}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("loading")}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {t("notifications.empty")}
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent/60",
                  !n.read_at && "bg-accent/30",
                )}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="truncate text-sm font-medium">{n.title}</span>
                </div>
                {n.body && (
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                )}
                <span
                  className={cn(
                    "text-[11px]",
                    isOverdue(n) ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {isOverdue(n) ? `${t("notifications.overdue")} · ` : ""}
                  {new Date(n.created_at).toLocaleDateString(i18n.language?.startsWith("en") ? "en-GB" : "pt-PT", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </button>
            ))
          )}
        </div>

        {unreadCount > 0 && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center gap-2 text-xs"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("notifications.markAllRead")}
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
