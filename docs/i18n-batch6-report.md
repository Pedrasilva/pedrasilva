# Tradução — lote 6 e qualidade das frases

## Resultado
- Auditoria global: **481 → 0 candidatos UI não tratados**; baseline reduzido de 481 para 0, sem admitir novas assinaturas.
- A auditoria corrigida identificava **197 candidatos efetivos**: 124 ocorrências foram traduzidas e 73 tokens técnicos/intencionais ficaram explicitamente excluídos por ficheiro, tipo e texto exato. As outras 284 ocorrências eram comparações de enums, não texto renderizado. Estas correções do checker têm testes próprios.
- Zero candidatos não significa traduzir documentos ou valores guardados: estes mantêm o idioma/conteúdo original. Os mapas indiretos, que não entram nesta métrica, foram revistos separadamente (ações de importação, regressos de clientes/fornecedores, biblioteca de imagens).
- Apenas texto e formatação de apresentação; **nenhuma migração, escrita real ou aplicação das propostas financeiras pendentes** (saldos de abertura, contas de liquidação, duplicados Bernardo).

## Frases e plurais
Mensagens completas substituem fragmentos de permissões com links, substituição de modelos com negrito, avisos/caminhos Drive, linhas de pré-visualização de backups, alterações por guardar, referência aos dias úteis, contagem de fichas arquivadas, resumos de documentos em atraso e razões que impedem confirmar.
Os pseudo-plurais foram substituídos por `_one`/`_other` e `count` em Finance, HR, CRM, Projects e Marketing. Resumos com várias contagens independentes usam frases completas neutras ("Fichas inseridas: …; colaboradores criados: …"). Marketing recebeu frases de evidência completas para cada combinação de amostra/seguidores; avisos de vídeo removido e origem do clearance também são mensagens únicas.
Correções AO90 foram feitas apenas nos valores de tradução, preservando chaves e nomes de interpolação; honoríficos, enums e nomes guardados não foram alterados.

## Contagens por módulo
Antes = auditoria original; candidatos efetivos = depois de remover falsos positivos de comparação. Depois = UI não tratada após traduções e exclusões exatas.

| Módulo | Antes | Candidatos efetivos | Depois |
|---|---:|---:|---:|
| shell/shared | 36 | 36 | 0 |
| crm | 9 | 0 | 0 |
| finance | 123 | 48 | 0 |
| home | 7 | 5 | 0 |
| hr | 49 | 15 | 0 |
| marketing | 61 | 8 | 0 |
| planner | 5 | 5 | 0 |
| products | 4 | 0 | 0 |
| projects | 64 | 7 | 0 |
| psa-composer | 27 | 6 | 0 |
| quotes | 25 | 15 | 0 |
| shell | 2 | 2 | 0 |
| ui | 17 | 17 | 0 |
| other | 7 | 7 | 0 |
| admin | 20 | 8 | 0 |
| inbox | 1 | 0 | 0 |
| nudges | 1 | 0 | 0 |
| reports | 17 | 12 | 0 |
| login | 6 | 6 | 0 |

## Contagens por ficheiro
Os tokens mantidos são apenas unidades/símbolos, marcas, nomes técnicos, exemplos de identificadores e honoríficos guardados; nenhuma exclusão de módulo foi acrescentada. Os documentos de impressão/PDF existentes continuam com os seus escopos explícitos anteriores.

