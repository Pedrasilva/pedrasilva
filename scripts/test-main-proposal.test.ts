import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from, replies } = vi.hoisted(() => ({ from: vi.fn(), replies: [] as unknown[] }));
vi.mock('../src/integrations/supabase/client', () => ({ supabase: { from } }));
import { mainProposalOptions } from '../src/lib/psa-proposal/use-main-proposal';

beforeEach(() => {
  replies.length = 0;
  from.mockReset();
  from.mockImplementation(() => {
    const value = replies.shift();
    const chain = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), limit: vi.fn() };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
    chain.single.mockResolvedValue(value); chain.limit.mockResolvedValue(value);
    return chain;
  });
});
describe('persistent main document', () => {
  it('Oleiro resolves only the explicit original, not a recently updated fixture', async () => {
    const id = '84e54031-64db-41d8-aa30-b22d882a6017';
    replies.push({ data: { main_proposal_id: id } }, { data: { id, quote_id: 'd73deb33-a0f9-41bb-ad4d-637cd5d159b6' } });
    expect((await mainProposalOptions('d73deb33-a0f9-41bb-ad4d-637cd5d159b6').queryFn())?.id).toBe(id);
    const chain = from.mock.results[1].value;
    expect(chain.eq).toHaveBeenCalledWith('id', id);
    expect(chain.eq).toHaveBeenCalledWith('quote_id', 'd73deb33-a0f9-41bb-ad4d-637cd5d159b6');
  });
  it('ambiguous legacy documents never trigger creation', async () => {
    replies.push({ data: { main_proposal_id: null } }, { data: [{ id: 'unassigned' }] });
    await expect(mainProposalOptions('copy').queryFn()).rejects.toThrow('Main proposal document not assigned');
  });
  it('empty new quotes can create their first document', async () => {
    replies.push({ data: { main_proposal_id: null } }, { data: [] });
    expect(await mainProposalOptions('copy').queryFn()).toBeNull();
  });
  it('a missing or inaccessible pointer never falls back to another document', async () => {
    replies.push({ data: { main_proposal_id: 'missing' } }, { error: new Error('not found') });
    await expect(mainProposalOptions('copy').queryFn()).rejects.toThrow('not found');
    expect(from).toHaveBeenCalledTimes(2);
  });
  it('mounted selection refreshes and uses no legacy cache key', () => {
    const options = mainProposalOptions('copy');
    expect(options.queryKey).toEqual(['quote-main-proposal', 'copy']);
    expect(options.refetchInterval).toBe(5000);
    expect(options.refetchOnMount).toBe('always');
  });
});