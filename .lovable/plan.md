# Item 5 — Equipa e acesso financeiro por projeto

## Âmbito e limites
**Só plano; implementação dependente de aprovação.** Sem migrações, alterações à aplicação ou dados reais. A leitura das políticas atuais falhou em 3 novembro 2026: o inventário abaixo é confirmado pelo código, tipos e migrações, não pela base de dados instalada. A limpeza do item 1 e a implementação do item 2 continuam bloqueadas pela ligação; não criar fixtures antes da limpeza e leitura zero.

Objetivo: Rita Saragossa pode ver todos os detalhes financeiros da Mint se autorizada nesse projeto, sem obter visibilidade financeira em Uralchem IV. Isto é um exemplo de configuração, **não uma atribuição a aplicar agora**. Preservar valores, documentos, horas, snapshots, proposta, baseline e conversão.

## O que existe hoje
- `pm_project_team`: `project_id`, `resource_id`, `role`; papéis `manager`, `coordinator`, `co_author`, `support` (gestor, coordenador, coautor, apoio). **Não há campo de gestor em `pm_projects`**: é uma linha `role=manager`. Unicidade pessoa/projeto/papel permite vários gestores/papéis; alocação ou horas históricas não provam gestão.
- «Gerir equipa» em `project-team-card.tsx` adiciona/remove pessoa/papel; `use-project-team.ts` escreve diretamente, sem switches. A política histórica `team_write` é mais ampla que admin: tem de impedir autoatribuição de gestor e privilégios.
- Identidade passa por recursos/colaboradores, por vezes email: confirmar ligação autenticada única, falhar fechado em ambiguidades.
- Permissões distinguem módulos, planeamento, `projects.view_financials`, margens/taxas e edição Finance; leitura não concede edição.
- `20261018093500_financial_read_boundaries.sql`: SELECT de `pm_invoices`/`pm_payment_schedule_items` para admin ou PSA com financeiro global/atribuído; ramo Finance limitado à entidade. Leitura de projeto já pode existir sem acesso ao módulo Finance. Não há quatro áreas; propostas/baselines/fornecedores conservam fallbacks legados. Tabelas mistas entregam campos monetários junto dos operacionais.

## Tabela pequena dentro do projeto
Expandir «Gerir equipa» para **Equipa e acessos**: pessoa, papel, quatro switches, origem do acesso e última alteração. Um registo de acesso por pessoa/projeto, independentemente de papéis duplicados. Papéis existentes preservados; novos colaboradores comuns aparecem como «Membro da equipa» sem renomear os enums históricos.

| Switch | Inclui | Não concede |
|---|---|---|
| **Financeiro** | Valor contratual, honorários e venda, Entrada/plano de recebimentos, faturas/recibos desse projeto e estado financeiro | Custos de horas, taxas/custos de fornecedores, módulo Finance, edição de valores ou emissão |
| **Orçamento e custo das horas** | Orçamento, consumo, custo planeado/real, snapshots de custo de horas, desvios e margens quando todos os seus componentes estão autorizados | Salários/HR, taxas globais da equipa, valores de outro projeto |
| **Despesas** | Lista financeira de despesas do projeto, montantes, reembolso/refaturação e comprovativos próprios desse projeto | Despesas da empresa, contas/cartões e extratos, aprovação/pagamento automático |
| **Honorários de fornecedores** | Honorários/custos/margens de fornecedores, serviços externos, pagamentos de fornecedores desse projeto | Histórico global do fornecedor ou de outras entidades/projetos |

Os switches são independentes. Um resumo que combina áreas só mostra as parcelas autorizadas; lucro/margem/total integrado não são calculados com dados ocultos nem apresentados como total completo. Despesas pessoais mantêm a exceção mínima existente para submissão/acompanhamento próprio, fora da lista financeira geral; não dá visibilidade das despesas alheias.

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

Inclui todos os 19 valores de TabKey, visíveis/retidos. Schedule/financial/rates/stream não têm botão, mas têm corpos acessíveis por ligação; materials comentado; planning sem corpo. Proteger navegação **e dados**, cabeçalho/painel/atalhos. Insights atualmente recebe invoices/budget/revenue/cost/profit sem guarda integral; global Gantt calcula/mostra custo/orçamento. Leitores atuais `useProjects/useProjectDetail/useAllStages` usam SELECT amplo e recursos aninhados.

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
- Documentos autorizados só do projeto, sem abrir fila OCR/extratos/outras entidades. Downloads com autorização renovada e URLs curtas. Prosa livre não será reescrita: rever notas/anexos com valores antes de expor a leitores sem Financeiro.

## Migração sem perder acesso autorizado
- Com ligação disponível, inventariar permissões/políticas/equipas e apresentar matriz pessoa/projeto/área antes→depois. Preservar acessos legítimos com grants explícitos de origem legacy; APIs demasiado abertas não são autorização legítima.
- Defaults OFF podem conflituar com permissões globais antigas: listar perdas/exceções, identidades ambíguas e gestores múltiplos para aprovação admin. Não atribuir Rita/Mint agora.
- Migrar leitores antes do corte atómico. Após aprovação da matriz, regras novas são autoritativas: não manter OR legado que torne OFF ineficaz. Até corte, regras anteriores mantêm-se; rollback de autorização não altera valores/história.

## Ficheiros e migrações previstos
- Migrações novas: equipa/acessos/auditoria/helpers; projeções/RLS/guardas; corte revisto de compatibilidade. Mirrors idênticos `drizzle/migrations`/`supabase/migrations`, tipos regenerados; não alterar migrações antigas ou conversão.
- Equipa: `src/lib/projects/use-project-team.ts`, `src/components/projects/project-team-card.tsx`; novos `project-access.ts`, `use-project-access.ts` e tabela/ações protegidas.
- Projeto: `src/routes/_app.projects.$projectId.tsx`; hooks Projects `use-planner`, `use-project-planner-adapter`, `use-contract-baseline`, `use-stage-budget-control`, `use-project-entry-figures`, `use-pursuit`, `use-invoices`, `use-project-expenses`, `use-external-services`, `use-suppliers`.
- QuoteGantt/QuotePlanningTab/inspetores e componentes financeiros de faturação, despesas, fornecedores, resumo; adaptador Incoming e helper do item 2.
- `src/routes/_app.index.tsx`, `_app.projects.{index,gantt,financials,forecast,insights,resources}.tsx`, `_app.projects.$projectId.allocations.tsx`; pesquisa e exports associados.
- `src/lib/reports/use-{business-performance,budget-consumption,estimate-vs-actual,supplier-stages,capacity-forecast}.ts`; leitores Finance/CRM de projetos, PDFs/`use-download-invoice-pdf.ts`. Cálculos puros preservados.
- EN/PT `projects.json`/common/glossary, AGENTS e relatório. Inventário final de chamadas fecha a lista antes do corte.

## Testes após aprovação
Só fixtures após limpeza item 1/leitura zero. Gestor Mint-cópia quatro ON versus Uralchem-cópia OFF; novo gestor Financeiro ON; membro OFF; Finance global sem admin; admin. Testar API direta/RPC/downloads, todos os separadores/deep links, homepage/Gantt/pesquisa/reports/exports, entidades, agregados e revogação. Gestor pode alterar data, não montante/IVA/termos/status/switches/próprio papel; freeze bloqueia datas. Comparar acessos e hashes antes/depois; capturas PT/EN, limpar/provar zero. Nada executado neste passo.
