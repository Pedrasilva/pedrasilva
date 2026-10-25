# Tradução — lote 5: RH, Snapshot/salários e Administração

## Resultado
- Âmbito solicitado: **558 → 69 ocorrências** do checker AST (489 resolvidas; 80 ficheiros auditados). Total atual do repositório: **481**.
- UI em EN e pt-PT, plurais/interpolações e formatos locais; valores guardados, enums, cálculo salarial, aprovações e operações não alterados.
- Sem alterações de base de dados, migrações ou registos reais. Finanças pendentes intactas.
- `npm run test:i18n`: **11 testes passaram**, paridade dos 12 namespaces e ratchet sem novas assinaturas. Baseline apenas reduzido, nunca refrescado para aceitar dívida.
- `bun scripts/test-salary-vbg.mjs`: todas as verificações de cálculo salarial aprovadas. Último sinal da pré-visualização: **build OK**, sem erros no browser de teste.

## Terminologia e estrutura
- Glossário canónico para vencimento bruto tributável, Segurança Social, retenção na fonte de IRS, Subsídio de Alimentação/Férias/Natal e contribuição patronal. Na primeira ocorrência assinalada da simulação EN, rótulo inglês + termo oficial PT.
- `src/lib/hr/ui-format.ts`: formatos apenas de interface; `src/lib/hr/ui-terms.ts`: resolução de termos e rótulos de modos de subsídios, mantendo valores dos enums.
- Mapas de permissões traduzidos apenas na exibição; o catálogo e regras de autorização permanecem intactos. Validação do novo colaborador resolve idioma no momento de uso; grupos Admin resolvidos ao renderizar.
- Metadados próprios adicionados às páginas do âmbito que não os tinham.

## Documento independente e prova de hash
A folha `offer-summary-sheet.tsx` é um documento para candidatos, não chrome do editor: recebeu exclusão explícita no allowlist e idioma português independente do idioma da UI. Mantém fórmulas, formatação salarial original e dados recebidos.

O teste inicial revelou que a folha herdava o idioma da UI; foi separado antes da conclusão. O teste final da fixture em PT/EN produziu o mesmo SHA-256:

`6acdfec9b6e2a26ba2f037c0016f4c83e7d55e24df470fa22cb6516ff787b143`

`documentUnchanged: true`. Nenhuma impressão, exportação ou gravação foi executada.

## Verificação com fixtures locais
- `/hr/ferias?scope=calendario`: página real em sessão autenticada, resposta de colaborador, pedido aprovado e permissões substituídas apenas no navegador. Nome fixture presente, calendários PT/EN verificados visualmente.
- Simulação: componentes reais `SimulationTab`/`PayrollSimulationCard` montados com snapshot local, callback de edição bloqueado. Valores e input idênticos nos dois idiomas; termos e moeda mudam na apresentação.
- Pedidos à Data API foram interceptados; inclusive RPCs de leitura servidos localmente. Nenhum pedido de alteração passou para o servidor. Nenhum colaborador ou pedido real criado/editado/apagado.
- Capturas: [férias PT](i18n-batch5/leave-pt-PT.png), [férias EN](i18n-batch5/leave-en.png), [simulação PT](i18n-batch5/payroll-pt-PT.png), [simulação EN](i18n-batch5/payroll-en.png). Evidência: `docs/i18n-batch5/results.json`.
- Cobertura browser: férias e simulação, não cada ação de Administração/RH. Nenhuma ação com efeitos foi exercitada.

## Remanescentes intencionais
As 69 ocorrências restantes incluem comparações/identificadores de enums (não texto apresentado), símbolos (`h`, `x`, `<`, `>`), marcas/exemplos de UUID, nomes reais de pastas Google Drive (`HR Benefits`, `PSA Hub Archive`), nomes de configurações e descrição estrutural de horários de importação. Não se traduzem valores armazenados ou caminhos operacionais. Não se adicionaram exclusões genéricas para esconder UI.

