/**
 * Five-state lifecycle rail for a quote:
 *   Draft → Sent → Approved → Signed → Project
 *
 * Presentational only. It replaces the single status pill in the quote header
 * so the route is visible at a glance and the header's one primary button
 * always reads as "the next step".
 */
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/lib/crm/types";

export type QuoteLifecycleState = "draft" | "sent" | "approved" | "signed" | "converted" | "lost";

const ORDER: Exclude<QuoteLifecycleState, "lost">[] = [
  "draft",
  "sent",
  "approved",
  "signed",
  "converted",
];

export function resolveQuoteLifecycle(args: {
  status: QuoteStatus;
  signedAt: string | null;
  hasProject: boolean;
}): QuoteLifecycleState {
  if (args.hasProject) return "converted";
  if (args.status === "rejected") return "lost";
  if (args.status === "approved") return args.signedAt ? "signed" : "approved";
  return args.status === "sent" ? "sent" : "draft";
}

export function QuoteStatusRail({ state }: { state: QuoteLifecycleState }) {
  const { t } = useTranslation("crm");

  const currentIdx = state === "lost" ? -1 : ORDER.indexOf(state);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="secondary" size="sm" className="gap-1.5 rounded-full whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{t(`quotes.lifecycle.${state}`)}<ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {ORDER.map((s, idx) => <DropdownMenuItem key={s} disabled className="opacity-100 gap-2">
        {idx < currentIdx ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className={cn("h-2 w-2 mx-0.75 rounded-full", idx === currentIdx ? "bg-primary" : "border border-muted-foreground")} />}
        {t(`quotes.lifecycle.${s}`)}
      </DropdownMenuItem>)}
      {state === "lost" && <DropdownMenuItem disabled>{t("quotes.lifecycle.lost")}</DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
