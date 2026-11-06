# Fase B1 — plano antes da implementação (4 novembro 2026, 09:22 UTC)

## Corte curto autorizado — 6 novembro 2026, pedido 12:58 UTC
**Resultado final: B1 OFF, revisão 6; Fase A ON, revisão 27. Rollback imediato ao primeiro check falhado.**

- Matriz comparada novamente na sessão administrativa, ordenada por pessoa/projeto/área e IDs: **1 176 → 1 176 linhas, zero diferenças de conteúdo**. SHA-256 de ambas: `13b68e44b0b0c891499603922e82cf7c18ad8dd4801eb3390569b5db1d74e339`. Evidência: `cutover-20261106/comparison.json` e `current-sorted.json`.
- Ativação pela ação auditada existente `pm_change_project_b1_cutover`, motivo exato **`Approved by Luis 2026-11-06`**, revisão **5**, às **15:52:55.714070 UTC**. Cada sessão confirmou B1 realmente ON; não houve interceção, simulação ou override de respostas.
- **Rita PASS:** Mint Overview/cabeçalho e Insights mostram receita **3 086 €**, custo **1 812 €**, lucro **1 274 €**, margem **41%**, incluindo o custo de angariação de **48 €** apresentado separadamente e incluído no total. Uralchem mantém fases, horas e datas, sem moeda ou zeros financeiros substitutos em Overview/Insights. Capturas inspecionadas visualmente, além de asserções no texto.
- **Patricia páginas PASS:** Mint e Uralchem, Overview e Insights, quatro áreas OFF, fases/datas/horas disponíveis, nenhum valor monetário.
- **Patricia Gantt global FAIL:** cabeçalho Mint mostra **`0 € / —`** e barras de fases mostram **`€0 / —`** apesar de todas as áreas OFF. A captura confirma uma substituição indevida de custos ocultos por zero; não é prova de que custos reais tenham sido transmitidos. O mesmo padrão aparece em outras fases do Gantt.
- Causa localizada sem alterar código neste pedido: `src/routes/_app.projects.gantt.tsx`, `costsByProject`, inicia custo em zero e só o invalida ao percorrer alocações com preço negado; fases sem alocações deixam esse zero no agregado. `src/lib/projects/build-project-gantt-tree.ts` também transforma budgets ausentes em zero nos rollups (`Number(node.budget ?? 0) || 0`). A superfície ainda renderiza indicadores financeiros globais sem uma decisão de acesso completa por projeto. Estes caminhos precisam preservar indisponibilidade e ocultar os indicadores negados antes de uma nova autorização.
- **Rollback imediato**, revisão **6**, às **15:58:38.704658 UTC**, motivo `Immediate B1 rollback — Patricia global Gantt financial figure visible`. A própria ação retornou OFF e uma leitura independente da auditoria confirmou OFF; Fase A continua ON/revisão 27.
- **Tatiana não testada:** o pedido determina parar ao primeiro check falhado; não se declara preservação live ON de Tatiana nesta tentativa. Não houve repetição ou novo corte após o rollback.
- Nenhum projeto, proposta, fase, data, montante, equipa, acesso ou snapshot real foi escrito; nenhuma fixture foi criada ou eliminada. Apenas as duas transições auditadas B1 foram executadas. Sem migração nem alteração de aplicação. Sessões temporárias foram usadas para Rita e Patricia; nenhuma conta criada. Build observado OK às 15:58:40 UTC.
- Ficheiros alterados: este relatório, evidências em `docs/project-access-phase-b1/cutover-20261106/` e `roadmap.md`. **Paragem cumprida; B2 não iniciado.**

![Rita Mint: valores corretos com B1 ON](project-access-phase-b1/cutover-20261106/rita-da46fd5d-insights.png)
![Rita Uralchem: operacional com B1 ON](project-access-phase-b1/cutover-20261106/rita-32810ca9-overview.png)
![Patricia Gantt global: zero financeiro indevido, motivo do rollback](project-access-phase-b1/cutover-20261106/patricia-global-gantt.png)

## Receita autorizada — 4 novembro, 22:20 UTC; sem novo corte
**B1 permanece OFF, revisão 4; Fase A permanece ON. Não foi chamada qualquer ação de corte.**

