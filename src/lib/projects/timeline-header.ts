export type TimelineUnit = 'week' | 'month' | 'quarter' | 'year';
export function timelineDensity(pixelsPerWeek: number) {
  return {
    top: (pixelsPerWeek >= 28 ? 'month' : pixelsPerWeek >= 12 ? 'quarter' : 'year') as TimelineUnit,
    bottom: (pixelsPerWeek >= 12 ? 'week' : 'month') as TimelineUnit,
    weekInterval: pixelsPerWeek >= 28 ? 1 : pixelsPerWeek >= 20 ? 2 : 4,
  };
}
export function fittingLabel(width: number, labels: string[]) {
  return labels.find(label => label.length * 7 + 10 <= width) ?? '';
}
export function clusterTimelineMarkers<T extends { x: number }>(markers: T[], distance = 16) {
  const groups: { x: number; items: T[] }[] = [];
  for (const marker of [...markers].sort((a, b) => a.x - b.x)) {
    const last = groups.at(-1);
    if (last && marker.x - (last.items.at(-1)?.x ?? last.x) < distance) {
      last.items.push(marker);
      last.x = last.items.reduce((sum, item) => sum + item.x, 0) / last.items.length;
    } else groups.push({ x: marker.x, items: [marker] });
  }
  return groups;
}
export function programmeFitWidth(width: number, outline: number, days: number) {
  return Math.max(1, width - outline - 6 - 24) / Math.max(1, days);
}