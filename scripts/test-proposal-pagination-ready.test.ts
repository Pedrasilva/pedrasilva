import { describe, expect, it } from 'vitest';
import { proposalPaginationReady } from '../src/lib/psa-proposal/pagination-ready';
import { REPAGINATION_DELAY_MS } from '../src/lib/psa-proposal/page-layout';
const ready = { data: {}, isFetching: false, isError: false };
describe('proposal pagination readiness', () => {
  it('waits for absent live quote data instead of paginating placeholders', () => {
    expect(proposalPaginationReady(ready,ready,{...ready,data:undefined},true)).toBe(false);
  });
  it('waits for refreshed live data even when stale data exists', () => {
    expect(proposalPaginationReady(ready,ready,{...ready,isFetching:true},true)).toBe(false);
  });
  it('requires proposal and blocks as well as live data', () => {
    expect(proposalPaginationReady({...ready,isFetching:true},ready,ready,true)).toBe(false);
    expect(proposalPaginationReady(ready,{...ready,data:undefined},ready,true)).toBe(false);
  });
  it('allows fully loaded live data and independent documents', () => {
    expect(proposalPaginationReady(ready,{...ready,data:[]},ready,true)).toBe(true);
    expect(proposalPaginationReady(ready,ready,{...ready,data:undefined},false)).toBe(true);
  });
  it('rejects failures and debounces for 300 ms', () => {
    expect(proposalPaginationReady(ready,ready,{...ready,isError:true},true)).toBe(false);
    expect(REPAGINATION_DELAY_MS).toBe(300);
  });
});