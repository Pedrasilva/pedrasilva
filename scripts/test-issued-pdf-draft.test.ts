import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => options,
  useQuery: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
import { useIssuedRegistration } from '../src/lib/finance/use-provisional-invoicing';
import { useFinDocument } from '../src/lib/finance/use-documents';

type Mutation = { mutationFn: (input: Record<string, unknown>) => Promise<unknown> };
type Query = { queryFn: () => Promise<{ issuedPdfQueueId?: string; document: Record<string, unknown>; lines: unknown[] } | null> };
const header = { registration_origin: 'upload', status: 'draft', file_path: 'intake/copy.pdf', counterparty_client_id: 'client-copy', issue_date: '2026-10-22', due_date: '2026-11-01' };
const lines = [{ description: 'Copied extraction', quantity: 2, unit_price_ex_vat: 50, vat_rate: 23 }];

describe('issued PDF draft persistence', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: 'document-copy', error: null }); });
  it('saves extraction fields with queue identity separate from document columns', async () => {
    await (useIssuedRegistration() as unknown as Mutation).mutationFn({ header, lines, draftQueueId: 'queue-copy' });
    expect(mocks.rpc).toHaveBeenCalledWith('fin_save_issued_pdf_draft', { _queue_id: 'queue-copy', _header: header, _lines: lines, _document_id: undefined });
    expect(mocks.rpc.mock.calls[0][1]._header).not.toHaveProperty('queue_item_id');
    expect(mocks.rpc.mock.calls[0][1]._header.due_date).toBe('2026-11-01');
  });
  it('finishes the same reopened draft rather than inserting a second invoice', async () => {
    await (useIssuedRegistration(true) as unknown as Mutation).mutationFn({ header: { ...header, status: 'issued' }, lines, existingId: 'document-copy', draftQueueId: 'queue-copy' });
    expect(mocks.rpc).toHaveBeenCalledWith('fin_save_issued_pdf_draft', expect.objectContaining({ _document_id: 'document-copy', _queue_id: 'queue-copy', _header: expect.objectContaining({ status: 'issued' }) }));
  });
  for (const entity of ['PSA-copy', 'Pedra-Rioja-copy']) it(`reopens with preserved extraction and entity-scoped queue link: ${entity}`, async () => {
    const filters: unknown[][] = [];
    mocks.from.mockImplementation((table: string) => {
      const value = table === 'financial_documents' ? { ...header, entity_id: entity } : table === 'financial_document_review_queue' ? { id: 'queue-copy' } : table === 'financial_document_lines' ? lines : [];
      const builder = {
        select: vi.fn().mockReturnThis(), eq: vi.fn((...args: unknown[]) => { if (table === 'financial_document_review_queue') filters.push(args); return builder; }),
        order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: value, error: null }), maybeSingle: vi.fn().mockResolvedValue({ data: value, error: null }),
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: value, error: null }).then(resolve),
      };
      return builder;
    });
    const full = await (useFinDocument('document-copy') as unknown as Query).queryFn();
    expect(full?.issuedPdfQueueId).toBe('queue-copy');
    expect(full?.document.file_path).toBe('intake/copy.pdf');
    expect(full?.document.entity_id).toBe(entity);
    expect(full?.lines).toEqual(lines);
    expect(filters).toContainEqual(['created_expense_id', 'document-copy']);
    expect(filters).toContainEqual(['entity_id', entity]);
    expect(filters).toContainEqual(['status', 'pending_review']);
  });
});