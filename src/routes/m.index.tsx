import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, startOfWeek } from "date-fns";
import { ChevronRight, Clock, MessageCircleQuestion, NotebookPen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useModuleAccess } from "@/lib/module-access";
import { TimesheetAssistantSheet } from "@/components/projects/timesheet-assistant-sheet";

export const Route = createFileRoute("/m/")({
  component: MobileHub,
  head: () => ({
    meta: [
      { title: "Captura rápida — Portal Pedra Silva" },
      { name: "description", content: "Log hours by voice, record a project note or answer marketing questions from your phone." },
      { property: "og:title", content: "Captura rápida — Portal Pedra Silva" },
      { property: "og:description", content: "Log hours by voice, record a project note or answer marketing questions from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const tileClass =
  "flex min-h-24 w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-transform active:scale-[0.99]";

function Tile({ icon: Icon, title, sub }: { icon: typeof Clock; title: string; sub: string }) {
  return (
    <>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </>
  );
}

function MobileHub() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { canAccess, loading } = useModuleAccess();
  const [hoursOpen, setHoursOpen] = useState(false);
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const fullName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email ?? "";
  const raw = fullName.split(/[\s@.]/)[0] ?? "";
  const first = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="pt-2 text-2xl font-semibold">{first ? t("mobile.greeting", { name: first }) : t("mobile.greetingAnon")}</h1>
      {loading ? null : (
        <>
          {canAccess("time") && (
            <button type="button" className={tileClass} onClick={() => setHoursOpen(true)}>
              <Tile icon={Clock} title={t("mobile.hours")} sub={t("mobile.hoursSub")} />
            </button>
          )}
          {canAccess("projects") && (
            <Link to="/m/note" className={tileClass}>
              <Tile icon={NotebookPen} title={t("mobile.note")} sub={t("mobile.noteSub")} />
            </Link>
          )}
          <Link to="/m/marketing" className={tileClass}>
            <Tile icon={MessageCircleQuestion} title={t("mobile.marketing")} sub={t("mobile.marketingSub")} />
          </Link>
        </>
      )}
      {hoursOpen && <TimesheetAssistantSheet open={hoursOpen} onOpenChange={setHoursOpen} weekStart={weekStart} />}
    </div>
  );
}
