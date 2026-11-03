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
Inclui entradas visíveis e caminhos antigos por `?tab=`; nenhum caminho oculto fica sem verificação.

| Separador / chave atual | Regra proposta |
|---|---|
| Visão geral / `overview` | Datas, estado, cliente e equipa operacionais; valor contratual/faturado requer Financeiro; consumo/custo exige Orçamento; despesas e fornecedores só com os switches respetivos |
| Insights / `insights` | Horas/progresso sem dinheiro seguem permissões operacionais; receita requer Financeiro; custos/pursuit/orçamento requerem Orçamento; margens combinadas exigem todas as áreas usadas |
| Avença / `ap` | Datas, meses e horas operacionais; mensalidade de venda requer Financeiro; custo e consumo requerem Orçamento |
| Aprovações / `approvals` | Mantém controlo admin atual; uma permissão de visibilidade não concede poder de aprovação |
| Notas / `notes` | Permissões operacionais existentes; não adicionar nem procurar automaticamente conteúdo financeiro oculto |
| Despesas / `expenses` | Lista geral só com Despesas; acompanhamento próprio mínimo separado conforme regras existentes |
| Faturação / `billing` | Financeiro permite leitura dos documentos só do projeto dentro de Projects; emissão/edição continuam Finance. Não exigir acesso ao módulo Finance para esta leitura |
| Arquitetura / `architecture` | Atual superfície é composição financeira/honorários: Financeiro; custos/orçamento interiores com Orçamento; não confundir com o Gantt operacional |
| Fornecedores / `consultants` | Honorários de fornecedores; identidade operacional só em seletores onde necessária e autorizada |
| Entrada / `incoming` | Financeiro; integra a projeção operacional do item 2 |
| Saída / `outgoing` | Filtrar por natureza: fornecedores exigem Honorários de fornecedores; despesas exigem Despesas; não entregar toda a saída com um único switch |
| Plano de pagamentos / `paymentSchedule` | Entrada com Financeiro; saídas com switches próprios; ocultar totalmente se não há parcelas autorizadas |
| Resumo financeiro / `financialSummary` | Parcelas autorizadas, sem totais/margens que revelem áreas negadas |
| Calendário / `schedule` | QuoteGantt/QuotePlanningTab operacionais; retirar honorários, custos e valores do inspetor conforme área; datas e dependências conservam regras de edição próprias |
| Financeiro antigo / `financial` | Mesma proteção por parcelas que Resumo financeiro, inclusive por ligação direta |
| Materiais antigo / `materials` | Conteúdo atualmente comentado; serviços externos com Honorários de fornecedores e despesas com Despesas; manter registos históricos |
| Taxas antigo / `rates` | Atualmente placeholder; se reativado, apenas taxas específicas autorizadas por Orçamento, sem acesso implícito às taxas globais |
| Atividade antiga / `stream` | Operacional; eventos estruturados financeiros filtrados antes da entrega |
| `planning` | Chave declarada sem painel renderizado: rejeitar/normalizar para o calendário permitido, sem criar outro Gantt |

Cabeçalho, painel lateral e atalhos usam a mesma resposta de acesso. Uma ligação direta a área negada não monta o painel nem carrega seus dados.

