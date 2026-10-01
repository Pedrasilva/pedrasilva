import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { useMyPermissionsV2 } from "@/hooks/use-permissions-v2";

import { useUpcomingCelebrations } from "@/hooks/use-home-feed";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import {
  Users,
  Building2,
  Briefcase,
  Wallet,
  ArrowUpRight,
  Sparkles,
  Quote,
  Boxes,
  Images,
  Armchair,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BirthdayFireworks } from "@/components/BirthdayFireworks";
import { TodayStrip } from "@/components/home/today-strip";
import { MyActionsCard } from "@/components/home/my-actions-card";
import { RecentlyVisited } from "@/components/home/recently-visited";
import { QuestionsForYou } from "@/components/home/questions-for-you";

import {
  useProposalImages,
  useSignedProposalImageUrl,
} from "@/lib/psa-proposal/use-proposal-images";
import { useModuleAccess, type ModuleId } from "@/lib/module-access";
import hrTexture from "@/assets/modules/hr.jpg.asset.json";
import crmTexture from "@/assets/modules/crm.jpg.asset.json";
import projectsTexture from "@/assets/modules/projects.jpg.asset.json";
import financeTexture from "@/assets/modules/finance.jpg.asset.json";
import inventoryTexture from "@/assets/modules/inventory.jpg.asset.json";
import productsTexture from "@/assets/modules/products.jpg.asset.json";
import portfolioTexture from "@/assets/modules/portfolio.jpg.asset.json";
import marketingTexture from "@/assets/modules/marketing.jpg.asset.json";
import homeBanner from "@/assets/home-banner.png.asset.json";

/** Quiet material textures behind each module card (decorative only). */
const MODULE_TEXTURE: Record<string, string> = {
  "/hr": hrTexture.url,
  "/crm": crmTexture.url,
  "/projects": projectsTexture.url,
  "/finance": financeTexture.url,
  "/inventory": inventoryTexture.url,
  "/products": productsTexture.url,
  "/portfolio": portfolioTexture.url,
  "/marketing": marketingTexture.url,
};



export const Route = createFileRoute("/_app/")({
  component: HubPage,
});

type ModuleDef = {
  to:
    | "/hr"
    | "/crm"
    | "/projects"
    | "/finance"
    | "/inventory"
    | "/products"
    | "/portfolio"
    | "/marketing";

  number: string;
  titleKey: string;
  subtitleKey: string;
  descriptionKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Module access rule (src/lib/module-access.ts). */
  moduleId: ModuleId;
};


const MODULES: ModuleDef[] = [
  {
    to: "/hr",
    number: "01",
    titleKey: "hr:module.title",
    subtitleKey: "hr:module.subtitle",
    descriptionKey: "hr:module.description",
    icon: Users,
    moduleId: "hr",
  },
  {
    to: "/crm",
    number: "02",
    titleKey: "crm:module.title",
    subtitleKey: "crm:module.subtitle",
    descriptionKey: "crm:module.description",
    icon: Building2,
    moduleId: "crm",
  },
  {
    to: "/projects",
    number: "03",
    titleKey: "projects:module.title",
    subtitleKey: "projects:module.subtitle",
    descriptionKey: "projects:module.description",
    icon: Briefcase,
    moduleId: "projects",
  },
  {
    to: "/finance",
    number: "04",
    titleKey: "finance:module.title",
    subtitleKey: "finance:module.subtitle",
    descriptionKey: "finance:module.description",
    icon: Wallet,
    moduleId: "finance",
  },
  {
    to: "/inventory",
    number: "05",
    titleKey: "inventory:module.title",
    subtitleKey: "inventory:module.subtitle",
    descriptionKey: "inventory:module.description",
    icon: Boxes,
    moduleId: "inventory",
  },
  {
    to: "/products",
    number: "06",
    titleKey: "home:products.moduleTitle",
    subtitleKey: "home:products.moduleSubtitle",
    descriptionKey: "home:products.moduleDescription",
    icon: Armchair,
    moduleId: "products",
  },
  {
    to: "/portfolio",
    number: "07",
    titleKey: "home:signature.moduleTitle",
    subtitleKey: "home:signature.moduleSubtitle",
    descriptionKey: "home:signature.moduleDescription",
    icon: Images,
    moduleId: "portfolio",
  },
  {
    to: "/marketing",
    number: "08",
    titleKey: "home:marketing.moduleTitle",
    subtitleKey: "home:marketing.moduleSubtitle",
    descriptionKey: "home:marketing.moduleDescription",
    icon: Megaphone,
    moduleId: "marketing",
  },
];



