# Gantt Projetos vs CRM — investigação, 11 novembro 2026

## Conclusão

**Há um desenho comum, mas não uma experiência integralmente única.** `QuoteGantt` escolhe dois adaptadores que ainda montam painéis, toolbar, hierarquia e comportamento financeiro diferentes. A alteração anterior não cumpriu o requisito de igualdade integral de Luis.

Investigação apenas: nenhuma alteração de código, migração, permissões, projeto, proposta, contrato, horas ou pagamentos. B1 permanece OFF, revisão 10. As únicas gravações desta tarefa são documentação e registo do requisito permanente.

## 1. Entradas e diferenças atuais

As referências abaixo correspondem ao código consultado nesta data.

| Área | CRM / proposta não convertida | Projeto operacional | Referências |
|---|---|---|---|
| Entrada | `QuotePlanningTab` → `QuoteGantt` → `ProposalScheduleAdapter` | `QuoteGantt` → `OperationalScheduleAdapter`; uma proposta já convertida também entra neste adaptador operacional | `src/components/quotes/quote-planning-tab.tsx:34–145`; `src/components/planner/planner-gantt.tsx:120–152,1276–1335`; `src/routes/_app.projects.$projectId.tsx:1118–1144`; `src/routes/_app.crm.quotes.$quoteId.tsx:742` |
| Desenho base | `PlannerFrame`, `PlannerChart` → `GanttChart`, outline, dependências, arrasto, resize, zoom, impressão | Os mesmos componentes base | `src/components/planner/planner-surface.tsx:8–42`; `src/components/projects/gantt-chart.tsx`; `src/components/projects/gantt-outline-column.tsx` |
| Painel lateral | `QuotePlannerInspector`; painel da linha Project separado (`QuoteProjectBillingInspector`) | `ProjectPlannerInspector`; selecionar a linha Project fecha a seleção em vez de abrir faturação | `planner-gantt.tsx:1243–1256,1803,1818–1826`; `src/components/quotes/quote-project-billing-inspector.tsx:51–201` |
| Campos comuns, mas duplicados | Nome, marco, datas/duração, dependências, recursos, cor, orçamento | Versões próprias desses campos; acrescenta cancelar/restaurar fase | `src/components/quotes/quote-planner-inspector.tsx:267–1043`; `src/components/projects/project-planner-inspector.tsx:240–510` |
| Categoria | Arquitetura / Cliente / Fornecedor; papel influencia iconografia e barras | Não existe seletor no painel. Papel vem de `pm_stages` ou snapshot aceite; NULL cai em Arquitetura | `quote-planner-inspector.tsx:299–324`; `src/lib/projects/build-project-gantt-tree.ts:54–63`; `src/lib/projects/use-project-stage-roles.ts`; migração `20261103170000_project_schedule_role_and_conversion_isolation.sql:18–29` |
| Fornecedor | “Somos nós”, fornecedor do diretório, descrição provisória, refaturação, markup | Campos omitidos do painel; `pm_stages` tem `is_self`/markup/refaturação, mas não possui `supplier_id` nem `supplier_placeholder` | `quote-planner-inspector.tsx:326–416`; `project-planner-inspector.tsx:3–8`; esquema vivo de `pm_stages` |
| Estilo de fornecedor | Hierarquia considera `is_self=true` como Arquitetura; fornecedores externos recebem barra tracejada/hachurada e ícone próprio | Hierarquia considera apenas `stage_role`; não usa a mesma regra `is_self`. Papel ausente transforma fornecedor em Arquitetura | `planner-gantt.tsx:476–500`; `build-project-gantt-tree.ts:60`; `gantt-chart.tsx:1430–1500`; `gantt-outline-column.tsx:334–341` |
| Paleta | 12 cores, swatches circulares, cor livre | 16 cores diferentes, swatches quadrados, sem cor livre | `quote-planner-inspector.tsx:1413–1451`; `project-planner-inspector.tsx:47–51,437–450` |
| Orçamento / venda | Orçamento fixo/calculado, custo fornecedor, venda por alocação ou orçamento, multiplicador; pais somam folhas | Valor de `pm_stages.budget`, pais somam filhos; campo do painel sempre desativado por `planningOnly`; edição inline proibida quando existe proposta de origem | `quote-planner-inspector.tsx:625–776`; `planner-gantt.tsx:510–540,797–801,1809,1824`; `project-planner-inspector.tsx:406–434`; `build-project-gantt-tree.ts:70–100` |
| Significado do valor | Configuração comercial pode distinguir origem do honorário | Rótulo “Budget/Orçamento” descreve “Fee allocated to this stage”; não separa claramente orçamento interno de honorário cliente | `project-planner-inspector.tsx:406–434`; `src/lib/projects/planner-adapter.ts:37–43,147–165` |
| Consumo/custos nas barras | Compara custo planeado com venda calculada | Compara custo planeado com `budget`; pode mostrar custos/horas reais quando ativados. Taxas e esforço usam adaptadores distintos | `gantt-chart.tsx:1300–1348`; `planner-adapter.ts:147–165`; `src/lib/quotes/use-quote-planner-adapter.ts:51–68`; `src/lib/projects/use-project-planner-adapter.ts:58–85` |
| Contrato | Proposta aceite é bloqueada; o calendário convertido passa a ser operacional | Não apresenta Contratado/Atual lado a lado no painel ou total do Gantt; contrato/diferenças estão em cartões fora do Gantt. Baseline de planeamento fica desativada no adaptador convertido | `planner-gantt.tsx:1309–1310`; `_app.projects.$projectId.tsx:943–944`; `src/lib/projects/use-contract-baseline.ts`; `src/lib/projects/contract-diff.ts:78–145` |
| Faturação de fase/projeto | Modelo por fase/mensal, início/fim/split, filhos independentes, refaturação/markup; linha Project pode agrupar faturação | Não há esses campos no painel operacional; linha Project não abre painel. Separadores financeiros externos ainda reutilizam leitores da proposta | `quote-planner-inspector.tsx:780–944`; `quote-project-billing-inspector.tsx`; `_app.projects.$projectId.tsx:1100–1114`; `planner-gantt.tsx:1803` |
| Marcos financeiros | Marcos do plano de pagamentos da proposta, com triggers/percentagens; recorrentes omitidos da faixa | Marcos provenientes de faturas operacionais e respetivos estados | `planner-gantt.tsx:723–772,1337–1356` |
| Avenças | `retainer_monthly` fora do Gantt, `RetainerStageEditor` abaixo; propostas só de avença podem não mostrar Gantt | Gantt mostra pai `retainer_monthly` no fim e exclui filhos `retainer_month`; criação/monitorização em separador próprio, não o mesmo editor abaixo | `quote-planning-tab.tsx:60–68,130–145`; `planner-gantt.tsx:445–449,1297`; `build-project-gantt-tree.ts:31–36`; `_app.projects.$projectId.tsx:947–960` |
| Toolbar | Inserir/indentar/desindentar, Reflow, margem de venda, adicionar avença, Undo/Redo, controlos relativos, zoom/equipa/PDF | Inserir/indentar/desindentar, Undo/Redo, Mostrar horas registadas, leitura apenas, zoom/equipa/PDF; não possui Reflow/margem/adicionar avença nesta toolbar | `planner-gantt.tsx:1144–1187,1755–1771` |
| Estado/seleção | Largura outline guardada para quote; selecionar fase abre painel; linha Project abre faturação | Preferência outline própria de project; clicar fase selecionada fecha painel; linha Project não selecionável; Show cancelled só no ramo sem sourceQuoteId da rota | `planner-gantt.tsx:793,1803`; `_app.projects.$projectId.tsx:1120–1143` |
| Recursos | Pool selecionável da proposta, snapshot de custo/venda, % e h/d; tab Recursos oculta por papel fornecedor; folhas apenas | Recursos ativos operacionais, editor h/d próprio; tab permanece mesmo em fornecedor, bloqueio de add por `client` no painel e por `is_self=false` no drag; política também permite editar a própria alocação | `quote-planner-inspector.tsx:219–246,1209–1279`; `project-planner-inspector.tsx:197–210,684–750`; `gantt-chart.tsx:784`; `use-project-planner-adapter.ts:97–113` |
| Calendário e funções live | Relativo por defeito; esforço ignora feriados; sem férias/sobrecarga/estado de alocação/transferência entre projetos | Datas reais, feriados/fechos, férias/sobrecarga/estado; transferência e baseline desligadas para convertidos; horas reais opcionais | `gantt-chart.tsx:209`; `planner-adapter.ts:147–165`; `planner-gantt.tsx:1289–1290,1309–1310` |
| Permissões | Proposta bloqueada impede edição; adaptação convertida verifica `projects.edit_planning` e atribuição. Painel da proposta não recebe a mesma matriz de campos do projeto | Rota usa admin ou `projects.edit_planning` all/assigned; UPDATE de fases menciona `projects.edit_stages`; acesso financeiro é leitura, não desbloqueia campos; B1 condiciona algumas leituras quando ON | `_app.projects.$projectId.tsx:205–225`; `planner-gantt.tsx:133–149,1287,1301,1809,1823–1825`; políticas vivas `Authorized update pm_stages` / `pm_allocations` |

