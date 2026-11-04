# Gantt operacional único — 3 novembro 2026

## Inventário e implementação
Inventário completo e diagnóstico apresentados no plano aprovado: `.lovable/plan/um-único-gantt-para-propostas-e-projetos-2026-11-03.md`.

- Todos os editores de projeto, incluindo Gantt global e projetos sem proposta, entram agora por `QuoteGantt`. Não existe export/renderização alternativa `ProjectGantt` nem chamada direta a `GanttChart` nas rotas de projeto.
- `planner-surface.tsx` concentra desenho, frame, zoom, PDF e controlos de inserir/indentar/desindentar. Os adaptadores de dados e os campos específicos dos inspetores continuam separados por contexto, para não permitir gravações operacionais na proposta. Não foram fundidos os formulários comerciais da proposta com os operacionais.
- As barras de cliente utilizam o mesmo desenho e gestos em ambos os contextos. Corrigido um defeito concreto: os pontos de dependência, mesmo invisíveis, interceptavam as pegas de redimensionamento das barras finas. As pegas passaram a ter prioridade; os pontos continuam acessíveis na parte exterior da barra.
- Os projetos deixam de usar a ordenação/hierarquia mutável da proposta para apresentar o calendário. Datas e ordenação são operacionais; papéis legados vêm apenas do snapshot aceite, através de leitura protegida que devolve somente ID/papel. A avença mantém-se abaixo das fases regulares na ordenação visual.
- Propostas/cronogramas documentais do Composer não foram alterados. Arquitetura e Alocações não têm outro Gantt: são tabelas financeiras e de cobertura.

## Aprovação operacional
Adicionado `pm_stages.stage_role`, opcional para não reescrever linhas reais. Papéis válidos: architecture, client, supplier_group, supplier_phase.

- Novas fases com origem de proposta recebem o papel do snapshot aceite no INSERT.
- Fases legadas sem papel persistido usam apenas o papel daquele snapshot com ID correspondente. Sem evidência, a edição do calendário ligado fica bloqueada.
- A Mint tem já as suas duas fases reais de aprovação; não foi necessário criar ou alterar qualquer fase real.
- Novas alocações/reatribuições para fases `client` são rejeitadas; edições de alocações existentes na mesma fase continuam preservadas. Não foram criadas horas de teste.

## Cliente: causa e correção
Empresa da Mint, proposta e oportunidade: **SMILEPROVIDER, LDA**. O projeto já tinha a empresa corretamente ligada. O erro estava nos dois rótulos que liam o campo legado `client=NULL`.

Ambos resolvem agora o nome pela empresa do projeto, sem UPDATE ao abrir. Novos INSERTs e alterações explícitas de empresa podem preencher o texto vazio.

**Backfill não aplicado:** dois candidatos com empresa e texto vazio — Mint/SMILEPROVIDER e Escritórios Banco CTT - Atrium 2/Banco CTT. Cinco projetos sem empresa comprovada continuam sem atribuição presumida. Nenhuma linha real foi preenchida.

## Sincronização desativada
As três funções antigas de sincronização de fases, alocações e pagamentos receberam exclusão explícita para projetos ligados a proposta ou referidos por `fee_proposals.pm_project_id`. O estado legado `live` não consegue contornar essa exclusão. Nenhuma linha de pagamento foi alterada.

O badge agora indica **Origem: proposta convertida**, sem botão de reativação. A ligação é documental, não uma fonte de planeamento. Contrato de referência e plano de pagamentos ficam intactos; `pm_convert_relative_quote` não foi alterada.

## Migrações e ficheiros
- `drizzle/migrations/0221_project_schedule_role_and_conversion_isolation.sql`
- Mirror idêntico: `supabase/migrations/20261103170000_project_schedule_role_and_conversion_isolation.sql`
- `src/components/planner/planner-gantt.tsx`, novo `planner-surface.tsx`
- `src/lib/projects/build-project-gantt-tree.ts`, `use-planner.ts`, novos `use-project-stage-roles.ts`, `project-client-name.ts`
- `src/components/projects/gantt-chart.tsx`, `project-planner-inspector.tsx`, `project-client-field.tsx`, `project-sync-status-badge.tsx`
- `src/routes/_app.projects.$projectId.tsx`, `src/routes/_app.projects.gantt.tsx`
- `src/i18n/locales/{en,pt-PT}/projects.json`
- `scripts/test-project-schedule-isolation.test.ts`, regras root/módulo, roadmap, este relatório e capturas.

