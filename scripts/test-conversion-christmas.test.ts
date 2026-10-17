import {describe,it,expect} from "vitest";
import {scheduleCalendar} from "../src/lib/projects/schedule-engine";
import {allocationHours,NO_HOLIDAYS} from "../src/lib/projects/gantt-utils";

// Christmas closure 24–25 Dec 2026: a 5-working-day stage keeps its effort and fee; only the end date moves.
const LIVE=["2026-12-24","2026-12-25"];
describe("conversion across the Christmas closure",()=>{
  it("baseline ends 25 Dec, live ends 29 Dec",()=>{
    expect(scheduleCalendar([]).shift("2026-12-21",4)).toBe("2026-12-25");
    expect(scheduleCalendar(LIVE).shift("2026-12-21",4)).toBe("2026-12-29");
  });
  it("keeps 5 working days, 20h and €600",()=>{
    const live=scheduleCalendar(LIVE);
    expect(live.duration("2026-12-21","2026-12-29")).toBe(5);
    const hours=allocationHours({start_date:"2026-12-21",end_date:"2026-12-29",hours_per_day:4},new Set(LIVE));
    expect(hours).toBe(20);
    expect(hours*30).toBe(600);
    expect(allocationHours({start_date:"2026-12-21",end_date:"2026-12-25",hours_per_day:4},NO_HOLIDAYS)*30).toBe(600);
  });
});
