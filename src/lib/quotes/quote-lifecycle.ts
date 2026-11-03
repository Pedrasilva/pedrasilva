export type QuoteLifecycleState = 'draft' | 'sent' | 'approved' | 'signed' | 'converted' | 'lost';
export interface QuoteLifecycle {
 state: QuoteLifecycleState; quoteId: string; projectId: string | null; proposalId: string | null;
 latestSentSnapshotId: string | null; latestSentRevision: number | null; acceptedSnapshotId: string | null;
 acceptanceDate: string | null; missing: Array<'client' | 'revision' | 'gantt'>;
 latestSentMatchesCurrent?: boolean; currentRevision?: number;
}
export function canConvertQuote(state: QuoteLifecycleState) { return state === 'approved' || state === 'signed'; }
export function nextQuoteAction(state: QuoteLifecycleState) {
 return ({draft:'send',sent:'accept',approved:'convert',signed:'convert',converted:'open',lost:null} as const)[state];
}
export function needsRevisionSend(lifecycle: Pick<QuoteLifecycle, 'state' | 'latestSentSnapshotId' | 'latestSentMatchesCurrent'>) {
 return lifecycle.state === 'sent' && !!lifecycle.latestSentSnapshotId && lifecycle.latestSentMatchesCurrent === false;
}
export function constructionMonthRange(months: number) { return {start: 1, end: Math.max(1, Math.trunc(months))}; }
