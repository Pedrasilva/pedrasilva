# Item 5 — Equipa e acesso financeiro por projeto

## Âmbito
Só plano, sem alterar aplicação ou dados. Ligação indisponível: inventário do código, políticas instaladas por confirmar. Item 1 limpeza e item 2 implementação continuam pendentes. Rita/Mint versus Uralchem é exemplo, não atribuição. Preservar finanças, horas, documentos e baseline.

## O que existe hoje
- pm_project_team(project_id, resource_id, role): manager/coordinator/co_author/support. Gestor é role=manager; pm_projects não tem campo de gestor. Unicidade pessoa/projeto/papel permite vários gestores; alocação/histórico não provam gestão.
- ProjectTeamCard/«Gerir equipa» adiciona/remove diretamente via use-project-team; sem switches. team_write histórico é mais amplo que admin: evitar autoatribuição de manager.
- Identidade recursos/colaboradores inclui helpers por email: confirmar associação autenticada única, falhar fechado em ambiguidades.
- Permissões separam módulos, planeamento, financeiro/margens/taxas e escrita Finance. Migração 20261018093500_financial_read_boundaries protege pm_invoices/pm_payment_schedule_items: admin ou PSA com financeiro global/atribuído; ramo Finance limitado à entidade. Leitura do projeto não exige módulo Finance.
- Sem quatro áreas hoje; propostas/baselines/fornecedores têm fallbacks legados e tabelas mistas entregam campos monetários. Políticas instaladas aguardam leitura.

## Equipa
«Gerir equipa»: pessoa, papel, quatro switches e auditoria. Um acesso por pessoa/projeto; «Membro da equipa» para novos membros, sem renomear enums.

| Switch | Conteúdo |
|---|---|
| Financeiro | Contrato, honorários/venda, Entrada, faturas/recibos e estado; não custos, fornecedores ou edição/emissão |
| Orçamento e custo das horas | Orçamento/consumo, custos planeados/reais/snapshots, desvios; não salários/HR ou taxas globais |
| Despesas | Despesas gerais do projeto, reembolso/refaturação e comprovativos; não despesas de empresa/extratos/pagamento |
| Honorários de fornecedores | Custos/honorários/margens e saídas de fornecedores; não histórico global ou outras entidades |

### Todos os separadores da página
| Separador / chave | Área necessária |
|---|---|
| Visão geral / overview | Operacional livre dentro do acesso Projects; contrato/faturado: Financeiro; consumo/custo: Orçamento |
| Insights / insights | Horas/progresso operacionais; receita: Financeiro; custo/pursuit: Orçamento; margens exigem componentes autorizados |
| Avença / ap | Meses/horas operacionais; mensalidade venda: Financeiro; custo/consumo: Orçamento |
| Aprovações / approvals | Admin atual; switches não concedem aprovação |
| Notas / notes | Regras operacionais atuais; rever anexos/prosa com valores, sem reescrever documentos |
| Despesas / expenses | Despesas para lista geral; acompanhamento próprio mínimo separado |
| Faturação / billing | Financeiro dá leitura só do projeto sem módulo Finance; edição/emissão continuam Finance |
| Arquitetura / architecture | Atual painel de composição/honorários: Financeiro; custos internos: Orçamento |
| Fornecedores / consultants | Honorários de fornecedores; revenda ao cliente também Financeiro |
| Entrada / incoming | Financeiro; projeção item 2 |
| Saída / outgoing | Fornecedores: Honorários de fornecedores; despesas: Despesas; filtrar linhas |
| Plano pagamentos / paymentSchedule | Entrada: Financeiro; saídas por natureza; sem parcelas autorizadas, ocultar |
| Resumo financeiro / financialSummary | Por parcelas; totais/margens só com todos os componentes autorizados |
| Calendário / schedule | Datas/dependências operacionais; valores por área, incluindo inspetor |
| Financeiro antigo / financial | Mesma proteção do Resumo, também por ligação direta |
| Materiais antigo / materials | Corpo comentado; se reativado, fornecedores/despesas conforme natureza |
| Taxas antigo / rates | Placeholder; futuras taxas específicas por Orçamento, não catálogo global |
| Atividade antiga / stream | Operacional, eventos financeiros filtrados no servidor |
| planning | Chave sem painel: normalizar para calendário permitido |

19 chaves completas. Inclui corpos antigos acessíveis por ligação, não só navegação. Proteger também cabeçalho/painel/atalhos. Insights recebe valores sem guarda integral; global Gantt mostra custo/orçamento; useProjects/useProjectDetail/useAllStages fazem SELECT amplo.

## Defaults e administração
- Luis: autoridade admin protegida; Tatiana: capacidade global financeira explícita, sem admin. Confirmar atribuições atuais; nunca nomes/emails/IDs hardcoded. Só admin muda switches ou nomeia gestor, evitando autoelevação pelas atuais escritas de equipa.
- Novo gestor: Financeiro ON; restantes OFF salvo decisão admin. Novo membro/coordenador/coautor/apoio: quatro OFF. Rita/Mint com todos os detalhes exige quatro ON; este exemplo não será aplicado sem autorização.
- Módulos seguem permissões existentes: grants do projeto não abrem Finance/CRM/Reports. Desligar Financeiro também retira edição de datas ao gestor. Revogar caches e links de documentos; auditar acessos/papéis com autor/hora/motivo.
- Usar um gestor principal comprovado em projetos novos/revistos. Não eliminar ou escolher gestores históricos múltiplos; apresentar conflitos ao admin.
- Switches independentes: lucro/margem/total integrado só com todas as parcelas autorizadas, sem zeros para custos ocultos. Despesas próprias mantêm exceção mínima de submissão/acompanhamento, não lista geral.

