import {describe,it,expect,beforeEach} from "vitest";
import {allocationCost,allocationHours,setWorkingCalendarHolidays,NO_HOLIDAYS} from "../src/lib/projects/gantt-utils";
import {quoteAllocationLine} from "../src/lib/quotes/financial-rollups";
import {scheduleCalendar} from "../src/lib/projects/schedule-engine";

// Disposable dated proposal stage crossing the Christmas closure (24–25 Dec 2026).
const CLOSURE=["2026-12-24","2026-12-25"];
const alloc={start_date:"2026-12-21",end_date:"2026-12-25",hours_per_day:4,hourly_rate:45,cost_rate_snapshot:30,sale_rate_snapshot:45} as never;
describe("dated proposals: closures move dates, never fee or hours",()=>{
  beforeEach(()=>setWorkingCalendarHolidays(CLOSURE));
  it("Gantt proposal mode equals the summary: 20h and €900",()=>{
    const line=quoteAllocationLine(alloc);
    expect(line.hours).toBe(20);
    expect(line.revenue).toBe(900);
    expect(allocationHours(alloc,NO_HOLIDAYS)).toBe(line.hours);
    expect(allocationCost(alloc,NO_HOLIDAYS)).toBe(line.revenue);
  });
  it("the closure only pushes the end date two working days later",()=>{
    expect(scheduleCalendar([]).shift("2026-12-21",4)).toBe("2026-12-25");
    expect(scheduleCalendar(CLOSURE).shift("2026-12-21",4)).toBe("2026-12-29");
  });
});

import {effortHolidays} from "../src/lib/projects/gantt-utils";
describe("AllocationEditor in a quote uses the same effort as the Financial Summary",()=>{
  beforeEach(()=>setWorkingCalendarHolidays(CLOSURE));
  it("editing to 21–29 Dec at 4h/day: editor = summary (28h, €1260 sale, €840 cost)",()=>{
    const edited={...(alloc as object),end_date:"2026-12-29"} as never;
    const line=quoteAllocationLine(edited);
    const cal=effortHolidays("quote");
    expect(allocationHours(edited,cal)).toBe(line.hours);
    expect(line.hours).toBe(28);
    expect(allocationCost({...(edited as object),hourly_rate:45} as never,cal)).toBe(line.revenue);
    expect(allocationCost({...(edited as object),hourly_rate:30} as never,cal)).toBe(line.cost);
  });
  it("live projects still subtract the closure",()=>{
    expect(allocationHours({start_date:"2026-12-21",end_date:"2026-12-29",hours_per_day:4},effortHolidays("project"))).toBe(20);
  });
});