## Contagens por ficheiro
| Ficheiro | Antes | Depois |
|---|---:|---:|
| `src/components/NewCollaboratorDialog.tsx` | 24 | 0 |
| `src/components/ResumoCompare.tsx` | 0 | 0 |
| `src/components/SnapshotForm.tsx` | 55 | 0 |
| `src/components/admin/admin-reset-projects-tool.tsx` | 0 | 0 |
| `src/components/admin/backup-inspector-dialog.tsx` | 21 | 0 |
| `src/components/hr/BenefitDriveSyncCard.tsx` | 27 | 15 |
| `src/components/hr/BenefitExpenseTimeline.tsx` | 0 | 0 |
| `src/components/hr/BenefitsOverviewTab.tsx` | 0 | 0 |
| `src/components/hr/CommercialRoleCard.tsx` | 0 | 0 |
| `src/components/hr/DeleteExpenseDialog.tsx` | 0 | 0 |
| `src/components/hr/ExpenseFilterBar.tsx` | 0 | 0 |
| `src/components/hr/FinanceBackfillCard.tsx` | 1 | 0 |
| `src/components/hr/MonthlyLiquidityCard.tsx` | 0 | 0 |
| `src/components/hr/PaymentLedgerBackfillCard.tsx` | 0 | 0 |
| `src/components/hr/RejectExpenseDialog.tsx` | 0 | 0 |
| `src/components/hr/SubmitExpenseDialog.tsx` | 2 | 2 |
| `src/components/hr/archive-collaborator-dialog.tsx` | 0 | 0 |
| `src/components/hr/availability/absence-legend.tsx` | 0 | 0 |
| `src/components/hr/availability/availability-balances.tsx` | 0 | 0 |
| `src/components/hr/availability/availability-grid.tsx` | 0 | 0 |
| `src/components/hr/availability/availability-summary.tsx` | 0 | 0 |
| `src/components/hr/availability/availability-year.tsx` | 0 | 0 |
| `src/components/hr/benefit-pessoal-mapping.tsx` | 0 | 0 |
| `src/components/hr/collaborators-table.tsx` | 0 | 0 |
| `src/components/hr/dashboard/HrAlertList.tsx` | 0 | 0 |
| `src/components/hr/dashboard/HrCapacityCard.tsx` | 0 | 0 |
| `src/components/hr/dashboard/HrKpiCard.tsx` | 0 | 0 |
| `src/components/hr/dashboard/HrRecentActivityFeed.tsx` | 0 | 0 |
| `src/components/hr/hours-bank-panel.tsx` | 3 | 1 |
| `src/components/hr/leave-change.tsx` | 2 | 2 |
| `src/components/hr/offer-summary-sheet.tsx` | 0 | 0 |
| `src/components/hr/restore-collaborator-dialog.tsx` | 0 | 0 |
| `src/components/hr/salary-importer.tsx` | 3 | 2 |
| `src/components/hr/vacation-opening-editor.tsx` | 0 | 0 |
| `src/components/hr/wfh/late-request-chip.tsx` | 0 | 0 |
| `src/components/hr/wfh/request-wfh-dialog.tsx` | 2 | 2 |
| `src/components/hr/wfh/wfh-profile-card.tsx` | 0 | 0 |
| `src/components/hr/wfh/wfh-status-chip.tsx` | 0 | 0 |
| `src/components/hr/year-leave-calendar.tsx` | 0 | 0 |
| `src/components/snapshot/BrutoTab.tsx` | 0 | 0 |
| `src/components/snapshot/HighlightCard.tsx` | 0 | 0 |
| `src/components/snapshot/LiquidoTab.tsx` | 0 | 0 |
| `src/components/snapshot/PayrollSimulationCard.tsx` | 26 | 0 |
| `src/components/snapshot/SalaryDonut.tsx` | 0 | 0 |
| `src/components/snapshot/SalarySimulatorHero.tsx` | 7 | 0 |
| `src/components/snapshot/SimulationTab.tsx` | 35 | 0 |
| `src/components/snapshot/SnapshotMirrorPanel.tsx` | 0 | 0 |
| `src/components/snapshot/ValueChainSummary.tsx` | 0 | 0 |
| `src/components/snapshot/inputs.tsx` | 0 | 0 |
| `src/routes/_app.admin.access.tsx` | 1 | 0 |
| `src/routes/_app.admin.backups.tsx` | 34 | 1 |
| `src/routes/_app.admin.calendar.tsx` | 0 | 0 |
| `src/routes/_app.admin.company-settings.tsx` | 2 | 1 |
| `src/routes/_app.admin.cost-rates.tsx` | 5 | 0 |
| `src/routes/_app.admin.imports.tsx` | 33 | 15 |
| `src/routes/_app.admin.index.tsx` | 3 | 0 |
| `src/routes/_app.admin.permissions.tsx` | 42 | 2 |
| `src/routes/_app.admin.projects.tsx` | 0 | 0 |
| `src/routes/_app.admin.proposal-images.tsx` | 0 | 0 |
| `src/routes/_app.admin.proposal-roles.tsx` | 0 | 0 |
| `src/routes/_app.admin.quotes-trash.tsx` | 1 | 1 |
| `src/routes/_app.hr.admin.tsx` | 81 | 0 |
| `src/routes/_app.hr.aprovacoes.tsx` | 1 | 1 |
| `src/routes/_app.hr.beneficios.tsx` | 34 | 2 |
| `src/routes/_app.hr.colaborador.$id.tsx` | 4 | 1 |
| `src/routes/_app.hr.colaboradores.tsx` | 0 | 0 |
| `src/routes/_app.hr.dias-uteis.tsx` | 0 | 0 |
| `src/routes/_app.hr.disponibilidade.tsx` | 0 | 0 |
| `src/routes/_app.hr.ferias.tsx` | 74 | 15 |
| `src/routes/_app.hr.index.tsx` | 0 | 0 |
| `src/routes/_app.hr.minha-ficha.tsx` | 0 | 0 |
| `src/routes/_app.hr.resumo.tsx` | 6 | 5 |
| `src/routes/_app.hr.subsidio-alimentacao.tsx` | 0 | 0 |
| `src/routes/_app.hr.trabalho-remoto.analytics.tsx` | 1 | 1 |
| `src/routes/_app.hr.trabalho-remoto.definicoes.tsx` | 0 | 0 |
| `src/routes/_app.hr.trabalho-remoto.historico.tsx` | 0 | 0 |
| `src/routes/_app.hr.trabalho-remoto.index.tsx` | 0 | 0 |
| `src/routes/_app.hr.trabalho-remoto.tsx` | 0 | 0 |
| `src/routes/_app.hr.tsx` | 0 | 0 |
| `src/routes/_app.hr.valor-bo.tsx` | 28 | 0 |