## Verificação e limpeza
- **52 testes passaram**, incluindo papel `client`, cliente com campo legado vazio e regressões de dias úteis/feriados/fechos. Paridade EN/PT passou; AST UI: zero candidatos.
- Navegador autenticado, cópia convertida descartável: aprovação **8–14 janeiro 2027 (5 dias úteis)** redimensionada para **8–19 janeiro (8 dias úteis)**. Leitura operacional e recarregamento confirmaram 19 janeiro e papel `client`.
- Undo validado na mesma sessão após um segundo redimensionamento: restaurou 19 janeiro. Tentativa de Undo numa sessão nova não restaurou a edição anterior; não se declara Undo entre sessões verificado.
- Comparação integral após os gestos: fee_proposals, quote_stages, quote_allocations, quote_relative_schedules, três tabelas de contrato de referência e pm_payment_schedule_items ficaram idênticos ao início do teste. Projeto e fases reais da Mint também ficaram idênticos.
- Cópia final `fa3385f3-4d6a-4667-b25d-da207114e48b` e respetiva proposta eliminadas; a tentativa inicial de preparação também foi eliminada. Leituras finais: **zero projetos e zero propostas** com o nome `[QA DISPOSABLE] One Gantt Mint`.
- Nenhum erro de execução no teste final. Não foi repetida a matriz completa de permissões nem o ensaio de alteração de proposta bloqueada para acionar os três triggers; a exclusão foi aplicada às definições existentes sem mexer em registos reais. O Gantt global usa a entrada única, mas a comparação global não teve um ensaio visual completo após a mudança.

## Capturas PT
- `docs/one-project-gantt/01-schedule.png` — cópia antes do gesto.
- `docs/one-project-gantt/02-resizing.png` — pega de aprovação durante o gesto.
- `docs/one-project-gantt/03-reloaded.png` — prazo operacional 19 janeiro após recarregar.
- `docs/one-project-gantt/05-undo.png` — após Undo na mesma sessão.

Limite estrutural: há uma entrada/desenho/controlos partilhados, mas os adaptadores e formulários de inspetor específicos de proposta/projeto permanecem separados; não se declara uma fusão integral de todos os formulários nem de todas as opções comerciais.

## Follow-up — 3 novembro 2026, 18:27 UTC

### 1. Overview e consumo do orçamento
Na sessão nova autenticada, a Mint apresentou **Active, 1 Jun 2026, 23 Jul 2027 e 262d**, tanto no cabeçalho como no painel (captura `followup-mint-overview.png`). Não reproduzi campos realmente vazios; os quatro valores estavam presentes também no DOM. Não atribuo a causa a dados ou traduções sem reprodução.

Proteção de apresentação aplicada ao `DetailRow`: retirado `truncate` e impedida a compressão do valor com `shrink-0`. O texto não pode ser reduzido a largura zero por um rótulo mais longo. A validação visual desta proteção em PT/EN continua pendente: a ligação aos dados ficou indisponível antes da repetição. Nenhuma alteração de datas/estado foi feita.

**48 € → 1 812 € está reconciliado com os registos atuais, não resulta do Gantt:**
- Adjudicação/Pursuit: **1 h × 47,99 € = 47,99 €**, arredondada na UI para 48 €.
- Horas operacionais: **58,5 h × snapshot bloqueado 30,15 € = 1 763,775 €**, em 12 atividades da fase Programa Base / Conceito, com datas de trabalho entre 6 julho e 2 novembro.
- As 12 atividades têm `created_at` em **3 novembro, 17:50:17–17:56:17 UTC**, antes deste follow-up. Não foram criadas por estes testes. Sem auditoria adicional não atribuo quem as criou.
- Total: **1 811,765 €**, arredondado para **1 812 €**; **5,84818%** de 30 980 €, apresentado como 6%. Fórmula em `_app.projects.$projectId.tsx`: `actuals.cost + hist.cost + pursuit.cost`. Não alterada.
- O cálculo é correto para os registos existentes; não é uma confirmação da legitimidade das horas. Nenhuma hora/snapshot foi alterada ou recalculada.

### 2. Teste efetivo dos três triggers
Cópia identificada `[QA DISPOSABLE] Gantt follow-up`, convertida pelo diálogo normal: projeto `7285f0ca-778b-4c7f-af69-c3f9c52b5941`, proposta `a31c8078-6624-4dd8-8cae-247a8a574f63`.

A Mint não tinha alocações de proposta para copiar. Acrescentada exclusivamente à fixture uma alocação de 0,5 h/dia com ligação `source_quote_allocation_id` à sua cópia operacional. O bloqueio da proposta foi temporariamente retirado **só na fixture**, mantendo a ligação ao projeto; restaurado após as edições.

Edições confirmadas sem erro: nome de fase de aprovação; horas/dia da alocação **0,5 → 0,75**; rótulo/notas de pagamento. Os UPDATEs acionaram os triggers instalados. Comparação integral de todas as linhas, incluindo timestamps, antes/depois:

