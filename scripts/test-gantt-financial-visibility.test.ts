import { describe, expect, it } from 'vitest';
import { visibleGanttNumber, ganttProjectFigures, sumAllowedGanttValues } from '../src/lib/projects/gantt-financial-visibility';
import { buildProjectGanttTree } from '../src/lib/projects/build-project-gantt-tree';
import type { StageWithAllocations } from '../src/lib/projects/types';
const stage = (budget: number): StageWithAllocations => ({ id: 'stage', project_id: 'project', name: 'QA', start_date: '2026-11-09', end_date: '2026-11-10', sort_order: 1, budget, allocations: [] } as unknown as StageWithAllocations);
describe('global Gantt project financial visibility', () => {
  it('all-OFF empty allocations do not invent zero cost or budget', () => {
    const result = ganttProjectFigures([stage(1000)], false, undefined);
    expect(result.cost).toBeNaN(); expect(result.budget).toBeNaN();
  });
  it('all-ON preserves a genuine zero cost and 1000 budget', () => {
    expect(ganttProjectFigures([stage(1000)], true, undefined)).toEqual({ cost: 0, budget: 1000 });
  });
  it('missing stages are unavailable even when authorized', () => {
    expect(ganttProjectFigures([], true, undefined).cost).toBeNaN();
  });
  it('partial permission never exposes a supplied number', () => {
    expect(visibleGanttNumber(1274, false)).toBeNaN();
  });
  it('parent and synthetic project budgets preserve missing inputs', () => {
    const tree = buildProjectGanttTree([stage(NaN)], 'project', 'QA');
    expect(tree.mappedStages[0].budget).toBeNaN();
  });
  it('totals sum only permitted projects', () => {
    expect(sumAllowedGanttValues([{ allowed: true, value: 1000 }, { allowed: false, value: 9999 }, { allowed: true, value: 200 }])).toBe(1200);
  });
  it('all denied totals are unavailable, never zero', () => {
    expect(sumAllowedGanttValues([{ allowed: false, value: 9999 }])).toBeNaN();
  });
  it('an allowed missing component does not become a partial total', () => {
    expect(sumAllowedGanttValues([{ allowed: true, value: NaN }, { allowed: true, value: 200 }])).toBeNaN();
  });
});