import type { LiveQuoteSnapshot, ProposalLang } from './live-data';
import type { MasterPage } from './master-page';

export const LETTER_SIGNATORY = 'Luís Pedra Silva';
export function letterSignoff(lang: ProposalLang): string { return lang === 'en' ? 'Yours sincerely,' : 'Com os melhores cumprimentos,'; }
export type LetterFields = {
  recipientCompany: string; recipientContact: string; recipientAddress: string;
  recipientPostalCode: string; recipientCity: string; sender: string;
  place: string; date: string; subject: string; salutation: string; signatoryRole: string;
  closing?: string; signatoryName?: string; signatureData?: string;
};
export type LetterSources = {
  company?: { nome?: string | null; morada?: string | null; postal_code?: string | null; city?: string | null } | null;
  contact?: { primeiro_nome?: string | null; apelido?: string | null; titulo?: string | null; posicao?: string | null } | null;
};

/** Document-language defaults, independent of the application's locale. */
export function letterSalutation(contact: LetterSources['contact'], lang: ProposalLang): string {
  if (!contact) return lang === 'en' ? 'Dear Sirs,' : 'Exmos. Senhores,';
  const surname = contact.apelido?.trim();
  const title = contact.titulo?.trim().toLowerCase().replace(/\./g, '');
  const male = ['mr', 'senhor', 'sr', 'exmo', 'dr', 'arq'].includes(title ?? '');
  const female = ['ms', 'mrs', 'senhora', 'sra', 'exma', 'dra', 'arqa'].includes(title ?? '');
  if (!surname || (!male && !female)) return lang === 'en' ? 'Dear [title and surname],' : 'Exmo./Exma. [tratamento e apelido],';
  return lang === 'en' ? `Dear ${female ? 'Ms' : 'Mr'} ${surname},` : `${female ? 'Exma. Senhora' : 'Exmo. Senhor'} ${surname},`;
}

export function letterFieldDefaults(sources: LetterSources, live: LiveQuoteSnapshot | undefined, master: MasterPage, lang: ProposalLang, editorialDate: string): LetterFields {
  const c = sources.contact;
  return {
    recipientCompany: sources.company?.nome ?? live?.client ?? '',
    recipientContact: c ? [c.titulo, c.primeiro_nome, c.apelido, c.posicao].filter(Boolean).join(' ') : '',
    recipientAddress: sources.company?.morada ?? '', recipientPostalCode: sources.company?.postal_code ?? '', recipientCity: sources.company?.city ?? '',
    sender: ['Pedra Silva Arquitectos', master.footer.address].filter(Boolean).join('\n'),
    place: 'Lisboa', date: editorialDate,
    subject: `${lang === 'en' ? 'Subject: Fee Proposal' : 'Assunto: Proposta de Honorários'} – ${live?.projectName ?? '[projeto]'}, ${live?.projectNumber ?? '[número]'}`,
    salutation: letterSalutation(c, lang), signatoryRole: lang === 'en' ? 'Architect | Managing Partner' : 'Arquiteto | Sócio-gerente',
  };
}

export function letterDateLine(fields: Pick<LetterFields, 'date' | 'place'>, lang: ProposalLang): string {
  const date = new Date(`${fields.date}T12:00:00Z`);
  const formatted = Number.isNaN(date.getTime()) ? fields.date : new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(date);
  return [fields.place, formatted].filter(Boolean).join(', ');
}

/** Count actual deliverable rows, never both a group and its children. */
export function letterProgramme(stages: LiveQuoteSnapshot['stages']): { count: number; weeks: number | null } {
  const rows = stages.filter(s => s.isSelf && !s.isOptional && !s.isMilestone && !stages.some(child => child.parentStageId === s.id));
  const dates = rows.map(s => ({ start: Date.parse(s.startDate ?? ''), end: Date.parse(s.endDate ?? '') }));
  const complete = dates.length > 0 && dates.every(d => Number.isFinite(d.start) && Number.isFinite(d.end));
  return { count: rows.length, weeks: complete ? Math.ceil((Math.max(...dates.map(d => d.end)) - Math.min(...dates.map(d => d.start)) + 86400000) / 604800000) : null };
}

export function letterBodyUnchanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}