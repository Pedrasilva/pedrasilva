import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, PanelRightOpen, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GanttChart } from "@/components/projects/gantt-chart";
import { GanttPrintButton } from "./gantt-print-button";

export function PlannerFrame({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 overflow-hidden rounded-md border border-border bg-canvas">{children}</div>;
}

/** The only chart renderer used by quote and operational scheduling adapters. */
export function PlannerChart(props: ComponentProps<typeof GanttChart>) {
  return <GanttChart {...props} />;
}

type Zoom = "fit" | "year" | "quarter" | "month" | "week";
const zooms: Zoom[] = ["fit", "year", "quarter", "month", "week"];
export function PlannerZoom({ zoom, setZoom, poolCollapsed, togglePool, getTarget }: {
  zoom: Zoom; setZoom: (zoom: Zoom) => void; poolCollapsed: boolean;
  togglePool: () => void; getTarget: () => HTMLElement | null;
}) {
  const { t } = useTranslation();
  const index = zooms.indexOf(zoom);
  return <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-0.5">
    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => setZoom(zooms[Math.max(0, index - 1)])} aria-label={t("projects:plannerGantt.ui.zoomOut")}><Minus className="h-3.5 w-3.5" /></Button>
    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === zooms.length - 1} onClick={() => setZoom(zooms[Math.min(zooms.length - 1, index + 1)])} aria-label={t("projects:plannerGantt.ui.zoomIn")}><Plus className="h-3.5 w-3.5" /></Button>
    {[...zooms].reverse().map(z => <Button key={z} variant={z === zoom ? "default" : "ghost"} size="sm" className="h-7 px-2 text-xs" onClick={() => setZoom(z)}>{t(`crm:workspace.planning.zoom${z[0].toUpperCase()}${z.slice(1)}`)}</Button>)}
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePool} aria-label={t(poolCollapsed ? "common:expandTeam" : "common:collapseTeam")}>{poolCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}</Button>
    <GanttPrintButton getTarget={getTarget} />
  </div>;
}