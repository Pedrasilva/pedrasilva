export type CalculatorConflictRow = {id:string;name:string;sort_order:number};
export type CalculatorPreview = {revision:string;existing:CalculatorConflictRow[];manual:CalculatorConflictRow[];removed:CalculatorConflictRow[];paymentDefaults:{stage_start_percent:number;stage_end_percent:number}|null};
export function calculatorHasConflicts(p:CalculatorPreview):boolean {return p.existing.length+p.manual.length+p.removed.length>0;}