### O que a mudança anterior fez realmente

A 3 novembro, unificou a entrada `QuoteGantt`, o renderer/zoom/outline e os gestos; encaminhou projetos/global para esses elementos; introduziu papéis operacionais e isolou gravações/sincronização pós-conversão. **Não fundiu os dois painéis, toolbar completa, modelo financeiro, paletas ou avenças.** O relatório anterior reconhece a limitação em `docs/one-project-gantt-report.md:5–10,55`. O plano aprovado incluía “um único […] inspetor” (`.lovable/plan/um-único-gantt-para-propostas-e-projetos-2026-11-03.md:19–23`); esse ponto ficou por cumprir.

## 2. Porque Ricardo não pode alterar Orçamento

### Bloqueio do painel: incondicional, não um bloqueio de Ricardo

`OperationalScheduleAdapter` monta sempre `ProjectPlannerInspector planningOnly` (`planner-gantt.tsx:1818–1826`). O input Orçamento usa `disabled={planningOnly}` (`project-planner-inspector.tsx:415`). **Isso bloqueia Ricardo, Luis, outros utilizadores, projetos convertidos e projetos diretos neste painel.** Não depende de ser fornecedor, da função PM ou da visibilidade financeira.

### Bloqueio adicional da coluna inline: proposta de origem