### Origem exata e causa
- Contrato: `pm_projects.sold_fee`/`sold_internal_fee` e `pm_project_contract_baseline.total_fee` são **30 980 €** em Mint; `useProjectDetail` recebe o projeto de `pm_b1_projects`. O orçamento operacional de Overview/cabeçalho é a soma de `pm_stages.budget`, excluindo os filhos `retainer_month`; Insights usa também o baseline imutável para a divisão interna/externa. Estes valores já chegavam a Rita. Não substituir receita gerada pelo preço integral do contrato.
- Receita gerada: Overview e cabeçalho usam `stageActuals` → `useProjectEntryFigures` → `loggedEntryFigures`; Insights recebe exatamente os mesmos totais. As 12 entradas/58,5 horas de Ricardo Cabrita não têm `sale_rate_snapshot`; o fallback normal é o preço efetivo autorizado do autor, **52,75 €/h**, derivado pelo leitor existente de preços. Custo fica nos snapshots históricos, **1 763,775 €**.
- Diferença reproduzida em sessões reais: `pm_b1_resources` devolvia **0 recursos para Rita / 16 para Luis**, mesmo tendo Rita quatro áreas ON em Mint. Enumerava IDs através de `pm_resources_public`, uma vista `security_invoker=on` sujeita ao SELECT legado dos preços. Assim o wrapper autorizado `pm_b1_resource` nem chegava a ser chamado para Rita; faltava o recurso do autor e a receita propagava indisponibilidade. Não era ausência do contrato, divisão por zero nem uma alteração das áreas.
- Correção: `pm_b1_financial_resources` enumera após verificar PSA staff + acesso operacional ao projeto e aplica a mesma redação por áreas a preços de venda/custo. `pm_b1_resources` usa esta projeção para projeto quando B1 está ativo. A revisão explícita usa as mesmas áreas com B1 OFF; `getPmDefaultResourceRates` respeita `b1Projection` também nessa revisão. Sem expor salários, sem fallback cliente privilegiado, sem escrever snapshots/preços/contratos.

### Antes/depois para Rita, antes de qualquer corte
| Projeto / valor | Antes B1 | Depois, revisão autorizada com gate real OFF |
|---|---|---|
| Mint contrato | 30 980 € | 30 980 €, inalterado |
| Mint receita gerada | — | **3 085,875 €** (UI 3 086 €) |
| Mint custo histórico | 1 763,775 € | **1 763,775 €**, inalterado |
| Mint lucro / margem | — / — | **1 322,10 € / 42,8436%** (UI 1 322 € / 43%) |
| Uralchem contrato/receita/custo/lucro | Ocultos na apresentação B1 | **Continuam ocultos**, fases e horas visíveis; nenhum zero financeiro substituto |

Capturas Overview/cabeçalho/Insights usam **revisão isolada no navegador**, não ativação do gate: respostas da projeção própria e preços são lidas do servidor com as áreas reais; flag de apresentação B1 e resumo de custo são adaptados apenas no executor. O resumo de custo da captura é reconciliado com os snapshots legados autorizados de Mint. Portanto estas capturas demonstram o antes/depois pré-corte solicitado, **não certificam o corte live ON**. O antes reproduz a enumeração vazia; o depois usa a nova projeção. Uralchem não monta os cálculos financeiros. O ensaio de extração com B1 OFF não é uma certificação de isolamento dos leitores legados B2.

![Rita Mint antes](project-access-phase-b1/revenue-20261104-2220/rita-mint-overview-before.png)
![Rita Mint depois](project-access-phase-b1/revenue-20261104-2220/rita-mint-overview-after.png)
![Rita Mint Insights depois](project-access-phase-b1/revenue-20261104-2220/rita-mint-insights-after.png)
![Rita Uralchem depois](project-access-phase-b1/revenue-20261104-2220/rita-uralchem-overview-after.png)

