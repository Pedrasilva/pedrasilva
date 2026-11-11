import { describe, it, expect } from 'vitest';
import { projectHourClassification } from '../src/lib/projects/project-hour-classification';
const history = { loggedHours: 0, billableHours: 0, nonBillableHours: 0 };
describe('saved project hour classification', () => {
  it('keeps Mastercard billable and non-billable independent of resources and rates', () => {
    expect(projectHourClassification([{stage_id:'s',hours:542.15,billableHours:535.65,nonBillableHours:6.5}],null,history)).toEqual({logged:542.15,billable:535.65,nonBillable:6.5});
  });
  it('never invents classification from total minus found resources', () => {
    expect(projectHourClassification([{stage_id:'s',hours:8,billableHours:NaN,nonBillableHours:NaN}],null,history).nonBillable).toBeNaN();
  });
  it('shows unavailable while the saved summary is unavailable', () => {
    expect(projectHourClassification(undefined,null,history).billable).toBeNaN();
    expect(projectHourClassification([],null,undefined).logged).toBeNaN();
  });
  it('scopes stages and excludes unassigned imported history from stage totals', () => {
    expect(projectHourClassification([{stage_id:'a',hours:8,billableHours:7,nonBillableHours:1},{stage_id:'b',hours:4,billableHours:4,nonBillableHours:0}],new Set(['a']),{loggedHours:100,billableHours:100,nonBillableHours:0})).toEqual({logged:8,billable:7,nonBillable:1});
  });
});