## Regras, defaults e administração
- Acesso ao módulo continua nas permissões existentes. Uma concessão neste projeto não abre Finance, CRM ou Reports; quem já entra num módulo só recebe os valores de projetos autorizados.
- Luis mantém acesso por autoridade admin; Tatiana por permissão global financeira protegida, sem admin. Confirmar as atribuições atuais quando a ligação voltar: nenhum nome, email ou UUID hardcoded, nenhum privilégio em armazenamento do navegador.
- Acesso global completo é uma capacidade explícita auditável; não presumir que qualquer permissão de leitura Finance dá acesso irrestrito às quatro áreas.
- Novo gestor: Financeiro ON; outros switches OFF salvo decisão admin. Novo membro/coordenador/coautor/apoio: os quatro OFF. Para o exemplo Rita/Mint com todos os detalhes, admin liga as quatro áreas; Uralchem mantém OFF se não houver autorização existente revista.
- Só autoridade admin altera switches e atribui/substitui gestor, evitando autoelevação por «Gerir equipa». Finance não ganha poder de administrar. Confirmar que a autoridade admin destinada a Luis não foi atribuída a terceiros antes da ativação; não criar uma exceção por identidade hardcoded.
- Um gestor principal nomeado por projeto para novos/registos revistos. Não escolher nem remover gestores históricos automaticamente; projetos sem gestor ou com vários surgem na pré-visualização para decisão admin, sem bloquear o calendário existente.
- Desligar Financeiro revoga imediatamente leitura correspondente e edição de datas pelo gestor. Registar antes/depois, motivo, autor e hora de acessos/papéis e datas; atualizar caches e impedir reutilização de downloads já autorizados por links duradouros.

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
Com ligação disponível: inventário read-only de utilizadores/permissões/equipas/políticas atuais e matriz antes→depois por pessoa/projeto/área. Preservar acessos legítimos com concessões explícitas de origem `legacy`; não inferir direitos por alocação histórica nem por uma API anteriormente demasiado aberta.

Pré-visualizar conflitos: novos defaults OFF versus permissões antigas globais, gestores múltiplos, identidade ambígua e acessos que seriam removidos. Admin aprova matriz antes do corte; **não manter OR global legado em produção**, porque um switch OFF deixaria de negar. Até ativação atómica, permissões anteriores permanecem; depois as novas regras são autoritativas com exceções globais explícitas. Rollback repõe versão de autorização, não valores financeiros. Não atribuir Rita/Mint nem outras equipas neste passo.

## Ficheiros e migrações previstos
- Migrações novas: equipa/acessos/auditoria/helpers; projeções/RLS/guardas; corte revisto de compatibilidade. Mirrors idênticos `drizzle/migrations`/`supabase/migrations`, tipos regenerados; não alterar migrações antigas ou conversão.
- Equipa: `src/lib/projects/use-project-team.ts`, `src/components/projects/project-team-card.tsx`; novos `project-access.ts`, `use-project-access.ts` e tabela/ações protegidas.
- Projeto: `src/routes/_app.projects.$projectId.tsx`; hooks Projects `use-planner`, `use-project-planner-adapter`, `use-contract-baseline`, `use-stage-budget-control`, `use-project-entry-figures`, `use-pursuit`, `use-invoices`, `use-project-expenses`, `use-external-services`, `use-suppliers`.
- QuoteGantt/QuotePlanningTab/inspetores e componentes financeiros de faturação, despesas, fornecedores, resumo; adaptador Incoming e helper do item 2.
- `src/routes/_app.index.tsx`, `_app.projects.{index,gantt,financials,forecast,insights,resources}.tsx`, `_app.projects.$projectId.allocations.tsx`; pesquisa e exports associados.
- `src/lib/reports/use-{business-performance,budget-consumption,estimate-vs-actual,supplier-stages,capacity-forecast}.ts`; leitores Finance/CRM de projetos, PDFs/`use-download-invoice-pdf.ts`. Cálculos puros preservados.
- EN/PT `projects.json`/common/glossary, AGENTS e relatório. Inventário final de chamadas fecha a lista antes do corte.

## Testes após aprovação
Só fixtures após limpeza item 1 e leitura zero. Gestor Mint-cópia com quatro ON versus Uralchem-cópia OFF; gestor novo Financeiro ON; membro quatro OFF; Tatiana-like global sem admin; Luis-like admin. Testar APIs diretas/RPCs/downloads, todos os separadores e `?tab=`, homepage/Gantt/pesquisa/reports/exports, isolamento de entidades, agregados sem fugas e revogação/caches. Gestor autorizado altera data, não montante/IVA/termos/status, nem próprios switches/papel. Datas congeladas não editáveis. Comparar permissões antes/depois e hashes financeiros/contratuais, capturas PT/EN, apagar fixtures e comprovar zero. Nenhum destes testes foi executado neste passo.