### Teste descartável e ficheiros
- Um projeto transacional descartável, Rita como manager com quatro switches ON e uma atividade de 8 horas de outro autor; o trigger normal grava o custo. Resultado: contrato **1 000 €**, receita **422 €**, custo **241,20 €**, lucro **180,80 €**, margem **42,8436%**. Cálculo usa as funções reais e a projeção retornada com identidade PM dentro do ensaio protegido administrativo; não é uma sessão browser PM num projeto persistente. Todo o projeto/equipa/acessos/alocação/atividade/horas foi revertido na mesma subtransação.
- Duas primeiras execuções foram recusadas pelos guards normais (horas diretas apenas avença; atividade já criada automaticamente). Ambas transações reverteram integralmente. O teste final reutiliza a atividade automática e passou; nenhum guard foi desativado.
- Zero independente **22:40:08 UTC**: projeto/fase/alocação/atividade/horas/equipa/acessos/auditoria da fixture = **0**; B1 **OFF**, revisão **4**. `zero.json`, `fixture.json`, `fixture-figures.json`, `figures.json` e capturas/textos estão em `project-access-phase-b1/revenue-20261104-2220/`. Nenhuma identidade ou recurso QA foi criado; nenhum projeto real foi escrito.
- **23 testes passam**: all-ON com snapshot de venda ausente, partial, all-OFF e receita zero/ausente mais regressões financeiras; build OK às 22:39:54 UTC. EN/PT não mudou (sem novo texto UI).
- Ficheiros: `src/lib/projects/default-rates.functions.ts`, `scripts/test-b1-revenue.test.ts`, migrações **0260–0263** idênticas em `drizzle/migrations` e `supabase/migrations`, este relatório/evidências e `roadmap.md`. As duas migrações finais ajustam somente o executor descartável; 0260 é a correção produtiva. Tipos regenerados pela plataforma. A nova regra técnica não foi adicionada ao root AGENTS devido ao limite de tamanho; a regra existente de projeções B1 continua aplicável.
- **Paragem:** sem novo corte até aprovação de Luis; B2/B3 não iniciados. A autorização do próximo corte e os checks live ON restantes continuam pendentes, não são substituídos por esta revisão.

## Correção e única nova tentativa — 4 novembro, 18:14 UTC
- **Diagnóstico reproduzido antes da correção:** Rita tem as quatro áreas ON em Mint; lê 12 entradas/58,5 horas, mas o leitor legado `pm_project_stage_locked_cost` devolve zero linhas para ela, enquanto a sessão administrativa recebe quatro linhas mensais e **1 763,775 €** de snapshots. As 12 entradas não têm `sale_rate_snapshot`. A transformação B1 de null em NaN fazia estas ausências parecerem preços negados, impedindo o fallback permitido. Não há prova de uma despesa ou fornecedor real apagado ou alterado.
- Correções: página passa a usar `pm_b1_stage_hours`/`pm_b1_stage_locked_cost` quando B1 está ON, com cache por pessoa/gate; entradas autorizadas recuperam o fallback normal quando falta snapshot (avenças continuam sem estimativas de custo); preços derivados positivos e autorizados podem suprir um campo manual ausente. Margens usam guardas partilhadas de receita/lucro finitos e receita positiva, no sidebar/rail, Insights, tabela e popover Gantt (também global); avenças deixam de apresentar 0% para receita zero. Nenhuma permissão foi alargada nem snapshot escrito.
- **24 testes passaram:** 19 Vitest (finance/B1, incluindo all-ON=40%, cada área parcial, all-OFF, receita zero/ausente, lucro não finito) e cinco testes de custos de avença. Duas tentativas de executor incorreto para o ficheiro Node foram corrigidas; resultado final `bun test` 5/5. Build OK às 18:20:06 UTC.
- **Única nova tentativa realizada**, mesmo motivo auditado `Approved by Luis 2026-11-04`, revisão **3**; matriz novamente comparada integralmente com a aprovada. B1 realmente ON. Overview de Rita/Mint já mostra o custo correto **1 764 €** e já não mostra NaN, mas **receita/lucro continuam «—»**: a correção de apresentação/custo não resolveu integralmente o caminho de valorização da receita. O teste exige lucro numérico para Rita e falhou, antes de continuar para as restantes superfícies.
- **Rollback automático imediato**, revisão **4**, motivo `Immediate B1 rollback — Rita Mint profit missing: LUCRO\n—`; leitura posterior **B1 OFF, Fase A ON**. Não houve segunda repetição neste pedido. Não se afirma que a causa completa ou o corte estejam resolvidos; a receita autorizada ainda necessita diagnóstico/correção, sem inventar preços ou converter ausência em zero.
- Restantes checks de Rita/Uralchem, Patricia/Bernardo, quatro globais, inspetor/Gantt global, attachment e edição operacional foram interrompidos por esta falha. **Nenhuma fixture foi criada**: não houve teste de edição nem limpeza fictícia; dados reais não foram alterados. Evidências em `project-access-phase-b1/retry-20261104-1814/` (captura/texto de Rita Mint e `on-results.json` com ativação/reversão).
- Ficheiros: `src/lib/projects/{financial-calculation,use-project-entry-figures,use-default-rates}.ts`, `src/routes/_app.projects.$projectId.tsx`, `src/components/projects/{gantt-chart,retainer-monitor-panel}.tsx`, `scripts/test-project-financial-calculation.test.ts`, relatório/evidências e `roadmap.md`. Sem migração ou schema change. **Paragem após a tentativa falhada; aguardar Luis, sem B2.**