| Tabela operacional | Resultado |
|---|---|
| pm_projects | Idêntica |
| pm_stages | Idênticas |
| pm_allocations | Idênticas |
| pm_payment_schedule_items | Idênticas |

Logo, os três caminhos de UPDATE não propagaram estas alterações apesar do estado legado `live`. O teste de fases alterou o nome, não o prazo; não se declara uma matriz de todas as colunas/INSERT/DELETE.

### Gantt global e dependências — incompleto
Gantt global abriu autenticado sem erros de execução, desenhando a cópia convertida e a Mint pela entrada única (`followup-global.png`). A captura revela calendários por projeto com origem própria; não declara alinhamento temporal global entre todos os projetos.

A tentativa seguinte, de criar um projeto sem proposta para a captura e verificar os gestos de dependência em ambos os contextos, bloqueou quando a ligação aos dados ficou indisponível. Leitura de diagnóstico devolveu **connection pooler unavailable**; leitura pelo navegador também excedeu o tempo limite. O processo foi parado. **Não há confirmação visual de projeto sem proposta nem criação/edição de dependências neste follow-up.** Os 52 testes existentes passaram, mas não substituem estes ensaios visuais.

**Limpeza ainda pendente por indisponibilidade da ligação:** a cópia convertida acima, proposta/documento/oportunidade de teste e alocações. A tentativa de criação `[QA DISPOSABLE] No proposal Gantt` não devolveu ID; a sua existência deverá ser consultada antes de qualquer repetição. Não fica nenhum processo de testes a correr. Não se declara zero fixtures nem preservação integral final sem a leitura de limpeza.

### 3. Cinco clientes por atribuir — nenhum backfill
As oportunidades abaixo são as ligadas às **propostas**; quatro projetos têm `opportunity_id=NULL`, embora a proposta conserve a ligação. Projeto, proposta e oportunidade não têm empresa preenchida.

| Projeto | Oportunidade da proposta | Proposta | Candidato para revisão manual, não comprovado |
|---|---|---|---|
| 2502 Uralchem IV | 2502 Uralchem IV | 2502 Uralchem IV | Há OJSC UCC URALCHEM, URALCHEM, JSC e Uralchem Trans LLC; ambíguo, não escolher automaticamente |
| 2521 Escritórios BCG | 2521 BCG | 2521 BCG | BCGCC LISBON, UNIPESSOAL LDA — correspondência nominal, por confirmar |
| 2609 Mastercard | 2609 Mastercard | 2609 Mastercard | Nenhuma empresa Mastercard encontrada na pesquisa nominal; sem candidato demonstrável |
| 2028 CTR Capital Towers Restaurant | 2028 CTR Capital Towers Restaurant | 2028 CTR Capital Towers Restaurant | Sem candidato demonstrável; “Capital” sozinho não prova Limestone/Mercan |
| 2506 Apartamento Tiago Carreiras | 2506 Apartamento Tiago Carreiras | 2506 Apartamento Tiago Carreiras | Sem candidato demonstrável; TIAGO ALVES não corresponde a Tiago Carreiras |

### Ficheiros e verificações deste follow-up
- Código: `src/routes/_app.projects.$projectId.tsx` — apenas proteção de largura dos valores no painel.
- Documentação: este relatório e `roadmap.md`; capturas `docs/one-project-gantt/followup-{mint-overview,global}.png`.
- Sem novas migrações, backfill, alteração de funções, conversão da Mint ou alterações a dados reais de propostas/projetos/horas/pagamentos.
- 52 testes passaram; último sinal automático: **build OK, 18:30:46 UTC**.
- **Não aceitar ainda como verificação completa:** dependências, projeto sem proposta e limpeza aguardam recuperação da ligação aos dados.

### Recuperação e limpeza — 3 novembro, 20:26–20:28 UTC
Após Tiny → Small, Auth, base de dados e Auth→DB responderam; PgBouncer ativo, memória 26%, 6/90 ligações e 1/400 clientes. Escrita no projeto descartável executada e anulada.
Limpeza integral confirmada às 20:28:01 UTC: projeto `7285f0ca-778b-4c7f-af69-c3f9c52b5941`, proposta `a31c8078-6624-4dd8-8cae-247a8a574f63`, oportunidade `36e71f1e-6b3b-42b5-abab-8d3063df94b2` e documento `a340b50f-fc23-4078-af4b-2ed128509508` eliminados com dependências, numa transação. Primeira tentativa falhou por FK de snapshot e foi anulada; segunda respeitou a ordem projeto → quote → documento → oportunidade.
`[QA DISPOSABLE] No proposal Gantt` não existia. Leitura posterior: **projects=0, proposals=0, opportunities=0, allocations=0, old_document=0**. Nenhum dado Mint alterado.
Esta execução seguiu a ordem expressa limpeza → item 2 → item 5 Fase A. Os ensaios antigos de gestos de dependências e DATE na proposta convertida não foram repetidos nesta execução e continuam não verificados.

