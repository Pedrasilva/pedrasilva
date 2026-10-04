import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewAsUserId } from "@/hooks/use-view-as-user-id";
import { clearCalendarMemory, disconnectCalendar, getCalendarConnectUrl, getCalendarMemoryCount, getCalendarStatus } from "@/lib/projects/calendar.functions";
import { cn } from "@/lib/utils";

const k = (s: string) => `timesheetAssistant.calendar.${s}`;
export const CALENDAR_STATUS_KEY = ["calendar-status"];

/** Status of the signed-in person's own calendar; disabled in View As. */
export function useCalendarStatus() {
  const { active: viewAs } = useViewAsUserId();
  const get = useServerFn(getCalendarStatus);
  const q = useQuery({ queryKey: CALENDAR_STATUS_KEY, queryFn: () => get(), enabled: !viewAs, staleTime: 60_000 });
  return { viewAs, connected: !viewAs && !!q.data?.connected, email: q.data?.email ?? null, loading: q.isLoading };
}

export function CalendarConnection({ compact = false, expired = false, className }: { compact?: boolean; expired?: boolean; className?: string }) {
  const { t } = useTranslation("projects");
  const qc = useQueryClient();
  const { viewAs, connected, email, loading } = useCalendarStatus();
  const getUrl = useServerFn(getCalendarConnectUrl);
  const disc = useServerFn(disconnectCalendar);
  const getMem = useServerFn(getCalendarMemoryCount);
  const clearMem = useServerFn(clearCalendarMemory);
  const mem = useQuery({ queryKey: ["calendar-match-memory"], queryFn: () => getMem(), enabled: !viewAs && !compact, staleTime: 60_000 });
  async function clearMemory() {
    try {
      await clearMem();
      toast.success(t(k("memoryCleared")));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      qc.invalidateQueries({ queryKey: ["calendar-match-memory"] });
      qc.invalidateQueries({ queryKey: ["timesheet-calendar-grid"] });
    }
  }

  // Result of the Google round trip (?calendar=...).
  useEffect(() => {
    const u = new URL(window.location.href);
    const r = u.searchParams.get("calendar");
    if (!r) return;
    u.searchParams.delete("calendar");
    window.history.replaceState(null, "", u.toString());
    if (r === "connected") toast.success(t(k("connectedToast")));
    else if (r === "domain") toast.error(t(k("domainError")));
    else if (r === "noscope") toast.error(t(k("scopeError")));
    else if (r !== "cancelled") toast.error(t(k("connectError")));
    qc.invalidateQueries({ queryKey: CALENDAR_STATUS_KEY });
  }, [qc, t]);

  if (viewAs) return <p className={cn("text-sm text-muted-foreground", className)}>{t(k("viewAs"))}</p>;

  async function connect() {
    try {
      const { url } = await getUrl({ data: { origin: window.location.origin, returnTo: window.location.pathname } });
      if (window.self !== window.top) window.open(url, "_blank");
      else window.location.assign(url);
    } catch (e) {
      toast.error(t(k("connectError")), { description: (e as Error).message });
    }
  }
  async function disconnect() {
    try {
      const { revoked } = await disc();
      if (revoked) toast.success(t(k("disconnected")));
      else toast.warning(t(k("revokeFailed")), { duration: 15000 });
    } catch (e) {
      toast.error(t(k("disconnectError")), { description: (e as Error).message });
    } finally {
      qc.invalidateQueries({ queryKey: CALENDAR_STATUS_KEY });
    }
  }

  return (
    <div className={cn("space-y-2 rounded-md border p-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-label={t(k("loading"))} />
        ) : connected ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm">
              {expired ? t(k("expired")) : t(k("connectedAs"), { email })}
            </span>
            {expired && <Button size="sm" onClick={connect}>{t(k("reconnect"))}</Button>}
            <Button size="sm" variant="outline" onClick={disconnect} aria-label={t(k("disconnect"))}>
              <Unlink className="mr-1 h-4 w-4" /> {t(k("disconnect"))}
            </Button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-sm">{t(k("notConnected"))}</span>
            <Button size="sm" onClick={connect}>{t(k("connect"))}</Button>
          </>
        )}
      </div>
      {!compact || !connected ? <p className="text-xs text-muted-foreground">{t(k("explain"))}</p> : null}
      {!compact && (mem.data?.count ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="flex-1 text-xs text-muted-foreground">{t(k("memoryCount"), { count: mem.data!.count })}</span>
          <Button size="sm" variant="outline" onClick={clearMemory}>{t(k("memoryClear"))}</Button>
        </div>
      )}
    </div>
  );
}