## Corte autorizado por igualdade de conteúdo — 4 novembro, 17:42 UTC
- **Matrizes iguais:** 1 176 linhas antes/depois, ordenadas por `person, project, area` (IDs como desempate), comparação completa de cada campo e zero diferenças. SHA-256 canónico de ambas: **`13b68e44b0b0c891499603922e82cf7c18ad8dd4801eb3390569b5db1d74e339`**. Excluídas apenas as três anotações editoriais do relatório (`b1_before`, `b1_after`, `activation`), inexistentes na matriz original; todos os campos da matriz foram comparados.
- Ativação pela ação administrativa existente `pm_change_project_b1_cutover`, motivo exato **`Approved by Luis 2026-11-04`**, revisão **1**. O hash legado requerido pela ação foi lido novamente, sem alterar o mecanismo nem as permissões. Leituras autenticadas confirmaram **B1 realmente ON e Fase A ON**, sem simulação.
- Foram percorridas 42 páginas reais (7 sessões × Mint/Uralchem × Overview/Insights/avença), com capturas e textos. Rita Mint e quatro globais mantiveram budgets projetados; Rita Uralchem, Patricia e Bernardo conservaram fases operacionais com budgets/custos nulos e sem moeda nas páginas verificadas. **Estes checks automáticos não constituem aprovação final:** a inspeção visual seguinte identificou a falha abaixo, não detetada pelo primeiro conjunto de asserções.
- **Falha real:** Overview de Mint para Rita mostra **`NaN%` no lucro**, em vez de indisponibilidade corretamente apresentada. O mesmo artefacto aparece em capturas/textos de Irene e Ricardo. A origem está no cálculo de `profitPct` e na condição de apresentação que aceita um número não finito. Não foi alterado código neste pedido, porque a instrução determina rollback e relatório ao primeiro check falhado.
- **Rollback imediato após identificação visual**, pela mesma ação auditada, revisão **2**; motivo `Immediate B1 rollback — live Mint Overview renders NaN% in profit; unavailable actuals are not safely formatted`. Leitura autenticada posterior: **B1 OFF, Fase A ON**. `rollback.json` é o estado final, prevalecendo sobre o checkpoint ON guardado em `on-results.json`.
- Inspetor, Gantt global, attachment allow/deny e edição operacional descartável **não concluídos**: interrompidos pela falha real. Nenhuma fixture foi criada neste pedido; zero por nome exato confirmado. Não houve alterações em projetos, propostas, datas, montantes, equipa ou acessos reais; apenas duas transições auditadas do gate B1. Não se repetiram checks Finance recusados.
- Evidências: `project-access-phase-b1/cutover-20261104-1742/` contém ambas as matrizes ordenadas, `comparison.json`, capturas/textos de páginas reais, checkpoint `on-results.json` e confirmação `rollback.json`. Ficheiros alterados: este relatório, evidências e `roadmap.md`; requisito de comparação independente da ordem atualizado na memória. Nenhuma migração ou alteração de esquema. **Parar e aguardar Luis; B2 não iniciado.**

