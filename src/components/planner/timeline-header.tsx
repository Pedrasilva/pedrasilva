import { useMemo, useState } from 'react';
import { addDays, differenceInCalendarDays, format, getISOWeek } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '@/i18n/use-date-locale';
import { clusterTimelineMarkers, fittingLabel, timelineDensity, type TimelineUnit } from '@/lib/projects/timeline-header';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { euros } from '@/lib/projects/gantt-utils';
import type { PaymentMilestone } from '@/components/projects/gantt-chart';

type Cell = { start: number; days: number; label: string; title: string; week: number };
export function useTimelineHeader(origin: Date, days: number, dayWidth: number, relative: boolean) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  return useMemo(() => {
    const density = timelineDensity(dayWidth * 7);
    const cells = (unit: TimelineUnit): Cell[] => {
      const out: Cell[] = [];
      const span = { week: 7, month: 28, quarter: 84, year: 336 };
      const key = (i: number) => {
        if (relative) return Math.floor(i / span[unit]);
        const d = addDays(origin, i);
        return unit === 'week' ? format(d, "RRRR-II") : unit === 'month' ? format(d, 'yyyy-MM') : unit === 'quarter' ? `${d.getFullYear()}-${Math.floor(d.getMonth() / 3)}` : d.getFullYear();
      };
      for (let i = 0; i < days;) {
        let count = 1;
        while (i + count < days && key(i + count) === key(i)) count++;
        const date = addDays(origin, i);
        const n = relative ? Math.floor(i / span[unit]) + 1 : unit === 'week' ? getISOWeek(date) : unit === 'month' ? date.getMonth() + 1 : unit === 'quarter' ? Math.floor(date.getMonth() / 3) + 1 : date.getFullYear();
        const title = relative ? `${t(`common:${unit}`)} ${n}` : unit === 'month' ? format(date, 'MMM yyyy', { locale }) : unit === 'week' ? `${t('common:week')} ${n}` : unit === 'quarter' ? `${t('common:quarter')} ${n} · ${date.getFullYear()}` : String(n);
        const short = unit === 'month' ? `M${n}` : unit === 'quarter' ? `${t('common:quarter').slice(0, 1)}${n}` : String(n);
        const interval = unit === 'week' ? density.weekInterval : Math.max(1, Math.ceil(28 / (span[unit] * dayWidth)));
        const index = out.length;
        const label = index % interval === 0 ? fittingLabel(count * dayWidth, unit === 'week' ? [String(n)] : [title, short]) : '';
        out.push({ start: i, days: count, label, title, week: Math.floor(i / 7) });
        i += count;
      }
      return out;
    };
    return { top: cells(density.top), bottom: cells(density.bottom), topUnit: density.top, bottomUnit: density.bottom };
  }, [origin, days, dayWidth, relative, locale, t]);
}

export function TimelineHeader({ model, dayWidth, origin, relative, milestones = [], financials }: {
  model: ReturnType<typeof useTimelineHeader>; dayWidth: number; origin: Date; relative: boolean; milestones?: PaymentMilestone[]; financials: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(null);
  const current = relative ? -1 : Math.floor(differenceInCalendarDays(new Date(), origin) / 7);
  const total = model.top.reduce((sum, cell) => sum + cell.days * dayWidth, 0);
  const clusters = clusterTimelineMarkers(milestones.map(item => ({ ...item, x: differenceInCalendarDays(new Date(item.date), origin) * dayWidth })).filter(item => item.x >= 0 && item.x <= total));
  return <div data-timeline-header data-pixels-per-week={dayWidth * 7} className="sticky top-0 z-20 border-b border-border bg-background">
    {([model.top, model.bottom] as Cell[][]).map((cells, row) => <div key={row} data-timeline-band={row} className="relative flex h-7 border-b border-border/40">
      <span className="pointer-events-none absolute left-1 top-0 z-10 bg-background px-1 text-[9px] leading-3 text-muted-foreground">{t(`common:${row === 0 ? model.topUnit : model.bottomUnit}`)}</span>
      {cells.map(cell => <div key={cell.start} title={cell.title} onClick={() => setSelected(cell.week)} className={`flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap border-l border-border/40 pt-2 text-[10px] tabular-nums ${row === 0 ? 'font-semibold text-foreground' : selected === cell.week || current === cell.week ? 'bg-primary/15 font-semibold text-primary' : 'text-muted-foreground'}`} style={{ width: cell.days * dayWidth }}>{cell.label}</div>)}
    </div>)}
    {milestones.length > 0 && <div data-timeline-milestones className="relative h-8 bg-muted/30">
      <TooltipProvider delayDuration={120}>{clusters.map((group, index) => {
        const next = clusters[index + 1]?.x ?? total;
        const item = group.items[0];
        if (!item) return null;
        const labelFits = group.items.length === 1 && item.label.length * 6 + 32 < next - group.x;
        return <Tooltip key={item.id}><TooltipTrigger asChild><div tabIndex={0} className="absolute top-1/2 -translate-y-1/2 cursor-default" style={{ left: Math.max(8, Math.min(total - 8, group.x)) }}>
          <span className={`absolute -left-1.5 -top-1.5 h-3 w-3 rotate-45 ring-2 ring-background ${group.items.every(m => m.status === 'paid') ? 'bg-success' : group.items.some(m => m.status === 'invoiced') ? 'bg-warning' : 'bg-foreground/70'}`} />
          {group.items.length > 1 && <span className="absolute -left-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-background px-0.5 text-[9px] font-semibold text-foreground ring-1 ring-border">{group.items.length}</span>}
          {labelFits && <span className="absolute left-3 -top-2 whitespace-nowrap text-[10px] text-muted-foreground">{item.label}</span>}
        </div></TooltipTrigger><TooltipContent className="max-w-sm text-xs">{group.items.map(m => <div key={m.id} className="py-1"><div className="font-semibold">{m.label}</div><div className="tabular-nums">{t('common:week')} {Math.floor(differenceInCalendarDays(new Date(m.date), origin) / 7) + 1}{financials && <> · {euros(m.amount)}</>}{!relative && <> · {m.date}</>}</div>{m.note && <div>{m.note}</div>}</div>)}</TooltipContent></Tooltip>;
      })}</TooltipProvider>
    </div>}
  </div>;
}