## Item 1 — testes restantes, 4 novembro 2026, 01:11–01:20 UTC

**Só testes e documentação; sem alterações à aplicação, migrações ou dados reais. Fase A continua ON.** Criados projeto sem proposta `ae9b540e-0a9e-43a7-9f49-82871544995e` e proposta sintética descartável `4c093cff-b4c2-45e9-b2da-481f8978d52f`, convertida pelo RPC normal após snapshot aceite, originando projeto `31b1e6e9-a5e7-47e6-a743-d428374a4999`. Cada contexto tinha Design A → aprovação cliente → Design B. Não é uma cópia integral da Mint; usa apenas a empresa já existente como ligação e fases novas. Numeração explícita QA, sem consumir número comercial; sem recursos, horas ou pagamentos novos.

### Dependências — ações persistentes passaram; gestos não certificados
Nos três ecrãs (projeto sem proposta, projeto convertido e builder da proposta convertida), a ação partilhada `changeGanttDependency('project', scope, ...)` criou FS de Design A para aprovação; alterou o sucessor para Design B e lag para +2; eliminou a ligação. Leituras `pm_gantt_state` confirmaram 1 → 1 alterada → 0; Gantt recarregado com capturas. O builder convertido utiliza corretamente IDs operacionais, não escreve dependências da proposta.

**Limite importante:** a criação por arrasto exterior foi tentada duas vezes e não produziu ligação. Foi usada depois a ação do adaptador invocada no navegador, não o gesto de utilizador. Logo, os resultados não certificam criar/mover/apagar por todos os controlos visuais, nem dependências de uma proposta ainda não convertida. Nenhuma correção de código efetuada por ser pedido de testes apenas.

### Aprovação — verificação falhou
A pega `data-stage-resize-end` foi arrastada nos três ecrãs; a leitura persistente manteve **20 novembro 2026**, em vez de prolongar a aprovação. As pegas existem e a barra está desenhada, mas **não se confirma que o redimensionamento continua funcional** nesta sessão. Não atribuir a causa à aplicação sem distinguir gesto/escala/estado do navegador. Resultados guardados com `approvalGestureChanged=false`; não substituídos por uma chamada direta bem-sucedida.

### DATE da proposta de origem
A fase sintética foi criada com início **3 janeiro 2000** e atualizada para **4 janeiro 2000**. O bloqueio normal inicialmente devolveu `QUOTE_LOCKED_CONVERTED`. Só na fixture, foi necessário limpar temporariamente `pm_project_id`, `locked_project_id`, `locked_at`, `is_locked` e usar estado draft para impedir o autolock; o projeto conservou `quote_id`, pelo que a exclusão de sincronização continuou aplicável. A ligação/estado foram restaurados após o UPDATE. As linhas integrais de `pm_stages` do projeto convertido permaneceram idênticas antes/depois. A última repetição gravada em `date-results.json` já lê 4 janeiro e é um UPDATE sem mudança; não apresentá-la como a prova exclusiva de 3→4. O teste cobre a exclusão por `pm_projects.quote_id`, não todas as combinações dos dois vínculos.

### Mint Overview — PT e EN a 1050 × 1800
Capturas reais só de leitura: **Estado/Status Ativo/Active**, **Início/Start 1 junho 2026**, **Fim/End 23 julho 2027**, **Restante/Remaining 261d** presentes no painel, sem sobreposição ou valores comprimidos. A troca de idioma foi apenas na instância do navegador, sem guardar preferência do colaborador. Mantidos os dados reais e custos; não executados checks Finance recusados.

### Limpeza e resultado final
Snapshot dos registos QA antes de apagar; zero alocações e fases criadas sem tarefas/horas. Eliminados os dois projetos, a proposta, documento e snapshots por IDs exatos. Leitura independente **01:20:04 UTC**: projetos=0, proposta=0, fases operacionais=0, quote_stages=0, quote_dependencies=0, documento=0, snapshots=0; gate=true. Não foram criados ficheiros Storage.

**23 testes existentes passaram**, mas não tornam os gestos falhados em PASS. Evidência: `docs/one-project-gantt/item1-20261104/` (capturas PT/EN, três contextos, ações, DATE e snapshot de limpeza). **Item 1 fica parcialmente verificado:** falta confirmar os gestos de dependência e redimensionamento de aprovação; não foi alterado código para os corrigir.