## Autorização de corte 4 novembro, 17:36 UTC — interrompida antes de ativar
- Leitura autenticada administrativa de `pm_project_b1_preview`: hash atual **`1cf42c8ef49c1f1e67b132dfa5ea185d`**, diferente do hash aprovado **`020f61e7f8cab09c838d2ac25bd4e7bc`**. Conforme instrução de Luis, não foi chamada a ação de ativação.
- Estado lido: **B1 OFF**, **Fase A ON**. Sem rollback necessário: B1 nunca foi ativado neste pedido. Nenhuma escrita de dados reais ou fixture criada.
- Comparação por `(user_id, project_id, area)` com `matrix-before-after.json`: **1 176 → 1 176 linhas; zero linhas adicionadas/removidas; zero alterações em qualquer campo da matriz**. A sequência de linhas difere da cópia guardada. A implementação de `pm_project_access_matrix` usa `jsonb_agg` sem `ORDER BY`, enquanto o hash calcula o texto do array, portanto é sensível à ordem. Isto identifica uma fragilidade do cálculo, não uma alteração comprovada de permissões; não se alterou o cálculo nem se substituiu a aprovação.
- Evidência: `project-access-phase-b1/cutover-20261104-1736/current-matrix.json` e `matrix-diff.json`. Não foram feitos ensaios ON de páginas, inspetores, Gantt ou anexos nem edição descartável: a condição prévia de Luis falhou. A captura de preflight ficou em carregamento e não é usada como prova de resultado visual.
- Paragem solicitada cumprida; aguardar Luis antes de qualquer nova tentativa. B2 não iniciado.

## Plano aprovado para construir, não para ativar
1. Preservar Fase A ON e criar gate B1 independente, inicialmente OFF, com alteração administrativa auditada e aprovação de matriz separada.
2. Adicionar projeções operacionais autorizadas para os leitores B1: projetos/fases/alocações/horas/recursos e evidência da proposta convertida. Dados operacionais permanecem disponíveis; contrato/venda por Financials, custos/snapshots/orçamento por Budget, despesas por Expenses, fornecedores por Suppliers. Não modificar dados históricos ou permissões reais.
3. Migrar Overview/cabeçalho, Insights do projeto, avença, orçamento, inspetores e Gantt; Gantt global e homepage. Valores negados são ausentes/nulos, nunca zeros; margens e agregados integrados exigem todas as parcelas autorizadas. Preservar ações operacionais e impedir que valores ausentes sejam gravados por formulários.
4. Comparar matriz antes/depois e executar verificações read-only dos utilizadores indicados; testar projeções/áreas com um único projeto descartável de cada vez, sem ativar o gate real. Eliminar apenas IDs comprovados e confirmar zero independente.
5. B2: inventariar alcance atual de forecast/Insights globais/relatórios/pesquisa sem Finance ou Reports. B3: completar mapa de documentos/exportações/PDF, sem implementação de ambas.
6. Registar ficheiros, migrações espelhadas, testes/capturas, limitações e gate final OFF. Parar antes da ativação, aguardando Luis.

## Evidência e resultados
### Estado final
- Fase A **ON**; B1 **OFF**, sem qualquer linha em `pm_project_b1_cutover_audit`. Nenhum corte B1 efetuado. A ação administrativa exige estado anterior, motivo e hash atual da matriz.
- Schema e leitores B1 preparados; testes de projeções e apresentação abaixo. **Não se declara isolamento financeiro completo**: leituras legadas B2/B3 continuam acessíveis conforme o inventário. Nenhuma equipa, switch, data, valor ou snapshot real foi alterado.
- Hash de matriz observado: `020f61e7f8cab09c838d2ac25bd4e7bc`. Recalcular antes de futura aprovação; não reutilizar se houver alterações.

