import {describe,it,expect,beforeEach} from "vitest";
import {workingDays,allocationHours,allocationCost,setWorkingCalendarHolidays,NO_HOLIDAYS} from "../src/lib/projects/gantt-utils";
import {scheduleCalendar} from "../src/lib/projects/schedule-engine";
const HOL=["2026-12-01","2026-12-08","2026-12-25","2027-01-01"];
describe("Gantt days/hours use the shared working-day calendar",()=>{
  beforeEach(()=>setWorkingCalendarHolidays(HOL));
  it("P2208 Concept Design 25/11/2026–05/01/2027 = 26 working days",()=>{
    expect(workingDays("2026-11-25","2027-01-05")).toBe(26);
    expect(scheduleCalendar(HOL).duration("2026-11-25","2027-01-05")).toBe(26);
  });
  it("hours are 462.8h at 17.8 h/day",()=>expect(allocationHours({start_date:"2026-11-25",end_date:"2027-01-05",hours_per_day:17.8})).toBeCloseTo(462.8,6));
  it("costs follow the same days",()=>expect(allocationCost({start_date:"2026-11-25",end_date:"2027-01-05",hours_per_day:1,hourly_rate:10})).toBe(260));
  it("CRM/quote estimates still ignore holidays",()=>expect(workingDays("2026-11-25","2027-01-05",NO_HOLIDAYS)).toBe(30));
});
