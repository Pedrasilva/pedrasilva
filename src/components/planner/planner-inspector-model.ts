import type { QuoteStage, QuoteStageDependency } from '@/lib/quotes/types';
import type { QuoteAllocationWithResource } from '@/lib/quotes/use-quote-allocations';
import type { Resource } from '@/lib/projects/types';
export interface InspectorMutation {
  mutate: (input: any, options?: {onSuccess?: (value?: any)=>void; onError?: (error: unknown)=>void})=>void;
  mutateAsync: (input: any)=>Promise<any>;
  isPending: boolean;
}
export interface PlannerInspectorModel {
  stages: QuoteStage[];
  dependencies: QuoteStageDependency[];
  allocations: QuoteAllocationWithResource[];
  resources: Resource[];
  upsertStage: InspectorMutation;
  deleteStage: InspectorMutation;
  createDependency: InspectorMutation;
  updateDependency: InspectorMutation;
  deleteDependency: InspectorMutation;
  cascadeStage: InspectorMutation;
  upsertAllocation: InspectorMutation;
  deleteAllocation: InspectorMutation;
  quoteMargin: {enabled?:boolean;percent?:number} | null | any;
  defaultRates: any;
  readOnly: boolean;
  financialVisible: boolean;
  operational: boolean;
  contractReferencePending?: boolean;
}
