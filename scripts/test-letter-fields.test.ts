import { describe, expect, it } from 'vitest';
import { letterDateLine, letterSalutation, letterProgramme, letterFieldDefaults, LETTER_SIGNATORY, letterBodyUnchanged } from '../src/lib/psa-proposal/letter-fields';
import type { LiveQuoteSnapshot } from '../src/lib/psa-proposal/live-data';
import { resolveMaster } from '../src/lib/psa-proposal/master-page';

describe('business letter rules', () => {
  it('Luis always signs', () => expect(LETTER_SIGNATORY).toBe('Luís Pedra Silva'));
  it('does not infer a treatment from a name', () => expect(letterSalutation({ primeiro_nome: 'Ana', apelido: 'Silva' }, 'pt-PT')).toContain('[tratamento e apelido]'));
  it('uses an explicit female treatment in PT', () => expect(letterSalutation({ titulo: 'Sra.', apelido: 'Silva' }, 'pt-PT')).toBe('Exma. Senhora Silva,'));
  it('uses an explicit male treatment in EN', () => expect(letterSalutation({ titulo: 'Mr.', apelido: 'Smith' }, 'en')).toBe('Dear Mr Smith,'));
  it('uses the generic salutation without a linked contact', () => { expect(letterSalutation(null, 'pt-PT')).toBe('Exmos. Senhores,'); expect(letterSalutation(null, 'en')).toBe('Dear Sirs,'); });
  it('does not invent a missing postcode or contact', () => { const f = letterFieldDefaults({ company: { nome: 'GREATLUCK', city: 'S.D.Rana' } }, undefined, resolveMaster(), 'pt-PT', '2026-11-12'); expect(f.recipientPostalCode).toBe(''); expect(f.recipientContact).toBe(''); expect(f.recipientCity).toBe('S.D.Rana'); });
  it('formats the editorial date independently from planning', () => expect(letterDateLine({ place: 'Lisboa', date: '2026-11-12' }, 'pt-PT')).toBe('Lisboa, 12 de novembro de 2026'));
  it('includes the retainer and excludes group duplication and overlapping durations', () => {
    const rows = [{ id: 'root', parentStageId: null, startDate: '2000-01-03', endDate: '2000-10-24' }, { id: 'design', parentStageId: 'root', startDate: '2000-01-03', endDate: '2000-08-15' }, { id: 'retainer', parentStageId: 'root', startDate: '2000-09-01', endDate: '2001-08-31' }].map(r => ({ ...r, isSelf: true, isOptional: false, isMilestone: false })) as LiveQuoteSnapshot['stages'];
    expect(letterProgramme(rows)).toEqual({ count: 2, weeks: 87 });
  });
  it('suppresses unknown durations', () => expect(letterProgramme([{ id: 'x', isSelf: true } as LiveQuoteSnapshot['stages'][number]]).weeks).toBeNull());
  it('detects manual edits made during generation', () => expect(letterBodyUnchanged({ html: 'before' }, { html: 'after' })).toBe(false));
});