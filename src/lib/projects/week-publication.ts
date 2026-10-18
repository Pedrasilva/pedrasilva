import type { BoardStage, ExtensionNote } from './week-board';
export type AllocationPreviewRow = { id?:string; resource_id:string; stage_id:string; start_date:string; end_date:string; day_part:string | null; hours_per_day:number; is_site_visit:boolean; status?:string; source?:string | null; external_id?:string | null; source_quote_allocation_id?:string | null; allocation_percentage?:number | null };
export type WeekPreview = {plan_id:string; token:string; week_start:string; past_week:boolean; operations:{action:'create'|'change'|'split'|'remove'; id?:string; resource_id:string; before?:AllocationPreviewRow; after?:AllocationPreviewRow}[]; skipped:AllocationPreviewRow[]; overlaps:AllocationPreviewRow[]; extensions:(ExtensionNote & {start_date:string; end_date:string;old_start:string;old_end:string;baseline_locked:boolean})[]; offending_cells:{code:string;resource_id?:string;day?:string;part?:string;stage_id?:string;project_id?:string}[]; unchanged:number;resources:{id:string;name:string}[];projects:{id:string;name:string}[];stages:Pick<BoardStage,'id'|'project_id'|'name'|'parent_stage_id'|'sort_order'>[]};
export function affectedBookings(preview: Pick<WeekPreview, 'operations'>) {
 return preview.operations.filter(o => !!o.before && ['remove','change','split'].includes(o.action));
}
export function canConfirmPublication(preview:WeekPreview | null, overlap:boolean, baseline:boolean, replace:boolean, changes=false):boolean {
 return !!preview && replace && !preview.offending_cells.length && (!preview.overlaps.length || overlap) && (!preview.extensions.some(e=>e.baseline_locked) || baseline) && (!affectedBookings(preview).length || changes);
}
