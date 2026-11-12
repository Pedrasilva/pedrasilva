# Carta empresarial — implementação e limites

## Entregue
- Formato formal opt-in no bloco Carta: destinatário superior direito, remetente, local/data editorial, assunto, saudação, corpo rico e assinatura de Luís Pedra Silva com cargo editável. Morada/contactos no rodapé, logo isolado no topo esquerdo, sem número.
- Campos editáveis guardados no documento; adoção explícita preenche empresa/contacto ligados à quote. Código postal/contacto ausentes mantêm espaços reservados; não se escolhe outro contacto nem se expande a localidade.
- IA gera apenas o corpo em PT-PT/EN, a partir de âmbito/exclusões, fases, plano de pagamentos e programa da própria proposta. Consulta documental exclui catálogos de preços e salários HR. Mantido modelo atual.
- Confirmação antes de substituir corpo; comparação do conteúdo antes/depois e atualização condicionada ao conteúdo original para preservar edições concorrentes.
- Programa conta fases efetivas sem grupos duplicados e inclui avença; não soma intervalos sobrepostos.
- Nova Carta tem uma página de altura fixa, sem cortar texto; excesso sinalizado na paginação impede exportação e registo de versão pelo fluxo UI.
- Master Carta mostra logótipo, posição de destinatário e contactos no rodapé. Cover/Content não foram alterados.

## Verificado
- Quote de teste independente **218c7ecc-9c19-4123-85ad-18b4f8a304c3**, documento **14883ae1-184a-480c-9988-9ad897541532**. Ligações verificadas pelo factory D46/D47; original 34 blocos iguais nas verificações concluídas. Cópia preservada, não apagada sem autorização.
- Geração real PT e EN, cancelar confirmação, adotar formato, preencher código postal e reler: passaram.
- Páginas PT/EN: uma Carta A4 vertical, destinatário no quadrante direito, logo superior esquerdo, rodapé sem número; primeiro Conteúdo numerado **1**.
- Texto manual excessivo: `paginationStatus=error`, `letterOverflow=true`; texto não cortado. Restaurado apenas o conteúdo anterior da cópia após o teste.
- **20 testes unitários passaram**, paridade EN/PT e auditoria UI sem novas cadeias; último build observado OK.
- Capturas temporárias verificadas: `/tmp/browser/letter/letter-pt.png`, `letter-en.png`, `overflow.png`.

## Diferença face à maquete
Os dados reais tinham mudado entre a leitura do plano e a criação da cópia: a cópia apresentava **18 meses de avença**, total **221 300 €** e **113 semanas**. A IA usou estes dados da cópia, não congelou os 203 300 €/12 meses/87 semanas da maquete. Esta tarefa não alterou valores do Oleiro real nem corrigiu estes dados.

## Não certificado
- **PDF físico:** a janela de impressão existente ficou vazia enquanto esperava readiness. A primeira captura PDF era uma janela vazia de uma página Letter e foi rejeitada como evidência; não constitui PDF validado. Páginas no iframe estão verificadas, exportação final não. Uma tentativa de simplificar a espera não resolveu e foi revertida.
- Upload/imagem de assinatura, criação de uma proposta nova, concorrência UI completa, limites de geometria personalizados e regressão comparativa integral de Capa/Conteúdo aguardam verificações isoladas. Não se certifica conclusão integral nem prontidão de publicação.
- B1 não foi alterado; o factory confirmou OFF. Não houve migração, política, alteração de papéis, exclusões reais ou dados de projetos.

## Ficheiros alterados
- `src/lib/psa-proposal/letter-fields.ts` (novo), `use-letter-sources.ts` (novo), `letter.ts`, `letter.server.ts`, `live-data.ts`, `use-psa-proposal.ts`, `use-proposal-revisions.ts`.
- `src/components/psa-composer/letter-page.tsx`, `letter-controls.tsx`, `letter.css` (novo), `master-page-editor.tsx`, `paginated-preview.tsx`.
- `src/i18n/locales/en/common.json`, `src/i18n/locales/pt-PT/common.json`.
- `scripts/test-letter-fields.test.ts` (novo), `docs/DECISIONS.md` (D51), `roadmap.md`, este relatório e plano aprovado.
- Regra técnica não acrescentada ao AGENTS raiz: limite de tamanho atingido; nenhuma regra existente foi encurtada.