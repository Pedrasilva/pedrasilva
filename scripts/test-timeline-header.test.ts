import { describe, expect, it } from 'vitest';
import { timelineDensity, fittingLabel, clusterTimelineMarkers, programmeFitWidth } from '../src/lib/projects/timeline-header';
describe('adaptive programme header', () => {
  it('uses month over every week from 28px per week', () => expect(timelineDensity(28)).toEqual({ top: 'month', bottom: 'week', weekInterval: 1 }));
  it('uses quarter over alternate weeks at 20px', () => expect(timelineDensity(20)).toEqual({ top: 'quarter', bottom: 'week', weekInterval: 2 }));
  it('uses quarter over every fourth week at 12px', () => expect(timelineDensity(12)).toEqual({ top: 'quarter', bottom: 'week', weekInterval: 4 }));
  it('uses year over months below 12px', () => expect(timelineDensity(11).bottom).toBe('month'));
  it('omits labels that cannot fit', () => expect(fittingLabel(15, ['Month 7', 'M7'])).toBe(''));
  it('clusters diamonds less than 16px apart without losing milestones', () => expect(clusterTimelineMarkers([{x:10,id:1},{x:25,id:2},{x:41,id:3}]).map(g=>g.items.map(i=>i.id))).toEqual([[1,2],[3]]));
  it('fits all 118 weeks without a minimum scale forcing overflow', () => expect(programmeFitWidth(700, 450, 118*7)*118*7+450+6+24).toBe(700));
});