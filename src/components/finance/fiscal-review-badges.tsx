import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import type { FinDoc } from '@/lib/finance/use-documents';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/hooks/use-permissions-v2';
import { useHasPermission } from '@/hooks/use-permissions';
import { toast } from 'sonner';

export function FiscalReviewBadges({ document }: { document: FinDoc }) {
  const { t } = useTranslation('finance');
  const edit=useCan('finance.documents.edit','all');
  const legacy=useHasPermission('finance.dashboard');
  const qc=useQueryClient();
  if (document.direction !== 'issued') return null;
  return <div className="flex flex-wrap gap-1 mt-1">
    {(!document.fiscal_series || !document.fiscal_number) && <Badge variant="outline">{t('provisional.identityIncomplete')}</Badge>}
    {document.doc_type === 'receipt' && !document.fiscal_type && <Badge variant="outline">{t('provisional.receiptFiscalPending')}</Badge>}
    {document.fiscal_review_reasons.map(reason => <Badge key={reason} variant="secondary">{t(`provisional.${reason === 'cttReview' ? 'cttReview' : 'numberReview'}`)}</Badge>)}
    {!document.original_document_id && document.receipt_invoice_candidates.map(id => <span key={id}><Link to="/finance/documents/$documentId" params={{documentId:id}} onClick={e=>e.stopPropagation()} className="text-xs text-primary underline">{t('provisional.receiptSuggestion')}</Link>{(edit.allowed||legacy.allowed) && <Button size="sm" variant="ghost" onClick={async e=>{e.stopPropagation();if(!window.confirm(t('provisional.confirmReceiptLink')))return;const r=await supabase.rpc('fin_confirm_receipt_invoice_link',{_id:document.id,_invoice_id:id});if(r.error)toast.error(t('provisional.assignmentFailed'));else void qc.invalidateQueries({queryKey:['fin-docs']});}}>{t('provisional.confirmReceiptAssociation')}</Button>}</span>)}
  </div>;
}