import {useTranslation} from 'react-i18next';
export function PlanningReplacementWarning({sections}:{sections:string[]}) {
 const {t}=useTranslation('crm');
 return <div className="border-l-2 border-destructive pl-3 text-sm" role="alert"><p>{sections.length?t('quoteTemplate.overwrite',{sections:sections.join(', ')}):t('quoteTemplate.blankConfirmation')}</p><p className="mt-2">{t('quoteTemplate.undoHint')}</p></div>;
}