`onUpdateStageBudget` só é fornecido com `canEdit && !sourceQuoteId` (`planner-gantt.tsx:1809`). Em Mastercard existe origem de proposta genuína, preservada por decisão de Luis. A coluna inline fica também bloqueada para Luis e Ricardo e para outros projetos com origem de proposta genuína. Pais/totais são resumos e não editáveis por definição (`gantt-outline-column.tsx:420–428`).

### Permissões efetivas de Ricardo

Consulta read-only confirmou **Ricardo Conceição**, resource `38cca829-6abf-4c13-b98f-151abe78b4c0`, como `manager` de Mastercard. Conta possui `projects.edit_planning=all`, `projects.edit_stages=all`, e capability financeira global ativa. Não é uma falta de permissão PM nem a antiga falha de role NULL a bloquear este input. Permissão financeira de leitura não concede edição de honorários.

Navegador autenticado de Luis: painel de `F5 - Construction supervision` abriu com nome/datas/duração disponíveis e Budget **77 000 € desativado**. Não foi executada edição. Não entrei na conta de Ricardo: o seu bloqueio foi comprovado pela condição comum do input e pelas permissões consultadas, não por ensaio de gravação.

### Divergência da linha indicada no pedido

No estado atual, **Mastercard não contém `F5 – Mês 4 – Outubro` nem fase de 285 €**. F5 é `1c5dbe6a-ca02-4d12-aa6c-81db561d13f3`, 77 000 €, modelo monthly. A linha de nome `F5 - Mês 4 - Outubro` existe em **2522 Escritórios Banco CTT - Atrium 2**, ID `034c297b-a1cb-4ebd-ae47-5a180cd12010`, valor atual **2 115 €**. Não encontrei 285 € nas fases operacionais consultadas. A causa do bloqueio é confirmada; não atribuo o exemplo de 285 € a uma linha diferente nem altero dados para o fazer coincidir.

### Nota de segurança descoberta, sem correção nesta tarefa

