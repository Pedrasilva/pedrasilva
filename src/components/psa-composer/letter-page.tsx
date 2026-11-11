import { useProposal } from '@/lib/psa-proposal/use-psa-proposal';
import { DEFAULT_LETTER_SETTINGS, letterTokenMap, type LetterSettings } from '@/lib/psa-proposal/letter';
import { resolveTokens } from '@/lib/psa-proposal/tokens';
import { resolveMaster, typeLayout } from '@/lib/psa-proposal/master-page';
import type { PsaProposalBlock } from '@/lib/psa-proposal/types';
import type { LiveQuoteSnapshot, ProposalLang } from '@/lib/psa-proposal/live-data';
import psaLogo from '@/assets/logotipo-psa.jpg.asset.json';
export function LetterPage({block,live,lang}:{block:PsaProposalBlock;live?:LiveQuoteSnapshot;lang:ProposalLang}) {
  const query=useProposal(block.proposal_id);const proposal=query.data;
  if(!proposal)return null;
  const settings=(block.content_rich.letterSettings as LetterSettings|undefined)??proposal.style_settings.letterSettings??DEFAULT_LETTER_SETTINGS;
  const map=letterTokenMap(live,proposal);const master=resolveMaster(proposal.style_settings);const layout=typeLayout(master,'letter');
  const html=String(block.content_rich.html??settings.templates[lang]??DEFAULT_LETTER_SETTINGS.templates[lang]);
  return <section className="psa-letter-page" data-live-ready={query.isFetching?'false':'true'}>
    <div className="psa-letter-letterhead"><img src={psaLogo.url} alt="Pedra Silva" width={layout.logo.width*3.78}/><div className="whitespace-pre-line">{master.footer.address}</div></div>
    <div className="my-8 text-right">{map.proposal_date}</div>
    <div className="mb-6 whitespace-pre-line">{map.client_name}<br/>{String(proposal.client_snapshot.address??proposal.client_snapshot.morada??'')}</div>
    {map.contact_salutation!=='—'&&<p className="mb-4">{map.contact_salutation}</p>}
    <div className="psa-rich" dangerouslySetInnerHTML={{__html:resolveTokens(html,map).output}}/>
    <div className="proposal-avoid-break mt-8">{settings.signatureData&&<img src={settings.signatureData} alt={settings.signatoryName} width={layout.signatureWidth*3.78}/>}<p>{settings.signatoryName}</p></div>
  </section>;
}