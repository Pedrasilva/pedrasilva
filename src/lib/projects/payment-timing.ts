export type IncomingTimingRow = {
  id: string; project_id: string; label: string; amount_value: number; vat_rate: number;
  stage_id: string | null; stage_name: string | null; trigger_type: string;
  billing_status: string; planned_invoice_date: string | null; planned_payment_date: string | null;
  contract_invoice_date: string | null; contract_payment_date: string | null;
  slippage_working_days: number | null; slippage_calendar_days: number | null;
  planned_invoice_date_override: string | null; planned_payment_date_override: string | null;
  resolved_month_index: number | null; frozen: boolean; problems: string[];
  workflow?: {confirmed_at:string|null;confirmed_by:string|null;note:string|null;confirmation_current:boolean;invoice_number:string|null;issue_date:string|null};
};
export type IncomingTiming = { rows: IncomingTimingRow[]; can_edit_dates: boolean; stages: {id:string;name:string}[] };
export function displayPaymentDate(value: string | null, locale: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day || year < 2010) return null;
  return new Intl.DateTimeFormat(locale, {day:'2-digit',month:'short',year:'numeric'}).format(new Date(year,month-1,day));
}