### Cobertura B1
| Superfície | Caminho preparado | Regras |
|---|---|---|
| Overview/cabeçalho | `useProjectDetail`, recursos e entradas `pm_b1_*` | Valores ausentes propagam NaN/«—»; lucro/margem integrados exigem Financials + Budget + Expenses + Suppliers |
| Insights do projeto | Painel financeiro existente apenas com todas as áreas; alternativa `B1OperationalInsights` | Operacional para all-OFF; venda e custo em colunas separadas conforme área |
| Avença | Mesmo fallback operacional para permissões parciais; painel completo com todas as áreas | Custos reais só snapshots positivos; consultas diretas do painel completo substituídas por entradas B1 quando ativo; preços globais não consultados |
| Orçamento/actuals | `useStageBudgetControl`, `useProjectEntryFigures`, `useGanttActuals` | Snapshot histórico intacto; ausência não tratada como custo zero; resumo guardado `pm_b1_stage_locked_cost` |
| Inspetor/Gantt | `OperationalScheduleAdapter` + dados do projeto, sem sincronizar proposta | Edição de budget escondida sem Financials; popover de margens e faixa financeira só com todas as parcelas; não calcular horas implícitas a partir de preços globais |
| Gantt global | `useProjects(true)`, `useAllStages({b1Projection:true})`, recursos B1 | Autorização/redação por projeto antes de somar; não há estimativa de custo com área negada |
| Homepage | Revisão de `_app.index.tsx` e `ThisWeekCard` | Já não tem strip financeiro/projetos com valores; mantém `weekBoardQuery` + `personalHomeWeek`, apenas planeamento pessoal aprovado/no-rates. Sem migração desnecessária nem abertura de drafts |
| Comparação contratual | `useLivePlanForDiff` passa fases pela projeção | Pagamentos continuam protegidos pela Fase A; documento contratual e restantes exportações pertencem ao mapa B3 |

Campos mistos importados `rate`, `profit`, `content`, `raw`, `subject` e referência fiscal foram incluídos na redação: texto/raw não pode reconstruir parcelas negadas. Cache dos leitores B1 inclui chamador e estado do gate; áreas são refrescadas periodicamente. A eliminação final de SELECTs amplos fica dependente de migrar B2/B3: revogá-los agora quebraria essas superfícies.

### Matriz efetiva antes/depois e sessões reais (somente leitura)
`effective-before-after.csv/json` contém **14 comparações reais** (7 pessoas × Mint/Uralchem), com contagem de linhas operacionais e budgets presentes, além das quatro áreas. A matriz administrativa completa de **1 176 linhas** está em `matrix-before-after.csv/json`; o seu campo “before” é uma classificação de caminho legado, **não medição de valores**. Para valores efetivos usar os ficheiros `effective-*`.

| Pessoa | Mint: fases / budgets legados → projetados | Uralchem: fases / budgets legados → projetados | Áreas propostas |
|---|---|---|---|
| Rita | 10 / 10 → 10 | 3 / 3 → 0 | Mint quatro ON; Uralchem quatro OFF |
| Patricia | 10 / 10 → 0 | 3 / 3 → 0 | Quatro OFF |
| Bernardo | 10 / 10 → 0 | 3 / 3 → 0 | Quatro OFF |
| Luis | 10 / 10 → 10 | 3 / 3 → 3 | Quatro ON |
| Tatiana | 10 / 10 → 10 | 3 / 3 → 3 | Quatro ON |
| Irene | 10 / 10 → 10 | 3 / 3 → 3 | Quatro ON |
| Ricardo Conceição | 10 / 10 → 10 | 3 / 3 → 3 | Quatro ON |

Os zeros desta tabela são **contagem de campos presentes**, não valores financeiros. As fases operacionais não desapareceram. Sessões reais leem `pm_b1_preview_own` sem ativar B1; capturas de páginas reais foram feitas com B1 OFF. Não confundir estas capturas com uma verificação do corte ON.