| Ficheiro | Antes | Tokens mantidos intencionalmente | UI não tratada depois |
|---|---:|---:|---:|
| `src/components/AdminOnly.tsx` | 4 | 0 | 0 |
| `src/components/CollaboratorAvatar.tsx` | 1 | 0 | 0 |
| `src/components/CollaboratorPhotoUploader.tsx` | 6 | 0 | 0 |
| `src/components/PermissionGate.tsx` | 5 | 0 | 0 |
| `src/components/QuickCreateMenu.tsx` | 7 | 7 | 0 |
| `src/components/ResumoComparativoTab.tsx` | 1 | 0 | 0 |
| `src/components/ViewAsPicker.tsx` | 10 | 0 | 0 |
| `src/components/crm/company-projects-tab.tsx` | 1 | 0 | 0 |
| `src/components/finance/bank-imports-manager.tsx` | 2 | 0 | 0 |
| `src/components/finance/bank-reconciliation.tsx` | 9 | 2 | 0 |
| `src/components/finance/companies-import-card.tsx` | 22 | 1 | 0 |
| `src/components/finance/create-doc-from-tx.tsx` | 1 | 1 | 0 |
| `src/components/finance/documents-list.tsx` | 1 | 0 | 0 |
| `src/components/finance/drive-archive-page.tsx` | 1 | 0 | 0 |
| `src/components/finance/drive-intake-card.tsx` | 5 | 0 | 0 |
| `src/components/finance/drive-settings-card.tsx` | 3 | 1 | 0 |
| `src/components/finance/financial-classifications-admin.tsx` | 2 | 0 | 0 |
| `src/components/finance/fiscal-review-badges.tsx` | 1 | 0 | 0 |
| `src/components/finance/holder-reimbursements.tsx` | 1 | 0 | 0 |
| `src/components/finance/intake-inbox.tsx` | 32 | 4 | 0 |
| `src/components/finance/intake-instructions-panel.tsx` | 2 | 0 | 0 |
| `src/components/finance/intake-upload-button.tsx` | 8 | 0 | 0 |
| `src/components/finance/invoice-editor-dialog.tsx` | 7 | 2 | 0 |
| `src/components/finance/paid-with-control.tsx` | 4 | 0 | 0 |
| `src/components/finance/payment-cards-list.tsx` | 2 | 2 | 0 |
| `src/components/finance/purchase-duplicates-review.tsx` | 2 | 0 | 0 |
| `src/components/finance/purchase-editor-dialog.tsx` | 4 | 1 | 0 |
| `src/components/finance/recebimentos-panel.tsx` | 1 | 0 | 0 |
| `src/components/finance/reconcile-suggestions.tsx` | 1 | 0 | 0 |
| `src/components/finance/review-queue.tsx` | 5 | 0 | 0 |
| `src/components/finance/saft-import-dialog.tsx` | 1 | 0 | 0 |
| `src/components/finance/statement-periods-panel.tsx` | 1 | 0 | 0 |
| `src/components/finance/statement-view.tsx` | 1 | 0 | 0 |
| `src/components/finance/supplier-duplicates-review.tsx` | 1 | 1 | 0 |
| `src/components/home/my-actions-card.tsx` | 1 | 0 | 0 |
| `src/components/home/signature-projects.tsx` | 5 | 0 | 0 |
| `src/components/hr/BenefitDriveSyncCard.tsx` | 15 | 1 | 0 |
| `src/components/hr/SubmitExpenseDialog.tsx` | 2 | 0 | 0 |
| `src/components/hr/hours-bank-panel.tsx` | 1 | 0 | 0 |
| `src/components/hr/leave-change.tsx` | 2 | 0 | 0 |
| `src/components/hr/salary-importer.tsx` | 2 | 0 | 0 |
| `src/components/hr/wfh/request-wfh-dialog.tsx` | 2 | 0 | 0 |
| `src/components/marketing/action-form-dialog.tsx` | 2 | 0 | 0 |
| `src/components/marketing/briefings-card.tsx` | 1 | 0 | 0 |
| `src/components/marketing/carousels-card.tsx` | 1 | 0 | 0 |
| `src/components/marketing/clearance-sources.tsx` | 2 | 0 | 0 |
| `src/components/marketing/finished-reel-dialog.tsx` | 2 | 0 | 0 |
| `src/components/marketing/instagram-publish-controls.tsx` | 1 | 0 | 0 |
| `src/components/marketing/nudge-panel.tsx` | 1 | 0 | 0 |
| `src/components/marketing/planner-grid.tsx` | 4 | 1 | 0 |
| `src/components/marketing/post-approval-controls.tsx` | 5 | 0 | 0 |
| `src/components/marketing/press-kit-card.tsx` | 2 | 0 | 0 |
| `src/components/planner/gantt-print-button.tsx` | 5 | 5 | 0 |
| `src/components/products/image-field.tsx` | 1 | 0 | 0 |
| `src/components/products/library-browser.tsx` | 1 | 0 | 0 |
| `src/components/products/product-form-dialog.tsx` | 1 | 0 | 0 |
| `src/components/projects/allocation-editor.tsx` | 1 | 0 | 0 |
| `src/components/projects/contract-diff-card.tsx` | 1 | 0 | 0 |
| `src/components/projects/gantt-chart.tsx` | 5 | 2 | 0 |
| `src/components/projects/gantt-outline-column.tsx` | 1 | 0 | 0 |
| `src/components/projects/my-week-card.tsx` | 7 | 0 | 0 |
| `src/components/projects/notes/notes-list.tsx` | 1 | 0 | 0 |
| `src/components/projects/project-expense-dialog.tsx` | 2 | 1 | 0 |
| `src/components/projects/project-expenses-section.tsx` | 5 | 0 | 0 |
| `src/components/projects/project-pursuit-card.tsx` | 1 | 1 | 0 |
| `src/components/projects/timesheet-activity-cell.tsx` | 1 | 0 | 0 |
| `src/components/projects/timesheet-assistant-sheet.tsx` | 4 | 0 | 0 |
| `src/components/projects/week-draft-editor.tsx` | 2 | 0 | 0 |
| `src/components/projects/week-planning-board.tsx` | 3 | 0 | 0 |
| `src/components/projects/week-project-notes.tsx` | 4 | 0 | 0 |
| `src/components/psa-composer/block-settings-panel.tsx` | 22 | 3 | 0 |
| `src/components/psa-composer/composer-top-bar.tsx` | 1 | 1 | 0 |
| `src/components/psa-composer/paginated-preview.tsx` | 2 | 0 | 0 |
| `src/components/psa-composer/rich-text-editor.tsx` | 1 | 1 | 0 |
| `src/components/psa-composer/send-proposal-dialog.tsx` | 1 | 1 | 0 |
| `src/components/quotes/quote-construction-assistance-tab.tsx` | 6 | 6 | 0 |
| `src/components/quotes/quote-financial-summary-tab.tsx` | 4 | 2 | 0 |
| `src/components/quotes/quote-payment-schedule-tab.tsx` | 2 | 0 | 0 |
| `src/components/quotes/quote-planner-inspector.tsx` | 5 | 1 | 0 |
| `src/components/quotes/quote-project-billing-inspector.tsx` | 1 | 0 | 0 |
| `src/components/quotes/quote-time-based-settings-tab.tsx` | 2 | 0 | 0 |
| `src/components/quotes/quote-workflow-actions.tsx` | 1 | 0 | 0 |
| `src/components/quotes/retainer-monthly-readings.tsx` | 1 | 1 | 0 |
| `src/components/quotes/retainer-stage-editor.tsx` | 3 | 3 | 0 |
| `src/components/shell/AppRail.tsx` | 1 | 0 | 0 |
| `src/components/shell/ModuleTabs.tsx` | 1 | 0 | 0 |
| `src/components/ui/breadcrumb.tsx` | 2 | 0 | 0 |
| `src/components/ui/carousel.tsx` | 2 | 0 | 0 |
| `src/components/ui/dialog.tsx` | 1 | 0 | 0 |
| `src/components/ui/pagination.tsx` | 6 | 0 | 0 |
| `src/components/ui/sheet.tsx` | 1 | 0 | 0 |
| `src/components/ui/sidebar.tsx` | 5 | 0 | 0 |
| `src/routes/[.]lovable.oauth.consent.tsx` | 7 | 0 | 0 |
| `src/routes/_app.admin.backups.tsx` | 1 | 1 | 0 |
| `src/routes/_app.admin.company-settings.tsx` | 1 | 1 | 0 |
| `src/routes/_app.admin.imports.tsx` | 15 | 5 | 0 |
| `src/routes/_app.admin.permissions.tsx` | 2 | 0 | 0 |
| `src/routes/_app.admin.quotes-trash.tsx` | 1 | 0 | 0 |
| `src/routes/_app.crm.opportunities.$opportunityId.tsx` | 6 | 0 | 0 |
| `src/routes/_app.crm.quotes.$quoteId.tsx` | 2 | 0 | 0 |
| `src/routes/_app.finance.documents.$documentId.tsx` | 3 | 0 | 0 |
| `src/routes/_app.hr.aprovacoes.tsx` | 1 | 0 | 0 |
| `src/routes/_app.hr.beneficios.tsx` | 2 | 0 | 0 |
| `src/routes/_app.hr.colaborador.$id.tsx` | 1 | 0 | 0 |
| `src/routes/_app.hr.ferias.tsx` | 15 | 0 | 0 |
| `src/routes/_app.hr.resumo.tsx` | 5 | 2 | 0 |
| `src/routes/_app.hr.trabalho-remoto.analytics.tsx` | 1 | 0 | 0 |
| `src/routes/_app.inbox.index.tsx` | 1 | 0 | 0 |
| `src/routes/_app.index.tsx` | 1 | 0 | 0 |
| `src/routes/_app.marketing.actions.$actionId.tsx` | 1 | 0 | 0 |
| `src/routes/_app.marketing.bible.tsx` | 1 | 1 | 0 |
| `src/routes/_app.marketing.calendar.tsx` | 8 | 0 | 0 |
| `src/routes/_app.marketing.carousels.$id.tsx` | 6 | 1 | 0 |
| `src/routes/_app.marketing.index.tsx` | 1 | 0 | 0 |
| `src/routes/_app.marketing.posts.tsx` | 19 | 1 | 0 |
| `src/routes/_app.marketing.projects.$profileId.tsx` | 1 | 0 | 0 |
| `src/routes/_app.marketing.published.insights.tsx` | 1 | 1 | 0 |
| `src/routes/_app.marketing.questions.tsx` | 1 | 0 | 0 |
| `src/routes/_app.marketing.settings.tsx` | 1 | 1 | 0 |
| `src/routes/_app.nudges.$nudgeId.tsx` | 1 | 0 | 0 |
| `src/routes/_app.products.project.$projectId.tsx` | 1 | 0 | 0 |
| `src/routes/_app.projects.$projectId.tsx` | 18 | 0 | 0 |
| `src/routes/_app.projects.financials.tsx` | 1 | 0 | 0 |
| `src/routes/_app.projects.my-tasks.tsx` | 5 | 0 | 0 |
| `src/routes/_app.projects.timesheet.tsx` | 2 | 1 | 0 |
| `src/routes/_app.reports.billable.tsx` | 4 | 1 | 0 |
| `src/routes/_app.reports.business.tsx` | 2 | 1 | 0 |
| `src/routes/_app.reports.capacity.tsx` | 2 | 2 | 0 |
| `src/routes/_app.reports.health.tsx` | 8 | 2 | 0 |
| `src/routes/_app.reports.hours.tsx` | 1 | 0 | 0 |
| `src/routes/_app.tsx` | 2 | 0 | 0 |
| `src/routes/login.tsx` | 6 | 0 | 0 |