As políticas UPDATE específicas usam permissões, mas existe também `psa_staff_only FOR ALL USING is_psa_staff()` em `pm_stages` e `pm_allocations`. Políticas permissivas combinam-se por OR: isto não oferece a separação futura PM vs Finance. O novo plano deve proteger valores sensíveis com ações/guardas por campo e inventariar todos os caminhos de escrita; não se deve confiar apenas no input desativado. Nenhuma política ou B1 foi alterado nesta investigação.

## 3. Nulty como Arquitetura

Exemplo consultado: `Nulty Concept`, live `b8093ce0-49a1-4d12-ad08-22fc6cd77f4b`, source `532450a8-153a-40de-a0d0-7c93118b597a`.

- Proposta: `stage_role=supplier_phase`, `is_self=false`, fornecedor `401473f8-f4fa-4264-91c0-b320e26a44b6` = **Nulty**, cor `#22c55e`, orçamento 10 100 €.
- Projeto: `stage_role=NULL`, `is_self=false`, mesma cor e orçamento; ligação source preservada. Não há coluna de identidade do fornecedor em `pm_stages`.
- Todas as fases operacionais de Nulty consultadas têm papel NULL. Mastercard tem `accepted_snapshot_id=NULL`, logo `pm_project_stage_roles` não consegue recuperar papel do snapshot aceite. O helper de hierarquia cai em `architecture`.
- `GanttChart` já sabe desenhar fornecedores (hachura/tracejado/meia altura). **Não recebe papel fornecedor para estas fases**, por isso desenha o estilo de Arquitetura.
- A cor verde não foi perdida: foi copiada da proposta e já era partilhada com Architecture. O diferenciador pretendido é também a forma/ícone/hachura, não apenas outra cor.

**Resposta:** há perda/ausência de identidade operacional de fornecedor e papel na conversão legada, mais omissão dos controlos e fallback visual de Arquitetura. `is_self=false` e a ligação à fase original sobreviveram, mas não bastam no helper atual. A fonte mutável da proposta foi consultada só para diagnóstico: não deverá voltar a comandar o projeto.

Para conversões novas, a função atual copia `is_self`, cor, markup e source ID; o trigger `pm_stage_role_at_insert` obtém o papel do snapshot aceite. Contudo, `pm_stages` continua sem identidade do fornecedor/placeholder. Referências: `supabase/migrations/20261017154500_relative_offsets_and_atomic_quote_conversion.sql:27+` e definição viva de `pm_convert_relative_quote`; `20261103170000_project_schedule_role_and_conversion_isolation.sql:5–29`.

## 4. Limitação contratual de Mastercard

Baseline `29c86f4c-af25-4b74-b857-b264a63ce0fb` existe, mas tem **total_fee=0, zero fases de baseline e zero ligações de fase**; não existe snapshot aceite ligado. Isto não é prova de contrato gratuito nem permite fabricar “Contratado” por fase. O futuro ecrã deve mostrar **referência contratual indisponível / por confirmar**, preservando exatamente baseline, proposta, origem e badge. Não reconstruir silenciosamente a partir da proposta atual. Qualquer recuperação histórica deve ser apresentada com linhas/evidência e aprovação separada.

## 5. Plano proposto

Este diagnóstico é anterior à decisão de Luis de simplificar o modelo. A separação por cargo/Finance e os workflows do plano antigo foram substituídos pelo acesso financeiro por projeto e pelas duas fases descritas em `project-proposal-gantt-phase1-report.md`. As verificações acima pertencem à investigação read-only; a Fase 1 foi autorizada depois.

### Evidência e limites

- Consultas SELECT de fases/proposta/contrato/roles/permissões/policies e estado B1; browser read-only de Mastercard.
- Não foram criadas fixtures ou executados testes de alteração, por ser investigação apenas.
- Algumas consultas iniciais tinham colunas erradas (`pm_resources.user_id`, audit `active`) e foram corrigidas; tentativa de invocar `pm_has_assigned_access` no runner foi recusada. Nenhum resultado falhado é apresentado como verificação efetiva de gravação.
- Nenhum contrato ou registo real alterado. Screenshot de referência: `/tmp/browser/gantt-investigation/mastercard-inspector.png` (captura temporária, não entregável).