### Testes descartáveis, capturas e zero
- Uma fixture transacional de cada vez: seis combinações (all-OFF, cada área isolada, all-ON), **36 asserções** sobre venda/custo/notas/fornecedor/datas. `pm_validate_b1_fixture` é admin-only; subtransação sempre revertida, sem ativar gate. Últimos IDs: projeto `729648cc-fb22-4155-9682-2a3cec4c2bcf`, fase `a9d4ca6d-a992-45d3-8dde-4ca1b5dd9be4`.
- Apresentação all-OFF numa cópia criada/eliminada sequencialmente: página autenticada com resposta do gate/áreas simulada **apenas no navegador de teste**, não no servidor. A captura final mostra apenas fase e horas; nenhum budget, custo ou lucro. Isto valida apresentação, não substitui um ensaio real ON.
- Última cópia UI `427aaf31-5591-40f2-83a1-688c6e732d36`; tentativas anteriores também eliminadas. Consulta independente por nomes exatos das fixtures e IDs: **projetos=0, fases=0, equipa=0, acessos=0, ações gate B1=0 às 10:28:24.809 UTC, 4 novembro 2026**. Nenhum documento/anexo/identidade/recurso foi criado nestes testes.
- 35 testes Vitest + 23 testes Node de actuals passaram (**58**); paridade EN/PT e AST passaram (zero novos literais). Build OK às 10:28:08 UTC. A primeira execução do teste Node por Vitest falhou por executor errado, depois passou no executor correto.
- Primeira captura isolada ficou vazia por falta dos providers do executor; descartada/substituída pela captura da página autenticada. Um seletor esperado como “Project summary” foi corrigido para o rótulo existente “Project”; a imagem confirmou o painel não vazio.

![Antes: cópia com B1 OFF](project-access-phase-b1/fixture-before-off.png)
![Depois: apresentação all-OFF simulada só no navegador](project-access-phase-b1/fixture-operational-all-off.png)

Capturas read-only de Rita, Patricia, Bernardo e quatro globais e resultados em `project-access-phase-b1/`. `final-gates.json` e `fixture-validation.json` registam gate e teste. Não foram repetidos checks Finance anteriormente recusados nem tocada a fatura Mint de 6 000 €.

### B2 — alcance atual sem Finance/Reports (inventário, sem implementação)
| Superfície | Rita/Patricia no navegador | Fonte/guarda atual | Exposição a rever em B2 |
|---|---|---|---|
| `/projects/forecast` | Abre | Módulo Projects; leitores legados | Dados/totais financeiros não exigem entrada Finance; abertura confirmada, não equivalência de cada total |
| `/projects/insights` | Abre | Projects; hooks de stages/resources/Insights legados | Totais globais precisam redação antes de agregar; zeros vistos na página não provam ausência de exposição |
| `/projects/financials` | Abre | É Projects, não Finance | Finance module não é pré-requisito; manter identificado, sem implementar B2 |
| `/reports/business`, `/reports/budget` | “Acesso restrito” | `V2PermissionGate reports.view/all` | Negação UI confirmada nestas duas; RPCs/hooks diretos ainda precisam ensaio de política por chamador |
| Reports hours/health/estimates/capacity/billable | Não testados live | Mesma guarda Reports encontrada no código | Inventário de fonte; não afirmar negação end-to-end de todos |
| Pesquisa timesheet | Disponível no fluxo Projects/Time; não ensaiada neste turno | `useProjectSearch` em `use-timesheet.ts`, cliente/RLS | SELECT projeto/fases, sem requisito Finance/Reports no hook; verificar que só campos operacionais chegam ao resultado |
| Listas/pesquisa projeto e cliente | Caminhos existentes | `useProjects`/stages legados por defeito | Continuam fora B1; filtros/listas/totais precisam migração deliberada B2 |
| MCP list-projects/list-companies | Não testado live | Ferramentas em `src/lib/mcp/tools` | Autorização de registo/resultados a confirmar; não classificar como seguro sem ensaio |

Evidência navegador: `b2-rita.json`, `b2-patricia.json` e capturas correspondentes. Acesso ao módulo Finance não é equivalente à capacidade global por projeto; não se retirou nenhum acesso real.

