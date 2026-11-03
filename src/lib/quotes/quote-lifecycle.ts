export type QuoteLifecycleState = 'draft' | 'sent' | 'approved' | 'signed' | 'converted' | 'lost';
export interface QuoteLifecycle {
 state: QuoteLifecycleState; quoteId: string; projectId: string | null; proposalId: string | null;
 latestSentSnapshotId: string | null; latestSentRevision: number | null; acceptedSnapshotId: string | null;
 acceptanceDate: string | null; missing: Array<'client' | 'revision' | 'gantt'>;
}
export function canConvertQuote(state: QuoteLifecycleState) { return state === 'approved' || state === 'signed'; }
export function nextQuoteAction(state: QuoteLifecycleState) {
 return ({draft:'send',sent:'accept',approved:'signature',signed:'convert',converted:'open',lost:null} as const)[state];
}
