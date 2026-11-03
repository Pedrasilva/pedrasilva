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
- Cópia final `fa3385f3-4d6a-4667-b25d-da207114e48b` e proposta `a9c` (identificação completa temporária removida com a cópia) eliminadas; a tentativa inicial de preparação também foi eliminada. Leituras finais: **zero projetos e zero propostas** com o nome `[QA DISPOSABLE] One Gantt Mint`.
- Nenhum erro de execução no teste final. Não foi repetida a matriz completa de permissões nem o ensaio de alteração de proposta bloqueada para acionar os três triggers; a exclusão foi aplicada às definições existentes sem mexer em registos reais. O Gantt global usa a entrada única, mas a comparação global não teve um ensaio visual completo após a mudança.

## Capturas PT
- `docs/one-project-gantt/01-schedule.png` — cópia antes do gesto.
- `docs/one-project-gantt/02-resizing.png` — pega de aprovação durante o gesto.
- `docs/one-project-gantt/03-reloaded.png` — prazo operacional 19 janeiro após recarregar.
- `docs/one-project-gantt/05-undo.png` — após Undo na mesma sessão.

Limite estrutural: há uma entrada/desenho/controlos partilhados, mas os adaptadores e formulários de inspetor específicos de proposta/projeto permanecem separados; não se declara uma fusão integral de todos os formulários nem de todas as opções comerciais.