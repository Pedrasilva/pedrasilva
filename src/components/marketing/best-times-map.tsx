import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { useDateLocale } from '@/i18n/use-date-locale';
import { POSTING_HOURS, timingTone, type TimingMap, type TimingCell, type TimingFormat } from '@/lib/marketing/best-times';
import { useBestTimes } from '@/lib/marketing/use-best-times';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function useTimingLabel() {
  const { t, i18n } = useTranslation('marketing'); const locale = useDateLocale();
  return (cell: TimingCell) => t('bestTimes.cell', { day: format(new Date(2026, 0, 5 + cell.weekday), 'EEE', { locale }), hour: `${String(cell.hour).padStart(2, '0')}:00`, score: cell.score ?? '—', reach: cell.avgReach == null ? '—' : Math.round(cell.avgReach).toLocaleString(i18n.language), count: cell.posts, engagement: cell.engagementRate == null ? '—' : `${(cell.engagementRate * 100).toFixed(1)}%` });
}
export function TimingLegend({ map }: { map: TimingMap }) {
  const { t } = useTranslation('marketing');
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
    <div className="flex gap-3">{(['best', 'average', 'weak'] as const).map(k => <span key={k} className="flex items-center gap-1"><span className={cn('h-3 w-3 rounded-sm border', `timing-${k}`)} />{t(`bestTimes.${k}`)}</span>)}</div>
    <span>{map.enoughPosts ? t('bestTimes.basedOn', { count: map.postCount }) : t('bestTimes.notEnough', { count: map.postCount })}{map.hasFollowers ? ` · ${t('bestTimes.followers')}` : ''} · {t('bestTimes.period')}</span>
    {!map.hasFollowers && <span>{t(map.activityStatus === 'unsupported' ? 'bestTimes.unsupported' : 'bestTimes.noActivity')}</span>}
  </div>;
}
export function TimingFormatChoice({ value, onChange }: { value: TimingFormat; onChange: (v: TimingFormat) => void }) {
  const { t } = useTranslation('marketing');
  return <div className="flex gap-1">{(['feed', 'story'] as const).map(v => <Button key={v} size="sm" variant={value === v ? 'secondary' : 'ghost'} onClick={() => onChange(v)}>{t(`bestTimes.${v}`)}</Button>)}</div>;
}
export function BestTimesMap() {
  const { t } = useTranslation('marketing'); const locale = useDateLocale(); const label = useTimingLabel();
  const [kind, setKind] = useState<TimingFormat>('feed'); const { map, isError } = useBestTimes(kind);
  return <section className="space-y-3" data-best-times-map>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{t('bestTimes.title')}</h3><TimingFormatChoice value={kind} onChange={setKind} /></div>
    {isError ? <p className="text-xs text-destructive">{t('bestTimes.loadError')}</p> : <TimingLegend map={map} />}
    <div className="overflow-x-auto"><div className="grid min-w-[640px] grid-cols-[4rem_repeat(17,minmax(0,1fr))] gap-1 text-[10px]">
      <span />{POSTING_HOURS.map(h => <span key={h} className="text-center text-muted-foreground">{String(h).padStart(2,'0')}</span>)}
      {Array.from({length:7},(_,weekday) => <div key={weekday} className="contents"><span className="self-center capitalize">{format(new Date(2026,0,5+weekday),'EEE',{locale})}</span>{map.cells.filter(c=>c.weekday===weekday).map(c=><div key={c.hour} tabIndex={0} title={label(c)} aria-label={label(c)} className={cn('flex h-8 items-center justify-center rounded-sm border border-border/50',timingTone(c.score))}>{c.score ?? '—'}</div>)}</div>)}
    </div></div>
  </section>;
}