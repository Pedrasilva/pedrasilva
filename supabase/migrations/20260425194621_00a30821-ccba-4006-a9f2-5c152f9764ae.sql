-- Add 17 new master proposal blocks (EN + PT-PT) for the "Interior Fit-Out"
-- preset, mirroring the structure of a full architectural fee proposal
-- (cover/intro, project areas, scope, base info, stages intro, fee intro,
-- monthly payment cycle, timelines, additional services, travelling,
-- exclusions, validity, signature). All wording is generic — no firm
-- names, addresses, partner names or specific monetary rates.
--
-- Idempotent: ON CONFLICT (slug, language) DO NOTHING so re-running is safe.

INSERT INTO public.proposal_blocks
  (title, slug, language, block_type, visibility, default_content, sort_order, is_active)
VALUES
  -- ─── EN ─────────────────────────────────────────────────────────
  ('Interior Fit-Out — Introduction', 'psa-intro-interior-fitout', 'en', 'editable_text', 'client',
'Dear {{client_name}},

This proposal is submitted as an offer to develop architectural design services for **{{project_name}}**, an interior fit-out project, and includes a detailed fee schedule for the stages of work described in this document.

We look forward to collaborating with you on this project.', 5, true),

  ('Project Areas', 'psa-project-areas', 'en', 'editable_text', 'client',
'The project areas and floors subject to intervention, to which this proposal refers, are the following:

{{project_areas}}

(If no list is provided above, the parties will agree on the final scope of areas during the first project stage.)', 15, true),

  ('Scope — Interior Design, Furniture & Signage', 'psa-scope-interior-design', 'en', 'editable_text', 'client',
'This financial proposal refers to **Interior Design**, **Furniture Selection**, and **Signage and Wayfinding** services, and has been prepared based on the requirements gathered to date and the knowledge accumulated through previous studies, where applicable.

The fee was calculated on the premise that the concept design will be developed as an update of any prior design ideas already shared with the client, and takes into consideration all information shared by the client up to the date of this proposal.', 25, true),

  ('Local Authorities & Common Areas — Exclusions', 'psa-scope-exclusions-local', 'en', 'editable_text', 'client',
'This proposal does **not** include any work related to the common areas of the building or the building envelope (e.g. façade). It also does **not** include any preparation for approval to be submitted to local authorities, nor the incorporation of local building regulations into the design.

The client must engage a local consultant to develop these services and to assist the design teams throughout the design stages, ensuring that the design is compliant with local regulations. In addition, the local consultant or another appointed party will be responsible for preparing the construction documentation in the local language, based on the English technical design package provided by the lead designer.', 35, true),

  ('MEP, Lighting and Specialist Engineering', 'psa-mep-lighting-note', 'en', 'editable_text', 'client',
'Lighting design, MEP and other technical services such as fire safety must be contracted locally by the client. Local engineering teams must be fluent in English and must be involved at an early stage of the project so that any technical constraints that may affect the interior design can be identified as early as possible.

Where a lighting consultant has previously been appointed by the client or the developer, continuity with that consultant is recommended in order to preserve coherence with the existing lighting strategy.', 45, true),

  ('Sustainability Standards (LEED / BREEAM)', 'psa-leed-breeam-note', 'en', 'editable_text', 'client',
'The project can be prepared to meet **LEED** and/or **BREEAM** standards if required, provided an external consultant appointed by the client provides all the necessary information at an early stage.', 55, true),

  ('Base Information Required from Client', 'psa-base-information', 'en', 'editable_text', 'client',
'Before starting work, design teams must have all the information they need to develop the project. This information should include but is not limited to:

- A detailed description of the client''s expectations, programme and elements to be carried out;
- Technical and legal information;
- Drawings of the building in which the project is to be developed (as-built drawings);
- Site photographs.

Ideally, a laser scan of the site should be carried out to confirm dimensions. All of this information must be provided by the client.', 65, true),

  ('Project Stages — Introduction', 'psa-stages-intro', 'en', 'editable_text', 'client',
'The project was divided into {{stage_count}} work stages. This project sequence is essential in order to maintain an organised working methodology, with the aim of achieving an outstanding quality project and allowing the client to carry out all the necessary reviews and approvals at each stage.

The detailed list of stages, with start and end dates, is presented in the section below.', 75, true),

  ('Fee Proposal — Introduction', 'psa-fee-intro-inflation', 'en', 'editable_text', 'client',
'Our fees were prepared in line with current market conditions in order to guarantee the quality standards of the design team.

The total fee for the services described in this proposal is **{{total_fee}}**, exclusive of VAT, broken down by stage in the table below. Any work falling outside this scope will be treated as an additional service and addressed separately.', 95, true),

  ('Payment — Monthly Cycle', 'psa-payment-monthly-cycle', 'en', 'editable_text', 'client',
'Design stage fees will be paid on a **monthly basis** per stage.

The first payment should be made as a downpayment at the start of the project, on receipt of the corresponding invoice. The remaining invoices must be paid within **{{payment_terms_days}} days** from the date of issue, unless otherwise agreed.

A monthly invoicing cycle will run from the beginning to the end of each design stage. Where a construction administration phase is included, a separate invoicing cycle will commence with the tendering stage and conclude with the end of construction.', 115, true),

  ('Timelines and Deadlines', 'psa-timelines-deadlines', 'en', 'editable_text', 'client',
'The project start date is defined as the date on which the contract is signed and the initial payment is made.

The deadlines for each phase of the project are established according to the planning carried out by the design team and form the basis of this proposal.

The start of each phase is always dependent on the formal approval of the previous phase and on the timely provision by the client of the information required to develop the work.

Deadlines may be adjusted in the light of new data or unforeseen situations that did not exist at the time this proposal was drawn up.', 135, true),

  ('Additional Services', 'psa-additional-services-interior', 'en', 'editable_text', 'client',
'Any additional services or work other than those specified in this proposal, or any extension of time required to achieve the client''s expectations and to obtain the approval of the project, will be quoted based on the rates set out in the *Fee Proposal* section. If the additional work is to be performed in less than one month, the monthly fee will be charged on a weekly basis, adjusted accordingly.

Definition of additional work:

1. Any services other than those indicated in this proposal;
2. Additional project time required to fulfil the client''s expectations and requirements beyond the time indicated for the development of the work;
3. Any work related to previous phases that have already been approved;
4. Any work required in late phases that may cause the phase in question to be extended or that may affect the general planning.

Additional 3D images beyond those included in this proposal will be charged at the rate to be agreed in writing with the client.', 145, true),

  ('Travelling', 'psa-travelling', 'en', 'editable_text', 'client',
'Prices exclude any travel expenses or accommodation costs outside the project''s primary city, and any international trips, beside those expressly indicated in this proposal.

Travel outside the primary city is billed per kilometre at a rate to be agreed in writing, or against receipts. Should any other travel-related expense become necessary, the design team will communicate with the client and request written approval before incurring such expenses. Travel and accommodation expenses will be paid against proof of receipt; air travel and accommodation standards are to be agreed with the client in advance.', 155, true),

  ('Exclusions — Interior Project', 'psa-exclusions-interior', 'en', 'editable_text', 'client',
'The following items are **excluded** from this proposal unless explicitly stated otherwise:

- All prices are exclusive of VAT. This tax will be added at the legal rate in force when the invoice is issued;
- Travel expenses such as transport, accommodation, meals and other associated expenses outside the project''s primary city;
- Specialised services such as topographical surveys, architectural surveys, geotechnical studies and similar;
- Licensing stages and other applications to local authorities;
- Payment of taxes and/or copies required from local authorities or other entities;
- Project phases other than those indicated in this proposal;
- Engineering and other specialist consultant projects, including fire safety and acoustics;
- Audiovisual projects;
- Technical kitchens and other specialised spaces requiring specialist consultants;
- Preparation, tender launch, contracts and administration related to the contractor tender process;
- Construction administration, on-site inspection and supervision, as-built drawings, and other coordination of works on the construction site;
- Project and construction management;
- Bills of quantities and measurements other than those indicated in this proposal;
- Construction cost estimates;
- Specifications and special technical conditions;
- Process for obtaining a licence for use (as-built drawings or other documents for local authorities) in the post-construction phase;
- Preparation of drawings or 3D images for sale or marketing of the property;
- 3D images other than those indicated;
- Mock-ups or physical models of the project;
- Any other services not specified in this proposal.', 175, true),

  ('Validity & Acceptance', 'psa-validity-30-days', 'en', 'editable_text', 'client',
'This offer is valid for a period of **{{validity_days}} days** from the date of issue.

We hope this offer meets your expectations and remain available to answer any questions you may have. If you accept this offer, please return this document signed.', 195, true),

  ('Closing & Signature', 'psa-closing-signature', 'en', 'editable_text', 'client',
'Kind regards,

{{firm_partner_name}}
{{firm_partner_title}}

---

**Term of acceptance**

I accept this proposal under the terms described above.

Date: ____________________

Client''s legal representative: ____________________

Signature and stamp: ____________________________________________', 215, true),

  -- ─── PT-PT ──────────────────────────────────────────────────────
  ('Fit-Out Interior — Introdução', 'psa-intro-interior-fitout', 'pt-PT', 'editable_text', 'client',
'Exmo(a). {{client_name}},

A presente proposta é submetida como oferta para o desenvolvimento dos serviços de arquitectura para **{{project_name}}**, um projecto de fit-out interior, e inclui um plano detalhado de honorários para as fases descritas neste documento.

Estamos disponíveis e entusiasmados para colaborar consigo neste projecto.', 5, true),

  ('Áreas do projecto', 'psa-project-areas', 'pt-PT', 'editable_text', 'client',
'As áreas e pisos sujeitos a intervenção a que esta proposta se refere são os seguintes:

{{project_areas}}

(Caso não esteja indicada nenhuma lista acima, o âmbito final de áreas será acordado durante a primeira fase do projecto.)', 15, true),

  ('Âmbito — Design Interior, Mobiliário e Sinalética', 'psa-scope-interior-design', 'pt-PT', 'editable_text', 'client',
'Esta proposta financeira refere-se aos serviços de **Design Interior**, **Selecção de Mobiliário** e **Sinalética e Wayfinding**, e foi preparada com base nos requisitos recolhidos até ao momento e no conhecimento acumulado em estudos anteriores, quando aplicável.

Os honorários foram calculados na premissa de que o conceito será desenvolvido como uma actualização de ideias previamente partilhadas com o cliente, e considera toda a informação partilhada pelo cliente até à data desta proposta.', 25, true),

  ('Autoridades locais e áreas comuns — Exclusões', 'psa-scope-exclusions-local', 'pt-PT', 'editable_text', 'client',
'Esta proposta **não** inclui qualquer trabalho relacionado com as áreas comuns do edifício nem com a envolvente exterior (ex. fachada). Também **não** inclui a preparação de qualquer aprovação a submeter a entidades locais, nem a incorporação no projecto da regulamentação de construção local.

O cliente deverá contratar um consultor local para desenvolver esses serviços e prestar apoio às equipas de projecto ao longo das fases de design, garantindo a conformidade com a regulamentação local. Adicionalmente, o consultor local ou outra entidade designada pelo cliente será responsável pela preparação da documentação de construção na língua local, com base no pacote técnico em inglês fornecido pela equipa de projecto.', 35, true),

  ('MEP, Iluminação e Engenharia Especializada', 'psa-mep-lighting-note', 'pt-PT', 'editable_text', 'client',
'O projecto de iluminação, MEP e outros serviços técnicos como segurança contra incêndios devem ser contratados localmente pelo cliente. As equipas de engenharia locais devem dominar a língua inglesa e ser envolvidas numa fase inicial do projecto, de modo a que quaisquer condicionantes técnicas que possam afectar o design interior sejam identificadas o mais cedo possível.

Quando um consultor de iluminação tenha sido previamente nomeado pelo cliente ou pelo promotor, recomenda-se a continuidade com esse consultor, de forma a preservar a coerência com a estratégia de iluminação existente.', 45, true),

  ('Padrões de sustentabilidade (LEED / BREEAM)', 'psa-leed-breeam-note', 'pt-PT', 'editable_text', 'client',
'O projecto pode ser preparado para cumprir padrões **LEED** e/ou **BREEAM** se necessário, desde que um consultor externo, designado pelo cliente, forneça toda a informação necessária numa fase inicial.', 55, true),

  ('Informação de base a fornecer pelo cliente', 'psa-base-information', 'pt-PT', 'editable_text', 'client',
'Antes de iniciar o trabalho, as equipas de projecto devem dispor de toda a informação necessária ao desenvolvimento do projecto. Essa informação deverá incluir, entre outros:

- Descrição detalhada das expectativas, do programa e dos elementos a executar;
- Informação técnica e legal;
- Desenhos do edifício onde o projecto será desenvolvido (telas finais);
- Fotografias do local.

Idealmente, deverá ser realizado um levantamento por laser scan para confirmação de dimensões. Toda esta informação deverá ser disponibilizada pelo cliente.', 65, true),

  ('Fases do projecto — Introdução', 'psa-stages-intro', 'pt-PT', 'editable_text', 'client',
'O projecto foi dividido em {{stage_count}} fases de trabalho. Esta sequência é essencial para manter uma metodologia organizada, com o objectivo de alcançar um projecto de qualidade excepcional e permitir ao cliente a realização das revisões e aprovações necessárias em cada fase.

A lista detalhada das fases, com datas de início e fim, é apresentada na secção abaixo.', 75, true),

  ('Honorários — Introdução', 'psa-fee-intro-inflation', 'pt-PT', 'editable_text', 'client',
'Os honorários foram preparados em linha com as condições de mercado actuais, de modo a garantir os padrões de qualidade da equipa de projecto.

O valor total dos serviços descritos nesta proposta é de **{{total_fee}}**, valor sem IVA, decomposto por fase na tabela abaixo. Qualquer trabalho fora deste âmbito será tratado como serviço adicional e abordado separadamente.', 95, true),

  ('Pagamento — Ciclo mensal', 'psa-payment-monthly-cycle', 'pt-PT', 'editable_text', 'client',
'Os honorários das fases de projecto serão pagos numa base **mensal** por fase.

O primeiro pagamento deverá ser efectuado como adiantamento no início do projecto, contra recepção da respectiva factura. As facturas seguintes deverão ser pagas no prazo de **{{payment_terms_days}} dias** após a sua emissão, salvo acordo em contrário.

Será emitido um ciclo mensal de facturação desde o início até ao fim de cada fase de projecto. Caso esteja incluída uma fase de assistência à obra, será iniciado um ciclo de facturação separado, com início na fase de concurso e conclusão no final da construção.', 115, true),

  ('Cronograma e prazos', 'psa-timelines-deadlines', 'pt-PT', 'editable_text', 'client',
'A data de início do projecto corresponde à data em que o contrato é assinado e o pagamento inicial é efectuado.

Os prazos de cada fase do projecto são estabelecidos de acordo com o planeamento da equipa de projecto e constituem a base desta proposta.

O início de cada fase depende sempre da aprovação formal da fase anterior e do fornecimento atempado, por parte do cliente, da informação necessária ao desenvolvimento do trabalho.

Os prazos poderão ter de ser ajustados em função de novos dados ou de situações imprevistas que não existissem à data desta proposta.', 135, true),

  ('Serviços adicionais', 'psa-additional-services-interior', 'pt-PT', 'editable_text', 'client',
'Quaisquer serviços ou trabalhos adicionais para além dos especificados nesta proposta, ou qualquer extensão de tempo necessária para alcançar as expectativas do cliente e a aprovação do projecto, serão orçamentados com base nos valores apresentados na secção *Honorários*. Caso o trabalho adicional seja executado em menos de um mês, o honorário mensal será cobrado numa base semanal, ajustado em conformidade.

Definição de trabalho adicional:

1. Qualquer serviço para além dos indicados nesta proposta;
2. Tempo de projecto adicional necessário para cumprir as expectativas e requisitos do cliente, para além do indicado para o desenvolvimento do trabalho;
3. Qualquer trabalho relacionado com fases anteriores já aprovadas;
4. Qualquer trabalho exigido em fases tardias que cause prolongamento da fase em questão ou que afecte o planeamento geral.

Imagens 3D adicionais para além das incluídas nesta proposta serão facturadas ao valor a acordar por escrito com o cliente.', 145, true),

  ('Deslocações', 'psa-travelling', 'pt-PT', 'editable_text', 'client',
'Os preços não incluem quaisquer despesas de deslocação ou alojamento fora da cidade principal do projecto, nem viagens internacionais, para além das expressamente indicadas nesta proposta.

As deslocações fora da cidade principal serão facturadas por quilómetro, ao valor a acordar por escrito, ou contra recibo. Caso seja necessária qualquer outra despesa relacionada com deslocações, a equipa de projecto comunicará com o cliente e solicitará aprovação por escrito antes de incorrer nessa despesa. As despesas de deslocação e alojamento serão pagas mediante apresentação de comprovativo; o padrão de viagem aérea e alojamento será acordado previamente com o cliente.', 155, true),

  ('Exclusões — Projecto interior', 'psa-exclusions-interior', 'pt-PT', 'editable_text', 'client',
'Encontram-se **excluídos** desta proposta, salvo indicação expressa em contrário:

- Todos os preços são apresentados sem IVA. Este imposto será adicionado à taxa legal em vigor à data da emissão da factura;
- Despesas de deslocação como transporte, alojamento, refeições e outras despesas associadas, fora da cidade principal do projecto;
- Serviços especializados como levantamentos topográficos, levantamentos arquitectónicos, estudos geotécnicos e similares;
- Fases de licenciamento e outras submissões a entidades locais;
- Pagamento de taxas e/ou cópias exigidas por câmaras municipais ou outras entidades;
- Fases de projecto para além das indicadas nesta proposta;
- Projectos de engenharia e outros consultores especializados, incluindo segurança contra incêndio e acústica;
- Projectos audiovisuais;
- Cozinhas técnicas e outros espaços especializados que exijam consultores específicos;
- Preparação, lançamento de concurso, contratos e administração relacionados com o processo de concurso para empreiteiro;
- Administração de obra, fiscalização e supervisão em obra, telas finais e outras coordenações em estaleiro;
- Direcção e gestão de projecto e obra;
- Mapas de quantidades e medições para além dos indicados nesta proposta;
- Estimativas de custo de construção;
- Cadernos de encargos e condições técnicas especiais;
- Processo de licença de utilização (telas finais ou outros documentos para entidades locais) em fase pós-construção;
- Preparação de desenhos ou imagens 3D para venda ou marketing do imóvel;
- Imagens 3D para além das indicadas;
- Maquetas físicas ou modelos do projecto;
- Quaisquer outros serviços não especificados nesta proposta.', 175, true),

  ('Validade e aceitação', 'psa-validity-30-days', 'pt-PT', 'editable_text', 'client',
'Esta proposta é válida por um período de **{{validity_days}} dias** a contar da data de emissão.

Esperamos que esta proposta corresponda às vossas expectativas e ficamos disponíveis para esclarecer quaisquer questões. Caso aceite a presente oferta, queira por favor devolver este documento devidamente assinado.', 195, true),

  ('Encerramento e assinatura', 'psa-closing-signature', 'pt-PT', 'editable_text', 'client',
'Com os melhores cumprimentos,

{{firm_partner_name}}
{{firm_partner_title}}

---

**Termo de aceitação**

Aceito esta proposta nos termos acima descritos.

Data: ____________________

Representante legal do cliente: ____________________

Assinatura e carimbo: ____________________________________________', 215, true)

ON CONFLICT (slug, language) DO NOTHING;