## Verificações
- `bun run test:i18n`: **13 testes**, paridade de 12 namespaces EN/PT e zero candidatos.
- Home: **11 regressões locais** aprovadas.
- Regressões Vitest: **25 testes** em títulos documentais, saúde da entrada, agrupamento de fornecedores e exportação contabilística.
- Match panel: **7 verificações**; **33 testes** de totais financeiros e **22 casos** de cláusulas de feriados; regressões salariais também aprovadas.
- Pré-visualização: último resultado **build OK**, sem erros runtime nas páginas verificadas.
- Navegação real no browser para `/finance/banking/reconciliation` com conta/movimento locais, e `/` com respostas locais. Todas as leituras de dados foram interceptadas; pedidos potencialmente mutáveis não chegaram ao serviço real. Nenhuma classificação, importação, confirmação ou eliminação foi executada.
- Idioma alterado apenas em memória no browser, sem guardar preferências reais.
- Reconciliação: conta e movimento fixture visíveis em PT/EN; o valor guardado −1234.56 mostra formatação local e as descrições permanecem iguais.
- Home: planeamento não aprovado local, menus e secções em PT/EN, sem mensagens de erro. A saudação pode usar a identidade já autenticada; não foi alterada nem tratada como fixture.

### Documento inalterado
A folha de oferta, montada com ficha salarial exclusivamente local, conserva o mesmo SHA-256 de texto normalizado em ambos os idiomas:

`e03439a10b43970a8f50fba64ed5036d1b6568c2710b26a687cf4cb6bfe0a412`

[Texto PT](i18n-batch6/document-pt-PT.txt) · [Texto EN](i18n-batch6/document-en.txt) · [Evidência](i18n-batch6/results.json)

### Capturas
- [Reconciliação PT](i18n-batch6/reconciliation-pt-PT.png) · [Reconciliação EN](i18n-batch6/reconciliation-en.png)
- [Início PT](i18n-batch6/home-pt-PT.png) · [Início EN](i18n-batch6/home-en.png)

## Remanescentes intencionais
IBAN/NIF/AT, KB/ms/km/€/km/€/h/h/d, formatos PDF/A3/A4, marcas Drive/Claude/Gemini, handle Instagram, nomes de variáveis/configuração, exemplos de números/documentos/UUID, tokens do editor e honoríficos guardados. A lista exata está em `scripts/i18n-allowlist.json`; só corresponde a texto completo no ficheiro e tipo especificados. Conteúdo editorial/documental, documentos de clientes, PDFs, emails e valores de categorias/fabricantes/localizações não foram traduzidos.

## Limites
Verificadas as duas páginas pedidas e a invariância documental; não foram testadas operações financeiras reais nem todas as combinações de filtros, permissões e dados em cada ecrã. O checker protege literais diretos e tem exclusões estreitas; dados dinâmicos/maps exigem revisão humana além da contagem.
