import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AdminOnly } from '@/components/AdminOnly';
import { PracticeMasterPage } from '@/components/psa-composer/master-page-editor';
import { PracticeLetterSettings } from '@/components/psa-composer/letter-settings';

export const Route = createFileRoute('/_app/admin/proposal-master')({
  head: () => ({ meta: [{ title: 'Página-mestre das propostas | PSA Hub' }, { name: 'description', content: 'Modelo A4 do atelier para propostas PSA.' }, { property: 'og:title', content: 'Página-mestre das propostas | PSA Hub' }, { property: 'og:description', content: 'Modelo A4 do atelier para propostas PSA.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: Page,
});
function Page() {
  const { t } = useTranslation('common');
  return <AdminOnly><div className="p-6"><h1 className="mb-4 text-xl font-semibold">{t('masterPage.title')}</h1><PracticeMasterPage /><PracticeLetterSettings /></div></AdminOnly>;
}