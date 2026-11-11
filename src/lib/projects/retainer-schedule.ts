import {addDays,addMonths,differenceInCalendarDays,format,parseISO} from 'date-fns';
import {scheduleCalendar} from './schedule-engine';
export function retainerMonths(start:string,end:string){return Math.max(1,Math.round((differenceInCalendarDays(parseISO(end),parseISO(start))+1)/30.4375));}
export function retainerEnd(start:string,months:number){return format(addDays(addMonths(parseISO(start),months),-1),'yyyy-MM-dd');}
export function retainerPaymentDates(start:string,months:number,holidays:Iterable<string>=[]){const cal=scheduleCalendar(holidays);return Array.from({length:months},(_,i)=>cal.snap(format(addMonths(parseISO(start),i),'yyyy-MM-dd')));}