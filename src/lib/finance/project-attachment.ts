import { supabase } from '@/integrations/supabase/client';

/** Both download and signing run as the caller; Storage RLS is authoritative. */
export async function downloadProjectAttachment(path: string) {
  const { data, error } = await supabase.storage.from('financial-documents').download(path);
  if (error || !data) throw error ?? new Error('Attachment unavailable');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = path.split('/').pop() ?? 'attachment';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}