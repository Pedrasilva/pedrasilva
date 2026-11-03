# Item 5 — Equipa e acesso financeiro por projeto

## Âmbito e limites
**Só plano; implementação dependente de aprovação.** Sem migrações, alterações à aplicação ou dados reais. A leitura das políticas atuais falhou em 3 novembro 2026: o inventário abaixo é confirmado pelo código, tipos e migrações, não pela base de dados instalada. A limpeza do item 1 e a implementação do item 2 continuam bloqueadas pela ligação; não criar fixtures antes da limpeza e leitura zero.

Objetivo: Rita Saragossa pode ver todos os detalhes financeiros da Mint se autorizada nesse projeto, sem obter visibilidade financeira em Uralchem IV. Isto é um exemplo de configuração, **não uma atribuição a aplicar agora**. Preservar valores, documentos, horas, snapshots, proposta, baseline e conversão.

## O que existe hoje
- `pm_project_team`: pessoa por `resource_id`, projeto por `project_id`, papel por `role`; papéis existentes `manager`, `coordinator`, `co_author`, `support` (gestor de projeto, coordenador, coautor, apoio). Não existe um campo de gestor em `pm_projects`; a gestão é representada por linhas `role = manager`.
- A unicidade atual é pessoa/projeto/papel: pode haver vários gestores e uma pessoa com vários papéis. Pessoas alocadas aparecem separadamente; uma alocação ou horas históricas não provam que alguém é gestor.
- «Gerir equipa» já existe em `project-team-card.tsx`, com adicionar/remover pessoa e papel, mas sem tabela de acessos. Os hooks escrevem diretamente na equipa. A política histórica `team_write` permite mais do que administradores: tem de ser revista, pois permitir autoatribuir `manager` passaria a conceder poderes financeiros.
- Identidade atual usa recursos/colaboradores e helpers de associação ao utilizador, alguns por email. Antes de ativar acesso, confirmar correspondência única autenticada; associações ambíguas ficam por resolver, nunca escolher a primeira pessoa encontrada.
- Permissões distinguem acesso a Projects, planeamento, `projects.view_financials`, margens/taxas e acesso/edição de Finance. Ver um valor não implica poder editá-lo.
- A migração `20261018093500_financial_read_boundaries.sql` protege SELECT de `pm_invoices` e `pm_payment_schedule_items`: administrador ou colaborador PSA com permissão financeira global/atribuída; conserva um ramo Finance limitado à entidade. Já é possível leitura financeira de projeto sem entrar no módulo Finance.
- Não existe o recorte por quatro áreas. Outros caminhos legados de propostas, fornecedores e baselines usam regras mais abrangentes. `pm_projects`, `pm_stages`, propostas e entradas de horas misturam campos operacionais e monetários; ocultar um separador não impede a leitura direta destes campos.

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
1. **Armazenamento aditivo:** `pm_project_person_access` (project_id, resource_id, quatro booleanos, proveniência, revisão e auditoria); principal manager pode referenciar um membro comprovado da equipa. Não guardar roles globais em perfis. Nova tabela de auditoria append-only; grants/RLS/revoke TRUNCATE, escrita só por ação admin.
2. **Helpers únicos:** `can_view_project_area(project_id, area)` e gestão de acesso protegida. Validar identidade, PSA/entidade, acesso operacional ao projeto e exceção global explícita; não reutilizar «assigned» como prova de gestor. Predicados sem recursão RLS.
3. **Item 2:** `can_edit_project_payment_dates(project_id)` = autorização Finance de escrita existente OU gestor comprovado do projeto com Financeiro ON e acesso Projects. Aceita apenas override/limpeza/marco/ligação de fase; não concede amount/VAT/terms/billing_status. Congelamento e auditoria permanecem obrigatórios.
4. **Tabelas exclusivamente financeiras:** políticas e RPCs exigem a área e projeto corretos, incluindo filhos, anexos, baselines, fornecedores e propostas convertidas ligadas. Fechar fallbacks permissivos antigos; uma nova política OR não serve para restringir a anterior.
5. **Tabelas mistas:** RLS filtra linhas, não colunas. Retirar SELECT amplo de bases mistas e expor projeções operacionais com colunas explícitas mais projeções financeiras por área. Migrar todos os consumidores antes do corte; nenhum `SELECT *`, whole-row JSON ou snapshot financeiro entregue ao leitor operacional. Projeções privilegiadas mínimas validam o chamador e a área dentro da função; não usar owner-bypass sem verificação. Escritas por ações com lista de campos permitidos.
6. **Taxas/custos:** custos históricos continuam snapshots bloqueados; visibilidade não altera cálculo. Não devolver salários ou catálogo global de taxas para reconstruir custos de projetos negados. Projeção de horas não contém snapshots monetários.
7. **Fora do projeto:** aplicar antes de agregar em homepage, listas, global Gantt, pesquisa, relatórios, forecasts, exports, PDFs e funções com cliente privilegiado. Não entregar montantes ocultos ao browser/caches e depois mascarar; agregados excluem projetos/parcelas negados e assinalam âmbito autorizado, nunca total falso ou diferença dedutível.
8. **Documentos:** leitura de fatura/comprovativo específica ao projeto sem expor queue OCR, extratos ou detalhes de outras entidades. PDFs/propostas com preços requerem autorização financeira; URLs assinadas curtas e autorização renovada. Prosa livre existente não será reescrita: rever anexos/notas que possam conter valores antes de os disponibilizar a leitores sem acesso.

