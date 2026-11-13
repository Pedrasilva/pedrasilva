import type { CSSProperties } from 'react';
import { useProposal } from '@/lib/psa-proposal/use-psa-proposal';
import { DEFAULT_LETTER_SETTINGS, letterTokenMap, resolveLetterFields, type LetterSettings } from '@/lib/psa-proposal/letter';
import { resolveTokens } from '@/lib/psa-proposal/tokens';
import { resolveMaster, typeLayout } from '@/lib/psa-proposal/master-page';
import type { PsaProposalBlock } from '@/lib/psa-proposal/types';
import type { LiveQuoteSnapshot, ProposalLang } from '@/lib/psa-proposal/live-data';
import './letter.css';
import { letterDateLine, type LetterFields } from '@/lib/psa-proposal/letter-fields';
import { letterParagraphHtml } from '@/lib/psa-proposal/document-rhythm';
export function LetterPage({block,live,lang}:{block:PsaProposalBlock;live?:LiveQuoteSnapshot;lang:ProposalLang}) {
  const query=useProposal(block.proposal_id);const proposal=query.data;
  if(!proposal)return null;
  const savedSettings=(block.content_rich.letterSettings as Partial<LetterSettings>|undefined)??proposal.style_settings.letterSettings;
  const settings={...DEFAULT_LETTER_SETTINGS,...savedSettings,templates:{...DEFAULT_LETTER_SETTINGS.templates,...savedSettings?.templates}};
  const map=letterTokenMap(live,proposal);const master=resolveMaster(proposal.style_settings);const layout=typeLayout(master,'letter');
  const html=String(block.content_rich.html??block.content_rich.text??settings.templates[lang]??DEFAULT_LETTER_SETTINGS.templates[lang]);
  const fields=resolveLetterFields(block.content_rich.letterFields as Partial<LetterFields>|undefined,settings,live,proposal);
  const body=letterParagraphHtml(resolveTokens(html,map).output,!block.content_rich.html&&!!block.content_rich.text);
  const recipients=[fields.recipientCompany,fields.recipientContact,fields.recipientAddress,[fields.recipientPostalCode,fields.recipientCity].filter(Boolean).join(' ')].filter(value=>value?.trim());
  return <section className="psa-letter-page psa-business-letter" data-letter-version="3" data-live-ready={query.isFetching?'false':'true'} style={{'--letter-signature-width':`${layout.signatureWidth}mm`} as CSSProperties}>
    {fields.date&&<p className="psa-letter-date">{letterDateLine(fields,lang)}</p>}
    {recipients.length>0&&<div className="psa-letter-recipient">{recipients.map((line,index)=><div key={index}>{line}</div>)}</div>}
    {fields.subject&&<p className="psa-letter-subject"><strong>{/^(assunto|subject)\s*:/i.test(fields.subject)?fields.subject:`${lang==='en'?'Subject':'Assunto'}: ${fields.subject}`}</strong></p>}
    {fields.salutation&&<p className="psa-letter-salutation">{fields.salutation}</p>}
    <div className="psa-rich psa-letter-body" dangerouslySetInnerHTML={{__html:body}}/>
    <div className="psa-letter-signoff proposal-avoid-break">
      {fields.closing&&<p>{fields.closing}</p>}
      {fields.signatureData&&<img src={fields.signatureData} alt={fields.signatoryName??''}/>}
      {(fields.signatoryName||fields.signatoryRole)&&<p>{[fields.signatoryName,fields.signatoryRole].filter(Boolean).join(', ')}</p>}
    </div>
  </section>;
}