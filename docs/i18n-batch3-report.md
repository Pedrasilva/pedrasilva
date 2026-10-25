# Tradução — lote 3: Propostas e editor

## Resultado
- Auditor AST no âmbito pedido: **746 → 55** candidatos. Removidas **691** ocorrências resolvidas do baseline, sem admitir novas assinaturas.
- `npm run test:i18n`: **11 testes**, paridade EN/PT e ratchet aprovados. Regressões de títulos de documentos, honorários de folhas e adiantamentos: **14 testes aprovados**. Último sinal de compilação: OK.
- UI apenas: controlos, painéis, estados, confirmações, validação, etiquetas e descrições de opções; enums e valores guardados não mudaram. Finanças pendentes, projetos reais, propostas e ficheiros reais não foram alterados. Nenhuma migração.
- `src/components/proposals/` não existe neste projeto; os respetivos controlos estão em `psa-composer`. A página de modelos já estava traduzida (0 → 0); o formato de data passou a respeitar o idioma atual.

## Limite documento/editor
- Títulos guardados, conteúdo dos blocos, modelos, condições gerais, termos de pagamento escritos pelo cliente, valores de estilos, marcas, contactos e conteúdo dos PDF/Word permanecem independentes do idioma da aplicação.
- `editor-labels.ts` fornece nomes de blocos, origem e relevância exclusivamente para visualização no editor; nunca é usado para gravar `default_title` ou texto. Nomes de fontes mantidos; descrições tipográficas traduzidas.
- Menu de dados do orçamento traduz apenas os nomes apresentados, nunca identificadores nem valores dos tokens inseridos.
- Durações compactas `d` na tabela de anexo passam a plurais naturais com **lng: lang** do documento: 1 dia / 138 dias ou 1 day / 138 days. Desfasamentos, intervalos e ausências no Gantt usam a língua da UI; nenhum cálculo mudou.

## Allowlist: o que e porquê
1. `src/components/quotes/payment-contract-note.tsx`: texto contratual de aceitação extraído **sem alteração** do ficheiro misto de pagamentos. Não são controlos de UI. Não se excluiu o editor inteiro.
2. `block-renderer.tsx`, scopes exatos por nome de função: H, P, Empty, hasRichContent, RichContent, StageRows, PhaseSummaryCard, BlockBody e GanttRotatedAppendix. São renderização de documento (texto, assinaturas DocuSign, unidades e WBS), sempre regida pelo idioma da proposta. Os avisos de seleção de imagem são um componente separado e continuam auditados; barra de formatação e definições também continuam auditadas.
3. `proposal-style-panel.tsx`: apenas `SelectItem value="pt-PT"` e `value="en"`. São escolhas do idioma **do documento**, com os autónios **Português (Portugal)** e **English**. Nenhum outro rótulo está excluído.
4. Exceções anteriores de marcas e ramos de idioma documental mantidas. Acrescentados dois testes do checker para impedir que a exclusão de uma função/idioma esconda controlos irmãos ou outros ficheiros.

## Candidatos deliberadamente mantidos
Os 55 não são frases de UI esquecidas: o checker também conta literais de comparação de enums em expressões JSX (ex.: live_quote, stage_item, retainer, approved, publish), token {{token}}, letra de exemplo A, símbolo tipográfico A, PDF/.pdf e unidades km, €/km, h, /h e h/d. Não se traduzem identificadores de lógica, extensões ou símbolos universais. Permanecem no baseline e visíveis no relatório, sem exclusão geral nem alteração da lógica.

## Verificação no browser
Sessão autenticada; proposta **FIXTURE · Tradução do editor**, criada apenas nas respostas locais do browser, sem linha na base de dados. Os pedidos de escrita às tabelas foram bloqueados; uma gravação automática de snapshot foi intercetada. Leituras de permissões mantidas. Nenhuma aprovação, envio, publicação, restauro ou alteração em registos reais. Fixtures desapareceram ao fechar o browser.

Documento extraído para comparação retirando exclusivamente os controlos `print:hidden`: o texto completo teve o **mesmo SHA-256** em PT e EN (`ae628e13856a8ac0d8306a3d82c1aa1bad686b182872661c14cc72cea72ab271`). Controlos alternaram, documento permaneceu em português, sem chaves cruas nem erros de execução. Barra de negrito e painel de bloco também verificados. Os controlos que não são impressos (relevância e tipo de bloco) mudam naturalmente com a UI.

- [Editor PT](i18n-batch3/composer-pt-PT.png)
- [Editor EN](i18n-batch3/composer-en.png)
- [Definições do bloco EN](i18n-batch3/block-settings-en.png)
- [Barra de formatação EN](i18n-batch3/toolbar-en.png)
- [Resultados da verificação](i18n-batch3/results.json)

