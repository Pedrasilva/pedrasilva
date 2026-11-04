# Fase B1 — plano antes da implementação (4 novembro 2026, 09:22 UTC)

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