### B3 — mapa documentos/exportações/PDFs (sem build)
| Origem → chamador | Guardas atuais / dados | Trabalho de B3 |
|---|---|---|
| `gantt-print-button.tsx` → planner | `window.print`; conteúdo já renderizado, sem reautorização de todas as áreas | Confirmar cada ponto de montagem e impressão apenas de parcelas permitidas |
| `composer-top-bar.tsx` → Composer | PDF e Word copiam documento no navegador; acesso do editor/proposta | Documento pode incluir várias áreas; guardá-lo inteiro ou saída autorizada, sem reescrever história/idioma |
| `versions-panel.tsx` → `getRevisionPdfUrl` em `use-proposal-revisions.ts` | URL assinada em `proposal-pdfs`, cliente/RLS | Rever vínculo projeto/áreas e validade dos URLs já emitidos |
| `signature.functions.ts` → envio de revisão | Sessão + snapshot/proposta do chamador; download privilegiado após vínculo | Reautorizar todas as áreas do documento antes de envio/download; não alterar hashes/evidência |
| `use-download-invoice-pdf.ts` | `pm_invoice_items`, projeto, faturas relacionadas; cliente/RLS; chamador UI não localizado | Confirmar se está montado; testar guarda Financials + isolamento de relacionadas |
| `project-attachment.ts` → `project-billing-tab.tsx` | Download Storage pelo próprio utilizador, proteção Fase A | Preservar allow/deny já existente; rever caminhos alternativos/signed URLs |
| `use-documents.ts` → listas/editor/settlements/purchases/invoices | `financial_documents`, linhas/pagamentos/fila; RLS por entidade | Auditar todos os chamadores, entidade e pesquisa; não apenas visibilidade da lista |
| `issued-pdf.functions.ts` → issued-pdf upload/review | Sessão, escrita Finance, entidade/projeto/Financials e fila/path | Preservar ação de confirmação e vínculo issued-PDF; revalidar extração/saída |
| Finance receipt/intake | Guards Expenses e entidade nas funções existentes | Rever recibo que contém várias despesas/alocações e fronteira de saída |
| `contabilidade-export.server.ts` → Drive-intake/job | Exportação server; callback/job privado existente | Verificar autenticação do job, filtro entidade/projeto e artefacto gerado; não ensaiado |
| `backup.functions.ts` → administração | `assertAdmin` em todas as operações inspecionadas; backups completos | Rever seleção run/tabela/Storage e pesquisa; sem ampliar autorização |

Mapa concluído dos caminhos localizados no código; **não é certificação exaustiva de todos os links assinados ou políticas**. Chamador da antiga fatura PDF, MCP e ensaios diretos de jobs permanecem tarefas de verificação B3, não alterações desta entrega.

### Ficheiros e migrações
- Migrações **0255–0259**, espelhos idênticos em `drizzle/migrations` e `supabase/migrations`: gate/auditoria/projeções; helper de revisão retirado e revogado; preview read-only próprio; teste descartável revertido; redação de campos mistos e resumos guardados. Tipos regenerados automaticamente.
- `src/lib/projects/`: `b1-projection.ts`, `use-project-access.ts`, `use-planner.ts`, `use-default-rates.ts`, `default-rates.functions.ts`, `use-project-entry-figures.ts`, `use-gantt-actuals.ts`, `use-historical-time.ts`, `use-stage-budget-control.ts`, `use-live-plan-for-diff.ts`, `project-area-tabs.ts`, `AGENTS.md`.
- `src/components/projects/`: `b1-operational-insights.tsx`, `project-planner-inspector.tsx`, `gantt-chart.tsx`, `retainer-monitor-panel.tsx`; `src/components/planner/planner-gantt.tsx`.
- `src/routes/_app.projects.$projectId.tsx`, `src/routes/_app.projects.gantt.tsx`; homepage inspecionada/preservada (no-rates, nenhuma alteração necessária).
- `src/lib/quotes/use-team-pricing-averages.ts`, `use-resource-pricing.ts`: opção enabled para não consultar preços globais no contexto B1; cálculos/documentos de propostas inalterados.
- `scripts/test-project-b1-values.test.ts`, este relatório/evidências e `roadmap.md`.

### Limites para a futura aprovação
B1 continua OFF. Não foi ensaiado um corte real ON, nem todos os painéis financeiros completos em cada sessão sob ON; as leituras projetadas foram verificadas na sessão real, a apresentação all-OFF apenas na cópia com simulação local. B2/B3 não implementados. Antes de autorizar ON, rever a matriz atual e realizar o ensaio de corte separado; não usar a presente entrega para afirmar isolamento completo dos leitores legados.