## Desenho técnico e proteção real
- Tabela aditiva `pm_project_person_access`: projeto/pessoa, quatro booleanos, proveniência e revisão; auditoria append-only de autor/hora/motivo/antes/depois. Só ação admin escreve acessos ou atribui gestor. Grants/RLS/revoke TRUNCATE; roles globais continuam separados dos perfis.
- Helper único `can_view_project_area(project_id, area)`: identidade autenticada única, PSA/entidade, projeto e exceção global explícita. Nunca confundir alocação histórica com gestor. Predicados sem recursão RLS.
- Item 2: `can_edit_project_payment_dates(project_id)` aceita Finance autorizado OU gestor desse projeto com Financeiro ON. Somente overrides/limpeza/marco/ligação; nunca amount/VAT/terms/billing_status. Auditoria e freeze mantidos.
- RLS/RPCs por projeto/área em tabelas financeiras, filhos, baselines e anexos; fechar fallbacks permissivos antigos. Nova política OR não restringe a anterior.
- **RLS não oculta colunas:** retirar SELECT amplo de tabelas mistas (`pm_projects`, `pm_stages`, propostas, horas) e migrar para projeções operacionais explícitas e projeções monetárias autorizadas. Nada de `SELECT *`, whole-row JSON ou snapshots financeiros para leitores operacionais. Ações aceitam apenas campos permitidos; funções privilegiadas verificam chamador/área dentro do handler.
- Taxas/custos históricos mantêm snapshots bloqueados; não entregar salários ou taxas globais que permitam reconstruir custos negados.
- Homepage, global Gantt, pesquisa, reports, forecasts, exports/PDFs e funções privilegiadas filtram **antes de agregar/entregar**, não depois no browser. Não mostrar total completo baseado em parcelas ocultas nem diferenças dedutíveis.
- Documentos só do projeto, sem OCR/extratos/outras entidades; downloads reautorizados. Rever notas/anexos com valores; não reescrever prosa.

## Migração sem perder acesso autorizado
- Com ligação disponível, inventariar permissões/políticas/equipas e apresentar matriz pessoa/projeto/área antes→depois. Preservar acessos legítimos com grants explícitos de origem legacy; APIs demasiado abertas não são autorização legítima.
- Defaults OFF podem conflituar com permissões globais antigas: listar perdas/exceções, identidades ambíguas e gestores múltiplos para aprovação admin. Não atribuir Rita/Mint agora.
- Migrar leitores antes do corte atómico. Após aprovação da matriz, regras novas são autoritativas: não manter OR legado que torne OFF ineficaz. Até corte, regras anteriores mantêm-se; rollback de autorização não altera valores/história.

## Ficheiros e migrações
- Novas migrações: equipa/acessos/auditoria/helpers; projeções/RLS/guardas; corte de compatibilidade aprovado. Mirrors idênticos drizzle/migrations e supabase/migrations; tipos regenerados. Não alterar conversão.
- Equipa: src/lib/projects/use-project-team.ts, src/components/projects/project-team-card.tsx; novos project-access.ts/use-project-access.ts e tabela/ações protegidas.
- src/routes/_app.projects.$projectId.tsx; hooks Projects use-planner, use-project-planner-adapter, use-contract-baseline, use-stage-budget-control, use-project-entry-figures, use-pursuit, use-invoices, use-project-expenses, use-external-services, use-suppliers.
- QuoteGantt/QuotePlanningTab/inspetores e componentes Finance/Projects; Incoming/helper item 2. Projetos usam projeções operacionais/baseline autorizado, não acesso à proposta inteira.
- src/routes/_app.index.tsx e _app.projects.{index,gantt,financials,forecast,insights,resources}.tsx, allocations; dashboard financial-kpi-strip/project-scorecard/project-health-table/project-value-chart.
- src/lib/reports/use-{business-performance,budget-consumption,estimate-vs-actual,supplier-stages,capacity-forecast}.ts; leitores Finance/CRM/PDF e use-download-invoice-pdf.ts. Cálculos puros intactos.
- EN/PT projects.json/common/glossary, AGENTS, relatório. Pesquisa e exports não foram localizados exaustivamente: rastrear antes de declarar cobertura completa.

## Testes após aprovação
Fixtures só após limpeza/leitura zero: gestor com ON num projeto/OFF noutro, defaults gestor/membro, Finance global sem admin, admin. APIs/RPCs/downloads, tabs/deep links, Gantt/home/pesquisa/reports/exports, entidades/agregados/revogação. Data autorizada versus montante/IVA/termos/status/switches negados; freeze. Comparar acessos/hashes, capturas PT/EN, limpar/provar zero. Não executados agora.
