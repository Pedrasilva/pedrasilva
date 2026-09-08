/**
 * Today at the studio — a single wide band of faces showing who is out,
 * who is working from home and who is celebrating today. Read-only; it
 * reuses the same home-feed queries as the cards below it.
 */
import { useTranslation } from "react-i18next";
import { Cake, Laptop, Palmtree, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CollaboratorAvatar } from "@/components/CollaboratorAvatar";
import {
  useTeamAvailability,
  useUpcomingCelebrations,
} from "@/hooks/use-home-feed";

type Face = {
  key: string;
  collaboratorId: string;
  nome: string;
  meta: string;
  accent: string;
  Icon: React.ComponentType<{ className?: string }>;
};

export function TodayFaces() {
  const { t } = useTranslation(["home", "common"]);
  const availabilityQ = useTeamAvailability(14);
  const celebrationsQ = useUpcomingCelebrations(45);

  const faces: Face[] = [];

  for (const v of availabilityQ.data?.outToday ?? []) {
    faces.push({
      key: v.id,
      collaboratorId: v.collaboratorId,
      nome: v.nome,
      meta: t("home:availability.outToday"),
      accent: "var(--clay)",
      Icon: Palmtree,
    });
  }
  for (const v of availabilityQ.data?.remoteToday ?? []) {
    faces.push({
      key: v.id,
      collaboratorId: v.collaboratorId,
      nome: v.nome,
      meta: t("home:availability.remote"),
      accent: "var(--sage)",
      Icon: Laptop,
    });
  }
  for (const c of (celebrationsQ.data ?? []).filter((x) => x.daysAway === 0)) {
    faces.push({
      key: `c-${c.id}`,
      collaboratorId: c.id,
      nome: c.nome,
      meta:
        c.kind === "birthday"
          ? t("home:celebrate.turnsAge", { age: c.age })
          : t("home:celebrate.yearsAtPsa", { count: c.years ?? 0 }),
      accent: "var(--clay)",
      Icon: c.kind === "birthday" ? Cake : Sparkles,
    });
  }

  const loading = availabilityQ.isLoading || celebrationsQ.isLoading;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h3 className="font-display text-base tracking-tight">
          {t("home:todayFaces.title")}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("home:relative.today")}
        </span>
      </div>

      {loading ? (
        <div className="px-5 py-6 text-center text-xs text-muted-foreground">
          {t("common:loading")}
        </div>
      ) : faces.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-muted-foreground">
          {t("home:todayFaces.empty")}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-6 gap-y-4 px-5 py-4">
          {faces.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <span className="relative">
                <CollaboratorAvatar
                  collaboratorId={f.collaboratorId}
                  name={f.nome}
                  size={36}
                />
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-background"
                  style={{ background: f.accent, color: "var(--cream)" }}
                >
                  <f.Icon className="h-2.5 w-2.5" />
                </span>
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{f.nome}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {f.meta}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
