import { beforeEach, describe, expect, it, vi } from 'vitest';
const download = vi.hoisted(() => vi.fn());
vi.mock('../src/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ download }) } },
}));
import { downloadProjectAttachment } from '../src/lib/finance/project-attachment';

describe('project attachment caller-scoped download', () => {
  beforeEach(() => { download.mockReset(); });
  it('keeps a Storage denial denied without a privileged fallback', async () => {
    download.mockResolvedValue({ data: null, error: new Error('Object not found') });
    await expect(downloadProjectAttachment('fixture/invoice.pdf')).rejects.toThrow('Object not found');
    expect(download).toHaveBeenCalledExactlyOnceWith('fixture/invoice.pdf');
  });
  it('does not generate a download for missing bytes', async () => {
    download.mockResolvedValue({ data: null, error: null });
    await expect(downloadProjectAttachment('fixture/receipt.pdf')).rejects.toThrow('Attachment unavailable');
  });
});