## Contagens por ficheiro

| Ficheiro | Antes | Depois |
|---|---:|---:|
| `src/components/psa-composer/block-library-panel.tsx` | 4 | 0 |
| `src/components/psa-composer/block-renderer.tsx` | 11 | 0 |
| `src/components/psa-composer/block-settings-panel.tsx` | 126 | 22 |
| `src/components/psa-composer/canvas.tsx` | 1 | 0 |
| `src/components/psa-composer/composer-shell.tsx` | 17 | 0 |
| `src/components/psa-composer/composer-top-bar.tsx` | 27 | 1 |
| `src/components/psa-composer/convert-to-contract-dialog.tsx` | 8 | 0 |
| `src/components/psa-composer/import-template-dialog.tsx` | 20 | 0 |
| `src/components/psa-composer/paginated-preview.tsx` | 2 | 2 |
| `src/components/psa-composer/proposal-history-dialog.tsx` | 22 | 0 |
| `src/components/psa-composer/proposal-style-panel.tsx` | 37 | 0 |
| `src/components/psa-composer/relevance-badge.tsx` | 0 | 0 |
| `src/components/psa-composer/rich-text-editor.tsx` | 30 | 1 |
| `src/components/psa-composer/send-proposal-dialog.tsx` | 44 | 1 |
| `src/components/psa-composer/signature-status.tsx` | 6 | 0 |
| `src/components/psa-composer/versions-panel.tsx` | 14 | 0 |
| `src/components/quotes/apply-template-dialog.tsx` | 0 | 0 |
| `src/components/quotes/conversion-invoice-preview.tsx` | 0 | 0 |
| `src/components/quotes/invoice-grouping-control.tsx` | 0 | 0 |
| `src/components/quotes/payment-schedule-proposal-view.tsx` | 42 | 0 |
| `src/components/quotes/payment-schedule-reconciliation.tsx` | 11 | 0 |
| `src/components/quotes/quote-billable-rates-tab.tsx` | 15 | 0 |
| `src/components/quotes/quote-build-settings-dialog.tsx` | 16 | 0 |
| `src/components/quotes/quote-construction-assistance-tab.tsx` | 75 | 6 |
| `src/components/quotes/quote-create-contract-card.tsx` | 0 | 0 |
| `src/components/quotes/quote-external-services-tab.tsx` | 0 | 0 |
| `src/components/quotes/quote-fee-calculator-card.tsx` | 3 | 0 |
| `src/components/quotes/quote-fee-source-toggle.tsx` | 10 | 0 |
| `src/components/quotes/quote-financial-summary-tab.tsx` | 11 | 4 |
| `src/components/quotes/quote-lock-guard.tsx` | 13 | 0 |
| `src/components/quotes/quote-ontology-bootstrap-card.tsx` | 0 | 0 |
| `src/components/quotes/quote-payment-schedule-tab.tsx` | 14 | 2 |
| `src/components/quotes/quote-planner-inspector.tsx` | 6 | 5 |
| `src/components/quotes/quote-planning-tab.tsx` | 0 | 0 |
| `src/components/quotes/quote-project-billing-inspector.tsx` | 18 | 1 |
| `src/components/quotes/quote-proposal-composer-embed.tsx` | 1 | 0 |
| `src/components/quotes/quote-publish-step.tsx` | 0 | 0 |
| `src/components/quotes/quote-revisions-button.tsx` | 0 | 0 |
| `src/components/quotes/quote-sale-margin-settings.tsx` | 0 | 0 |
| `src/components/quotes/quote-signature-card.tsx` | 0 | 0 |
| `src/components/quotes/quote-status-rail.tsx` | 0 | 0 |
| `src/components/quotes/quote-supplier-markup-editor.tsx` | 3 | 0 |
| `src/components/quotes/quote-template-picker.tsx` | 0 | 0 |
| `src/components/quotes/quote-time-based-settings-tab.tsx` | 2 | 2 |
| `src/components/quotes/quote-warnings-banner.tsx` | 0 | 0 |
| `src/components/quotes/quote-workflow-actions.tsx` | 1 | 1 |
| `src/components/quotes/quote-workflow-stepper.tsx` | 0 | 0 |
| `src/components/quotes/relative-schedule-controls.tsx` | 0 | 0 |
| `src/components/quotes/retainer-monthly-readings.tsx` | 1 | 1 |
| `src/components/quotes/retainer-stage-editor.tsx` | 4 | 3 |
| `src/components/quotes/save-as-template-dialog.tsx` | 0 | 0 |
| `src/routes/_app.admin.proposal-images.tsx` | 11 | 0 |
| `src/routes/_app.admin.proposal-roles.tsx` | 54 | 0 |
| `src/routes/_app.admin.quotes-trash.tsx` | 31 | 1 |
| `src/routes/_app.crm.pipeline.$proposalId.tsx` | 0 | 0 |
| `src/routes/_app.crm.quote-templates.tsx` | 0 | 0 |
| `src/routes/_app.crm.quotes.$quoteId.tsx` | 13 | 2 |
| `src/routes/_app.proposals.$proposalId.composer.tsx` | 0 | 0 |
| `src/routes/_app.proposals.$proposalId.revisions.$revisionId.tsx` | 16 | 0 |
| `src/routes/_app.proposals.index.tsx` | 6 | 0 |