const QUOTES = [
  {
    text: "Architecture is the learned game, correct and magnificent, of forms assembled in the light.",
    author: "Le Corbusier",
  },
  {
    text: "We shape our buildings; thereafter they shape us.",
    author: "Winston Churchill",
  },
  {
    text: "Less is more.",
    author: "Mies van der Rohe",
  },
  {
    text: "God is in the details.",
    author: "Mies van der Rohe",
  },
  {
    text: "Form follows function — that has been misunderstood. Form and function should be one.",
    author: "Frank Lloyd Wright",
  },
  {
    text: "Architecture is the thoughtful making of space.",
    author: "Louis Kahn",
  },
  {
    text: "A great building must begin with the immeasurable, must go through measurable means when it is being designed, and in the end must be unmeasurable.",
    author: "Louis Kahn",
  },
  {
    text: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci",
  },
];

function quoteOfTheDay() {
  const d = new Date();
  const dayOfYear = Math.floor(
    (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  return QUOTES[dayOfYear % QUOTES.length];
}



function HubPage() {
  const { t } = useTranslation(["home", "common", "hr", "crm", "projects", "finance", "inbox", "inventory"]);
  const { isAdmin, loading: authLoading, user } = useAuth();
  const { can: canV2 } = useMyPermissionsV2();
  // Non-curators open Marketing on the Post planner.
  const tileTo = (to: ModuleDef["to"]) =>
    to === "/marketing" && !isAdmin && !canV2("marketing.curate", "all") ? "/marketing/posts" : to;
  const { canAccess, loading: accessLoading } = useModuleAccess();

  const loading = authLoading || accessLoading;

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => t(`home:month.${i}`)),
    [t],
  );
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => t(`home:weekday.${i}`)),
    [t],
  );




  const visible = useMemo(
    () => MODULES.filter((m) => canAccess(m.moduleId)),
    [canAccess],
  );



  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return t("home:greeting.night");
    if (h < 12) return t("home:greeting.morning");
    if (h < 20) return t("home:greeting.afternoon");
    return t("home:greeting.evening");
  }, [t]);

  const firstName = useMemo(() => {
    const email = user?.email ?? "";
    const local = email.split("@")[0] ?? "";
    if (!local) return "";
    return local
      .split(/[._-]/)[0]
      .replace(/^./, (c) => c.toUpperCase());
  }, [user?.email]);

  const today = useMemo(() => {
    const d = new Date();
    return `${weekdays[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }, [weekdays, months]);

  const quote = useMemo(quoteOfTheDay, []);

  const celebrationsQ = useUpcomingCelebrations(45);

  const todayCelebrations =
    celebrationsQ.data?.filter((c) => c.daysAway === 0) ?? [];


  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {t("common:loading")}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("home:noModules.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("home:noModules.body")}
        </p>
      </div>
    );
  }

  return (
    <div className="psa-editorial -mx-4 -my-6 sm:-mx-6">
      {/* HERO ============================================================= */}
      <section className="relative border-b bg-[color-mix(in_srgb,var(--cream)_60%,var(--background))]">
        {todayCelebrations.some((c) => c.kind === "birthday") && (
          <BirthdayFireworks />
        )}
        <div className="relative grid lg:grid-cols-[1.05fr_1fr]">
          <div className="px-4 sm:px-6 lg:pl-10 xl:pl-16 py-10 lg:py-16 max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              {today}
            </div>

            <h1 className="mt-6 font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""}.
              <span className="mt-1 block text-muted-foreground">
                {t("home:tagline")}
              </span>
            </h1>

            <div className="mt-8 h-px w-14 bg-foreground/25" />

            <p className="mt-5 max-w-md text-sm text-foreground/70 leading-relaxed">
              {t("home:intro")}
            </p>

            {/* Today's celebration banner */}
            {todayCelebrations.length > 0 && (
              <div className="mt-7 inline-flex flex-wrap items-center gap-3 rounded-full border bg-background/80 px-5 py-2.5 backdrop-blur shadow-sm">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-background"
                  style={{ background: "var(--clay)" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium">
                  {t("home:todayCelebrate", {
                    names: todayCelebrations
                      .map((c) =>
                        c.kind === "birthday"
                          ? t("home:celebrate.birthday", { name: c.nome })
                          : t("home:celebrate.anniversary", {
                              name: c.nome,
                              years: c.years,
                            }),
                      )
                      .join(", "),
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="relative min-h-[220px] lg:min-h-[420px]">
            <img
              src={homeBanner.url}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-[color-mix(in_srgb,var(--cream)_92%,transparent)] via-[color-mix(in_srgb,var(--cream)_25%,transparent)] to-transparent"
            />
            <div className="absolute right-6 bottom-6 hidden md:block text-right text-[10px] uppercase tracking-[0.3em] text-foreground/70">
              {t("home:studioHub")}
            </div>
          </div>
        </div>
      </section>


      {/* TODAY ============================================================ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
        <TodayStrip />
      </section>

      {/* MY WORK ========================================================== */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MyActionsCard />
          </div>
          <RecentlyVisited />
        </div>
      </section>








      <QuestionsForYou />

      {/* MODULES ========================================================== */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 lg:pt-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {t("home:modules.kicker")}
            </div>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl tracking-tight">
              {t("home:modules.title")}
            </h2>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((m) => {
            const Icon = m.icon;
            return (
              <Link key={m.to} to={tileTo(m.to)} className="group block">
                <Card
                  className={cn(
                    "relative h-full overflow-hidden rounded-none border-border/70 p-0 transition-all duration-300",
                    "hover:-translate-y-1 hover:shadow-lg hover:border-foreground/25",
                  )}
                >
                  {MODULE_TEXTURE[m.to] && (
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      <img
                        src={MODULE_TEXTURE[m.to]}
                        alt=""
                        aria-hidden
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                      <span className="absolute left-3 top-3 font-display text-xs tracking-[0.2em] text-background/80 mix-blend-difference">
                        {m.number}
                      </span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl tracking-tight">
                        {t(m.titleKey)}
                      </h3>
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors group-hover:border-foreground/40 group-hover:bg-foreground group-hover:text-background">
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      {t(m.subtitleKey)}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {t(m.descriptionKey)}
                    </p>
                    {m.to === "/portfolio" && <PortfolioPreviewStrip />}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>

        {!isAdmin && visible.length > 0 && visible.length < MODULES.length && (
          <p className="mt-4 text-xs text-muted-foreground">
            {t("home:hiddenModules.note")}
          </p>
        )}
      </section>


      {/* QUOTE ============================================================ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 lg:py-16">
        <Card
          className="overflow-hidden border-0"
          style={{ background: "var(--ink)", color: "var(--cream)" }}
        >
          <div className="px-8 py-10 sm:px-12 sm:py-14">
            <Quote className="h-6 w-6 opacity-40" />
            <blockquote className="mt-4 font-display text-2xl sm:text-3xl leading-snug tracking-tight max-w-4xl">
              “{quote.text}”
            </blockquote>
            <div className="mt-6 text-[11px] uppercase tracking-[0.24em] opacity-70">
              — {quote.author}
            </div>
          </div>
        </Card>
      </section>

    </div>
  );
}

/** Three most recent library images, shown inside the Portfolio module tile. */
function PortfolioPreviewStrip() {
  const images = useProposalImages();
  const latest = (images.data ?? []).slice(0, 3);
  if (latest.length === 0) return null;
  return (
    <div className="mt-5 grid grid-cols-3 gap-2">
      {latest.map((e) => (
        <PortfolioThumb key={e.id} path={e.storage_path} bucket={e.bucket} alt={e.name} />
      ))}
    </div>
  );
}

function PortfolioThumb({
  path,
  bucket,
  alt,
}: {
  path: string;
  bucket: string;
  alt: string;
}) {
  const thumb = useSignedProposalImageUrl(path, bucket, {
    width: 240,
    quality: 50,
  });
  return (
    <div className="aspect-[4/3] overflow-hidden rounded-md bg-muted">
      {thumb.data ? (
        <img
          src={thumb.data}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-muted" />
      )}
    </div>
  );
}

