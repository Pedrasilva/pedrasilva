import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ProjectExpenseLists } from '@/components/finance/project-expense-lists';

export const Route = createFileRoute('/_app/finance/project-expenses')({
  head: () => ({ meta: [
    { title: 'Project expenses and reimbursements | PSA Hub' },
    { name: 'description', content: 'Project expense approval, client invoicing and team reimbursements in PSA Hub.' },
    { property: 'og:title', content: 'Project expenses and reimbursements | PSA Hub' },
    { property: 'og:description', content: 'Project expense approval, client invoicing and team reimbursements in PSA Hub.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: ExpensesPage,
});
function ExpensesPage() {
  const { t } = useTranslation('finance');
  return <div className="space-y-6 p-4 sm:p-6"><Tabs defaultValue="clients"><TabsList className="flex h-auto flex-wrap"><TabsTrigger value="clients">{t('expenseFlow.clients')}</TabsTrigger><TabsTrigger value="team">{t('expenseFlow.team')}</TabsTrigger></TabsList><TabsContent value="clients"><ProjectExpenseLists mode="clients" /></TabsContent><TabsContent value="team"><ProjectExpenseLists mode="team" /></TabsContent></Tabs></div>;
}