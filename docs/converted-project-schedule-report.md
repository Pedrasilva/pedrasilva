# Calendário operacional após conversão

## Resultado
- `QuotePlanningTab` mantém a entrada `QuoteGantt` e o mesmo `GanttChart`. Quando `fee_proposals.pm_project_id` está preenchido, usa o adaptador e o inspetor operacionais: datas atuais de `pm_stages`/`pm_allocations`, calendário de feriados/fechos e Undo operacional.
- Correspondências exclusivamente pelos identificadores `source_quote_stage_id` e `source_quote_allocation_id`, verificando projeto/fase e rejeitando relações ausentes ou ambíguas. Alocações repetidas nos filhos mensais da avença são legítimas e mantêm os seus identificadores e datas operacionais.
- Sem modo relativo num calendário convertido, mesmo com a linha relativa e datas de 2000 preservadas na proposta. O cabeçalho adapta-se ao zoom: meses/semanas reais; Ajustar pode mostrar anos quando o espaço é pequeno.
- Avença após o Gantt nos dois contextos. No convertido, todos os seus controlos ficam desativados e a sincronização automática de orçamento não corre. A faixa operacional da assistência aparece após as fases regulares.
- Nenhum campo do inspetor convertido escreve na proposta. Condições comerciais, orçamento e baseline não são editáveis por esta superfície. Datas/duração utilizam dias úteis, excluindo feriados e fechos.

## Ficheiros
- `src/components/planner/planner-gantt.tsx`
- `src/components/quotes/quote-planning-tab.tsx`
- `src/components/quotes/retainer-stage-editor.tsx`
- `src/components/projects/project-planner-inspector.tsx`
- `src/lib/projects/converted-quote-schedule.ts`
- `src/routes/_app.projects.$projectId.tsx`
- `src/i18n/locales/en/projects.json`, `src/i18n/locales/pt-PT/projects.json`
- `scripts/test-converted-quote-schedule.test.ts`
- `src/lib/projects/AGENTS.md`, `AGENTS.md`, `roadmap.md`
- Este relatório e capturas em `docs/converted-project-schedule/`.

Sem migrações. `pm_convert_relative_quote`, o contrato de referência e o plano de pagamentos não foram alterados.

## Verificação
- 50 testes passaram: 9 correspondências/modo convertido e 41 testes existentes de calendário/movimentos, incluindo feriados e fecho de Natal. Paridade EN/PT-PT passou; auditoria UI: zero novos textos sem tradução; preview compilado sem erros.
- Cópia descartável da Mint já convertida, sem executar a conversão: fase inicial alterada no inspetor de **01–16 junho para 03–18 junho 2026**, mantendo **10 dias úteis**. A leitura após recarregar confirmou a gravação operacional.
- Alocação descartável, acrescentada apenas à cópia: início alterado pelo editor para **04 junho 2026**, fim **18 junho**, **2 h/dia**; confirmado depois de recarregar.
- Comparação integral antes/depois da edição de alocação e reaberturas: `fee_proposals`, `quote_stages`, `quote_allocations`, `quote_relative_schedules`, as três tabelas do contrato de referência e `pm_payment_schedule_items` ficaram idênticas.
- Remoção da correspondência apenas na cópia produziu aviso explícito e calendário de edição bloqueado. Nenhuma gravação de recurso para a proposta.
- Três projetos descartáveis de preparação/verificação, incluindo os de tentativas anteriores, eliminados com as suas 30 fases e três tarefas sem horas. Zero projetos e zero propostas com a identificação de teste; sem horas reais criadas ou apagadas.
- Mint real já se encontrava convertida quando esta tarefa começou. Foi aberta apenas para captura/leitura: **01 junho 2026–28 fevereiro 2027**, avença **1 320 € × 4 = 5 280 €**, abaixo do Gantt. Não foi convertida nem editada nesta tarefa.
- Nenhum erro de execução do navegador na verificação final. A criação direta de uma linha relativa na fixture foi recusada por permissões; não se alteraram permissões. A precedência sobre linha relativa foi coberta pelo teste unitário e pela Mint real convertida com a sua linha preservada.

## Capturas
1. `01-real-months.png`: cópia com cabeçalho de meses reais.
2. `02-date-inspector.png`: inspetor com início/fim de calendário.
3. `03-live-retainer.png`: cópia após gravação, avença abaixo.
4. `04-missing-map.png`: bloqueio por correspondência inexistente.
5. `05-mint-schedule.png`: Mint real, só leitura, datas reais e avença abaixo.

Limites: não se repetiu a matriz completa de contas/permissões nem todos os gestos de arrastar/dependências/Undo no navegador; reutilizam os mecanismos operacionais existentes e respetivos testes. O cabeçalho lateral existente «Sem cliente» não foi corrigido, por estar fora deste pedido.