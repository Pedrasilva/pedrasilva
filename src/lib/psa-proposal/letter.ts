import type { LiveQuoteSnapshot, ProposalLang } from './live-data';
import { formatCurrencyEUR, formatDatePT } from './live-data';
import type { PsaProposal } from './types';
import { letterProgramme, letterSignoff, type LetterFields } from './letter-fields';
import signatureAsset from '@/assets/luis-pedra-silva-signature.jpg.asset.json';
export interface LetterSettings { templates: Record<string,string>; signatoryName: string; signatureData?: string | null }
export const DEFAULT_LETTER_SETTINGS: LetterSettings = {
  signatoryName: 'Luís Pedra Silva', signatureData: signatureAsset.url, templates: {
    'pt-PT': '<p>Agradecemos a oportunidade de apresentar a nossa proposta para {{project_name}}.</p><p>O âmbito proposto compreende {{stage_count}} fases, com honorários de {{total_fee}} e uma duração estimada de {{estimated_duration}}.</p><p>Estamos disponíveis para esclarecer qualquer questão e desenvolver este projeto em colaboração convosco.</p>',
    en: '<p>Thank you for the opportunity to present our proposal for {{project_name}}.</p><p>The proposed scope comprises {{stage_count}} stages, with a fee of {{total_fee}} and an estimated duration of {{estimated_duration}}.</p><p>We look forward to discussing the proposal and developing this project together.</p>',
  },
};
export const LETTER_TOKENS = ['client_name','contact_salutation','project_name','total_fee','stage_count','estimated_duration','proposal_number','proposal_date'] as const;
/** Resolve editable legacy defaults without saving or replacing deliberately empty fields. */
export function resolveLetterFields(saved: Partial<LetterFields> | undefined, settings: LetterSettings, live: LiveQuoteSnapshot | undefined, proposal: Pick<PsaProposal,'client_snapshot'|'title'|'language'|'created_at'>): LetterFields {
  const map = letterTokenMap(live, proposal);
  const client = proposal.client_snapshot ?? {};
  const lang = proposal.language === 'en' ? 'en' : 'pt-PT';
  return {
    recipientCompany: map.client_name === '—' ? '' : map.client_name,
    recipientContact: String(client.contact_name ?? ''),
    recipientAddress: String(client.address ?? client.morada ?? ''),
    recipientPostalCode: String(client.postal_code ?? ''), recipientCity: String(client.city ?? ''),
    sender: '', place: '', date: (live?.date ?? proposal.created_at).slice(0, 10),
    subject: '', salutation: map.contact_salutation === '—' ? (lang === 'en' ? 'Dear Sirs,' : 'Exmos. Senhores,') : map.contact_salutation,
    closing: letterSignoff(lang), signatoryName: settings.signatoryName,
    signatoryRole: lang === 'en' ? 'Architect — Pedra Silva Arquitectos' : 'Arquitecto — Pedra Silva Arquitectos',
    signatureData: settings.signatureData ?? '',
    ...saved,
  };
}
export function letterTokenMap(live: LiveQuoteSnapshot | undefined, proposal: Pick<PsaProposal,'client_snapshot'|'title'|'language'|'created_at'>): Record<string,string> {
  const lang: ProposalLang = proposal.language === 'en' ? 'en' : 'pt-PT';
  const programme = letterProgramme(live?.stages ?? []);
  const weeks = programme.weeks;
  const client = proposal.client_snapshot ?? {};
  return {
    client_name: live?.client ?? String(client.name ?? client.nome ?? '—'),
    contact_salutation: String(client.salutation ?? client.contact_salutation ?? '—'),
    project_name: live?.projectName ?? proposal.title,
    total_fee: live ? formatCurrencyEUR(live.totalArchitectureFee,lang) : '—',
    stage_count: live ? String(programme.count) : '—',
    estimated_duration: weeks == null ? '—' : `${weeks} ${lang==='en'?'weeks':'semanas'}`,
    proposal_number: live?.projectNumber ?? '—',
    proposal_date: formatDatePT(live?.date ?? proposal.created_at,lang),
  };
}
export function contentPageNumbers(types: readonly string[]): Array<number|null> {
  let n=0; return types.map(type => type==='cover'||type==='letter'?null:++n);
}