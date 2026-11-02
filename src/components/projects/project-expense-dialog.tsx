import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ProjectExpense } from '@/lib/projects/use-project-expenses';
import { Button } from '@/components/ui/button';

type Props = { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; initial?: ProjectExpense | null; privileged?: boolean; onRequestApproval?: () => void };
/** Historical expenses remain readable; no legacy creation, receipt replacement or OCR. */
export function ProjectExpenseDialog({ open, onOpenChange, initial }: Props) {
  const { t, i18n } = useTranslation(['projects', 'common']);
  if (!initial) return null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{initial.description}</DialogTitle></DialogHeader>
    <dl className="grid grid-cols-2 gap-3 text-sm"><dt>{t('projects:expenses.fields.vendor')}</dt><dd>{initial.vendor ?? '—'}</dd><dt>{t('projects:expenses.cols.amount')}</dt><dd>{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR' }).format(Number(initial.purchase_price ?? 0))}</dd><dt>{t('projects:expenses.cols.status')}</dt><dd>{t(`projects:expenses.status.${initial.status}`)}</dd></dl>
    <p className="whitespace-pre-wrap text-sm">{initial.notes}</p><Button variant="outline" onClick={() => onOpenChange(false)}>{t('common:close')}</Button>
  </DialogContent></Dialog>;
}