## Migração sem perder acesso autorizado
Com ligação disponível: inventário read-only de utilizadores/permissões/equipas/políticas atuais e matriz antes→depois por pessoa/projeto/área. Preservar acessos legítimos com concessões explícitas de origem `legacy`; não inferir direitos por alocação histórica nem por uma API anteriormente demasiado aberta.

Pré-visualizar conflitos: novos defaults OFF versus permissões antigas globais, gestores múltiplos, identidade ambígua e acessos que seriam removidos. Admin aprova matriz antes do corte; **não manter OR global legado em produção**, porque um switch OFF deixaria de negar. Até ativação atómica, permissões anteriores permanecem; depois as novas regras são autoritativas com exceções globais explícitas. Rollback repõe versão de autorização, não valores financeiros. Não atribuir Rita/Mint nem outras equipas neste passo.

## Ficheiros e migrações previstos
- Migrações novas espelhadas byte-a-byte em `drizzle/migrations` e `supabase/migrations`: equipa/acessos/auditoria/helpers; projeções/RLS/guardas; corte validado de compatibilidade. Numeração após aprovação; não editar migrações antigas ou conversão. Tipos regenerados pela ferramenta.
- `src/lib/projects/use-project-team.ts`, `src/components/projects/project-team-card.tsx`; novos `project-access.ts`, `use-project-access.ts`, tabela de acessos e ações protegidas.
- `src/routes/_app.projects.$projectId.tsx`, `src/lib/projects/use-planner.ts`, `use-project-planner-adapter.ts`, `use-contract-baseline.ts`, `use-stage-budget-control.ts`, `use-project-entry-figures.ts`, `use-pursuit.ts`, `use-invoices.ts`, `use-project-expenses.ts`, `use-external-services.ts`, `use-suppliers.ts`.
- Componentes Finance/Projects de faturação, despesas, resumo e recebimentos; QuotePlanningTab/QuoteGantt/inspetores e composição financeira adaptados para projeto sem conceder acesso à proposta inteira.
- Item 2: adaptador/projeção de Incoming e helper de datas; direitos separados de valores.
- `src/routes/_app.index.tsx`, `_app.projects.index.tsx`, `_app.projects.gantt.tsx`, `_app.projects.$projectId.allocations.tsx`, páginas financials/forecast/insights/resources; respetivos consumidores de pesquisa e exportação.
- `src/lib/reports/use-{business-performance,budget-consumption,estimate-vs-actual,supplier-stages,capacity-forecast}.ts`, leitores financeiros Finance/CRM ligados e downloads de `use-download-invoice-pdf.ts`/documentos. Cálculos puros não mudam.
- Traduções EN/PT `projects.json`/common/glossary; regras em AGENTS e relatório de acesso. Lista final refinada por inventário completo de chamadas antes do corte.

## Testes após aprovação
Só fixtures após limpeza item 1 e leitura zero. Gestor Mint-cópia com quatro ON versus Uralchem-cópia OFF; gestor novo Financeiro ON; membro quatro OFF; Tatiana-like global sem admin; Luis-like admin. Testar APIs diretas/RPCs/downloads, todos os separadores e `?tab=`, homepage/Gantt/pesquisa/reports/exports, isolamento de entidades, agregados sem fugas e revogação/caches. Gestor autorizado altera data, não montante/IVA/termos/status, nem próprios switches/papel. Datas congeladas não editáveis. Comparar permissões antes/depois e hashes financeiros/contratuais, capturas PT/EN, apagar fixtures e comprovar zero. Nenhum destes testes foi executado neste passo.