## Ficheiros alterados / acrescentados

- `AGENTS.md`
- `roadmap.md`
- `scripts/check-i18n.mjs`
- `scripts/i18n-allowlist.json`
- `scripts/i18n-baseline.json`
- `scripts/test-check-i18n.mjs`
- `src/components/projects/gantt-chart.tsx`
- `src/components/psa-composer/block-library-panel.tsx`
- `src/components/psa-composer/block-renderer.tsx`
- `src/components/psa-composer/block-settings-panel.tsx`
- `src/components/psa-composer/canvas.tsx`
- `src/components/psa-composer/composer-shell.tsx`
- `src/components/psa-composer/composer-top-bar.tsx`
- `src/components/psa-composer/convert-to-contract-dialog.tsx`
- `src/components/psa-composer/document-editor-hints.tsx`
- `src/components/psa-composer/editor-labels.ts`
- `src/components/psa-composer/import-template-dialog.tsx`
- `src/components/psa-composer/proposal-history-dialog.tsx`
- `src/components/psa-composer/proposal-style-panel.tsx`
- `src/components/psa-composer/relevance-badge.tsx`
- `src/components/psa-composer/rich-text-editor.tsx`
- `src/components/psa-composer/send-proposal-dialog.tsx`
- `src/components/psa-composer/signature-label.ts`
- `src/components/psa-composer/signature-status.tsx`
- `src/components/psa-composer/versions-panel.tsx`
- `src/components/quotes/conversion-invoice-preview.tsx`
- `src/components/quotes/invoice-grouping-control.tsx`
- `src/components/quotes/payment-contract-note.tsx`
- `src/components/quotes/payment-schedule-proposal-view.tsx`
- `src/components/quotes/payment-schedule-reconciliation.tsx`
- `src/components/quotes/quote-billable-rates-tab.tsx`
- `src/components/quotes/quote-build-settings-dialog.tsx`
- `src/components/quotes/quote-construction-assistance-tab.tsx`
- `src/components/quotes/quote-fee-calculator-card.tsx`
- `src/components/quotes/quote-fee-source-toggle.tsx`
- `src/components/quotes/quote-financial-summary-tab.tsx`
- `src/components/quotes/quote-lock-guard.tsx`
- `src/components/quotes/quote-payment-schedule-tab.tsx`
- `src/components/quotes/quote-planner-inspector.tsx`
- `src/components/quotes/quote-project-billing-inspector.tsx`
- `src/components/quotes/quote-proposal-composer-embed.tsx`
- `src/components/quotes/quote-signature-card.tsx`
- `src/components/quotes/quote-supplier-markup-editor.tsx`
- `src/components/quotes/retainer-stage-editor.tsx`
- `src/i18n/locales/en/common.json`
- `src/i18n/locales/en/crm.json`
- `src/i18n/locales/en/projects.json`
- `src/i18n/locales/pt-PT/common.json`
- `src/i18n/locales/pt-PT/crm.json`
- `src/i18n/locales/pt-PT/projects.json`
- `src/routes/_app.admin.proposal-images.tsx`
- `src/routes/_app.admin.proposal-roles.tsx`
- `src/routes/_app.admin.quotes-trash.tsx`
- `src/routes/_app.crm.quote-templates.tsx`
- `src/routes/_app.crm.quotes.$quoteId.tsx`
- `src/routes/_app.proposals.$proposalId.composer.tsx`
- `src/routes/_app.proposals.$proposalId.revisions.$revisionId.tsx`
- `src/routes/_app.proposals.index.tsx`

Relatório estruturado: [i18n-batch3-per-file.json](i18n-batch3-per-file.json). Não foram exercidos envio DocuSign, exportação real de PDF, nem recuperação de propostas: são ações fora do âmbito de tradução e poderiam produzir efeitos reais.
