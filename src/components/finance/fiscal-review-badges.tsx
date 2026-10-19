import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import type { FinDoc } from '@/lib/finance/use-documents';

export function FiscalReviewBadges({ document }: { document: FinDoc }) {
  const { t } = useTranslation('finance');
  if (document.direction !== 'issued') return null;
  return <div className="flex flex-wrap gap-1 mt-1">
    {(!document.fiscal_series || !document.fiscal_number) && <Badge variant="outline">{t('provisional.identityIncomplete')}</Badge>}
    {document.doc_type === 'receipt' && !document.fiscal_type && <Badge variant="outline">{t('provisional.receiptFiscalPending')}</Badge>}
    {document.fiscal_review_reasons.map(reason => <Badge key={reason} variant="secondary">{t(`provisional.${reason === 'cttReview' ? 'cttReview' : 'numberReview'}`)}</Badge>)}
    {document.receipt_invoice_candidates.map(id => <Link key={id} to="/finance/documents/$documentId" params={{documentId:id}} onClick={e=>e.stopPropagation()} className="text-xs text-primary underline">{t('provisional.receiptSuggestion')}</Link>)}
  </div>;
}