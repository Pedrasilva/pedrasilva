import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, ListTodo } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  bucketFor,
  reminderLink,
  useCompleteReminder,
  useMyReminders,
  type Reminder,
  type ReminderBucket,
} from "@/hooks/use-reminders";

const ORDER: ReminderBucket[] = ["overdue", "today", "upcoming", "undated"];

/**
 * "My actions" — every open reminder owned by the signed-in user, overdue
 * first. Reminders are kept in sync from module records (CRM next actions
 * today), so this card is the single place to see what needs doing.
 */
export function MyActionsCard() {
  const { t, i18n } = useTranslation("common");
  const dateLocale = i18n.language?.startsWith("en") ? "en-GB" : "pt-PT";
  const { data, isLoading } = useMyReminders({ windowDays: 7 });
  const complete = useCompleteReminder();

  const grouped = useMemo(() => {
    const map = new Map<ReminderBucket, Reminder[]>();
    for (const r of data ?? []) {
      const b = bucketFor(r.due_date);
      map.set(b, [...(map.get(b) ?? []), r]);
    }
    return map;
  }, [data]);

  const total = data?.length ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">{t("myActions.title")}</h2>
        </div>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("myActions.count", { count: total })}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground">{t("myActions.empty")}</p>
      ) : (
        <div className="space-y-3">
          {ORDER.filter((b) => (grouped.get(b) ?? []).length > 0).map((bucket) => (
            <div key={bucket} className="space-y-1.5">
              <p
                className={cn(
                  "text-[11px] uppercase tracking-wide",
                  bucket === "overdue" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {t(`myActions.bucket.${bucket}`)}
              </p>
              {(grouped.get(bucket) ?? []).map((r) => {
                const link = reminderLink(r);
                const body = (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    {r.due_date && (
                      <p
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          bucket === "overdue" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {bucket === "overdue" && <AlertTriangle className="h-3 w-3" />}
                        {new Date(r.due_date).toLocaleDateString(dateLocale, {
                          day: "2-digit",
                          month: "short",
                        })}
                      </p>
                    )}
                  </div>
                );
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    {link ? (
                      <Link to={link as never} className="min-w-0 flex-1 hover:underline">
                        {body}
                      </Link>
                    ) : (
                      <div className="min-w-0 flex-1">{body}</div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      aria-label={t("myActions.markDone")}
                      title={t("myActions.markDone")}
                      onClick={() => complete.mutate(r.id)}
                      disabled={complete.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
