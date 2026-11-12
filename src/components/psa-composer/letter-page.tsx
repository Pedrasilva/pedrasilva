import { useProposal } from '@/lib/psa-proposal/use-psa-proposal';
import { DEFAULT_LETTER_SETTINGS, letterTokenMap, type LetterSettings } from '@/lib/psa-proposal/letter';
import { resolveTokens } from '@/lib/psa-proposal/tokens';
import { resolveMaster, typeLayout } from '@/lib/psa-proposal/master-page';
import type { PsaProposalBlock } from '@/lib/psa-proposal/types';
import type { LiveQuoteSnapshot, ProposalLang } from '@/lib/psa-proposal/live-data';
import psaLogo from '@/assets/logotipo-psa.jpg.asset.json';
import { letterDateLine, LETTER_SIGNATORY, type LetterFields } from '@/lib/psa-proposal/letter-fields';
export function LetterPage({block,live,lang}:{block:PsaProposalBlock;live?:LiveQuoteSnapshot;lang:ProposalLang}) {
  const query=useProposal(block.proposal_id);const proposal=query.data;
  if(!proposal)return null;
  const settings=(block.content_rich.letterSettings as LetterSettings|undefined)??proposal.style_settings.letterSettings??DEFAULT_LETTER_SETTINGS;
  const map=letterTokenMap(live,proposal);const master=resolveMaster(proposal.style_settings);const layout=typeLayout(master,'letter');
  const html=String(block.content_rich.html??settings.templates[lang]??DEFAULT_LETTER_SETTINGS.templates[lang]);
  const fields=block.content_rich.letterFields as LetterFields | undefined;
  if (block.content_rich.letterVersion === 2 && fields) {
    const missing=(pt:string,en:string)=>lang==='en'?`[${en}]`:`[${pt}]`;
    const body=resolveTokens(html,map).output;
    return <section className="psa-letter-page psa-business-letter" data-letter-version="2" data-live-ready={query.isFetching?'false':'true'} style={{'--letter-logo-width':`${layout.logo.width}mm`,'--letter-logo-x':`${layout.logo.x-layout.margins.left}mm`,'--letter-logo-y':`${layout.logo.y-layout.margins.top}mm`,'--letter-signature-width':`${layout.signatureWidth}mm`,'--letter-body-y':`${Math.max(0,layout.bodyY-layout.margins.top)}mm`,'--letter-height':`${297-layout.margins.top-layout.margins.bottom}mm`} as React.CSSProperties}>
      <div className="psa-business-logo"><img src={psaLogo.url} alt="Pedra Silva"/></div>
      <div className="psa-letter-recipient">
        <div>{fields.recipientCompany||missing('Empresa','Company')}</div>
        <div>{fields.recipientContact||missing('Nome e cargo do contacto','Contact name and title')}</div>
        <div>{fields.recipientAddress||missing('Morada','Street address')}</div>
        <div>{fields.recipientPostalCode||missing('Código postal','Postcode')} {fields.recipientCity||missing('Cidade','City')}</div>
      </div>
      <div className="psa-letter-sender">{fields.sender}</div>
      <p className="psa-letter-date">{letterDateLine(fields,lang)}</p>
      <p className="psa-letter-subject"><strong>{fields.subject}</strong></p>
      <p className="psa-letter-salutation">{fields.salutation}</p>
      <div className="psa-rich psa-letter-body" dangerouslySetInnerHTML={{__html:body}}/>
      <div className="psa-letter-signoff proposal-avoid-break">
        <p>{lang==='en'?'Yours sincerely,':'Com os melhores cumprimentos,'}</p>
        {settings.signatureData&&<img src={settings.signatureData} alt={LETTER_SIGNATORY}/>}
        <div>{LETTER_SIGNATORY}</div><div>{fields.signatoryRole}</div><div>{fields.sender.split('\n')[0]}</div>
      </div>
      <div className="psa-letter-footer">{master.footer.address.replace(/\n/g,' · ')} · {master.contact.email} · {master.contact.website}</div>
    </section>;
  }
  return <section className="psa-letter-page" data-live-ready={query.isFetching?'false':'true'}>
    <div className="psa-letter-letterhead"><img src={psaLogo.url} alt="Pedra Silva" width={layout.logo.width*3.78}/><div className="whitespace-pre-line">{master.footer.address}</div></div>
    <div className="my-8 text-right">{map.proposal_date}</div>
    <div className="mb-6 whitespace-pre-line">{map.client_name}<br/>{String(proposal.client_snapshot.address??proposal.client_snapshot.morada??'')}</div>
    {map.contact_salutation!=='—'&&<p className="mb-4">{map.contact_salutation}</p>}
    <div className="psa-rich" dangerouslySetInnerHTML={{__html:resolveTokens(html,map).output}}/>
    <div className="proposal-avoid-break mt-8">{settings.signatureData&&<img src={settings.signatureData} alt={settings.signatoryName} width={layout.signatureWidth*3.78}/>}<p>{settings.signatoryName}</p></div>
  </section>;
}