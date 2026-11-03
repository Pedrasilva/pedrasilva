# Um único Gantt para propostas e projetos

## 1. Inventário atual

| Superfície | Ficheiros e renderização | Diferença atual |
|---|---|---|
| Proposta CRM → Planeamento | `src/routes/_app.crm.quotes.$quoteId.tsx:741` → `src/components/quotes/quote-planning-tab.tsx:131` → `QuoteGantt` em `src/components/planner/planner-gantt.tsx` | Referência das interações pretendidas. Usa `ProposalGantt`, inspetor da proposta e barras com `stage_role`. |
| Projeto → Calendário | `src/routes/_app.projects.$projectId.tsx:1140–1165` → `QuotePlanningTab` quando existe proposta; `ProjectGantt` caso contrário | A proposta convertida também termina em `ProjectGantt`, com adaptador/inspetor próprios. Apesar do mesmo desenho base, há dois conjuntos de controlos. |
| Gantt global de Projetos | `src/routes/_app.projects.gantt.tsx:388` → `GanttChart` diretamente | Entrada independente, sem o mesmo conjunto de controlos/inspetor. |
| Desenho comum das barras | `src/components/projects/gantt-chart.tsx` | É já o desenho partilhado pelos dois wrappers; não é um terceiro calendário a manter. |
| Projeto → Visão geral | `src/routes/_app.projects.$projectId.tsx` | Não renderiza outro Gantt. Há importação/preparação antiga de dados de Gantt sem renderização própria; remover apenas o código comprovadamente sem uso. |
| Projeto → Arquitetura | Mesmo ficheiro, linhas 1081–1090 → `QuotePaymentScheduleTab` e `ArchitectureFinancialBreakdown` | Tabelas financeiras, não Gantt. Não alterar valores nem pagamentos. |
| Projeto → Alocações | `src/routes/_app.projects.$projectId.allocations.tsx` | Cobertura, matriz colaborador/fase, conflitos e sugestões; não tem Gantt próprio. A edição de calendário deve abrir a mesma superfície de planeamento. |
| Recursos / Aprovações / Planeamento semanal | `src/components/projects/resource-pool.tsx`, `ApprovalsPanel`, `src/components/projects/week-planning-board.tsx` | Não são Gantts alternativos. O quadro semanal mantém o seu fluxo separado de publicação e horas. |
| Documento da proposta → cronogramas impressos | `src/components/psa-composer/block-renderer.tsx`: `BlockBody`, casos `timeline` (692), `gantt_design`/`gantt_construction` (822), `appendix_gantt` (1939) e `GanttRotatedAppendix` (2393) | Saídas documentais sem arrastar/inspetor; preservadas, não são editores operacionais. Renderizadas nas pré-visualizações/paginação do Composer. |

## 2. Uma experiência de planeamento

- Manter `QuotePlanningTab` / `QuoteGantt` como entradas únicas, aceitando contexto de proposta, projeto com proposta ou projeto autónomo.
- Extrair um único conjunto de toolbar, seleção, barras, arrastar/redimensionar, dependências e inspetor. Remover os wrappers editoriais duplicados `ProposalGantt`/`ProjectGantt`; manter adaptadores de dados distintos, não dois Gantts.
- Encaminhar também o Gantt global pelo desenho/superfície comum, mantendo comparação entre projetos e respetivas permissões; a edição abre o contexto operacional do projeto, nunca a proposta.
- Propostas não convertidas continuam relativas. Projetos usam exclusivamente datas e identificadores operacionais; feriados e fechos entram no calendário de dias úteis. A avença permanece abaixo do Gantt.
- Nenhum campo do inspetor operacional escreve na proposta. Campos comerciais/documentais permanecem só de leitura. Datas, duração e alocações guardam apenas nos registos operacionais, através do mecanismo atómico e Undo existente.

## 3. Aprovações: fases reais, não intervalos inventados

**Diagnóstico:** a Mint já tem duas fases `Análise e aprovação (cliente)` em `pm_stages`, ligadas às fases da proposta por `source_quote_stage_id`. Não falta a fase nem a data. Falta o papel: `quote_stages.stage_role='client'`, mas `pm_stages` não tem `stage_role` e `buildProjectGanttTree` força todas as linhas a `architecture`.

**Representação proposta:** adicionar um papel operacional explícito `pm_stages.stage_role`, incluindo `client`. Manter `stage_kind` para distinguir fases regulares e avenças; não reutilizar esse campo e não representar aprovação como um espaço vazio.

- As barras `client` reutilizam o desenho e os gestos da proposta, com início/fim/duração em dias úteis. A edição guarda a própria fase operacional; não muda a fase original nem o contrato de referência.
- Para novas fases convertidas, preencher o papel por um mecanismo aditivo de inserção, sem alterar `pm_convert_relative_quote`.
- Para fases existentes, utilizar o papel do snapshot aceite imutável, validado pelo identificador de origem, quando ainda não existe papel operacional preenchido. Não inferir pelo nome nem ler continuamente o papel da proposta mutável. Sem evidência inequívoca, pedir classificação explícita em vez de inventar.
- Não atualizar as fases reais da Mint nesta tarefa. Na cópia descartável, persistir o papel operacional e testar redimensionamento, recarregamento e Undo.
- Não inventar horas ou custos para uma aprovação. A prevenção de novas reservas de equipa em barras de cliente acompanha o papel operacional, preservando qualquer histórico já existente.

## 4. Cliente da Mint: ligação correta, apresentação errada

Leitura atual: projeto `da46fd5d-309f-4f9f-b0d6-107cd61dc907`, proposta e oportunidade têm a mesma `company_id`, correspondente a **SMILEPROVIDER, LDA**. O projeto foi criado em **3 novembro 2026, 14:25 UTC**. A conversão escreveu a empresa corretamente; `pm_projects.client` ficou NULL.

`src/components/projects/project-client-field.tsx` mostra exclusivamente esse texto antigo, não o nome da empresa ligada. Por isso aparece «Sem cliente».

**Correção:** resolver o nome pela `company_id` do próprio projeto, através de leitura com as permissões existentes; usar `client` como fallback legado. Não guardar nada ao abrir a página. Para novas ligações, preencher o texto vazio numa inserção/alteração explícita da empresa, sem mudar a função de conversão nem nomes existentes.

**Pré-visualização de backfill, não aplicação:** dois projetos convertidos têm empresa mas texto vazio: **Clinica Mint II → SMILEPROVIDER, LDA** e **2522 Escritórios Banco CTT - Atrium 2 → Banco CTT, SA**. Cinco outros projetos ligados a propostas não têm empresa nem na proposta/oportunidade: Uralchem IV, Escritórios BCG, Mastercard, CTR Capital Towers Restaurant e Apartamento Tiago Carreiras; não há base para atribuir-lhes uma empresa.

Não executar backfill agora: a Mint é expressamente só de leitura. A correção de apresentação resolve o rótulo sem alterar o registo. Qualquer preenchimento persistente dos projetos existentes requer autorização separada e lista exata de linhas.

## 5. O que ainda sincroniza e como parar

A Mint tem `sync_status='live'` e `last_synced_at=NULL`. O badge em `src/components/projects/project-sync-status-badge.tsx` interpreta esse estado como sincronização contínua; não prova que tenha ocorrido uma sincronização.

Existem efetivamente três triggers antigos ativos, verificados nas definições atuais:

- `sync_quote_stage_to_pm`: nome, início/fim, cor, ordenação, orçamento, modelo de faturação, `is_self`, faturação independente dos filhos e mensalidade de avença; também atualiza `last_synced_at`.
- `sync_quote_allocation_to_pm`: início/fim, horas/dia e percentagem de alocação.
- `sync_quote_payment_to_pm`: rótulo, trigger, tipo/valor, datas previstas, ordenação, notas, override, direção, offset, IVA e condições de pagamento.

São sincronizações por UPDATE de linhas com identificador de origem, limitadas a projetos `live`; não sincronizam cliente/empresa, nem constituem uma reconciliação completa. As proteções de proposta convertida bloqueiam normalmente edições, mas não tornam esses triggers seguros ou necessários.

**Proposta:** numa migração aditiva, impedir essas três propagacões quando o destino já está convertido/quote-linked. O bloqueio deve funcionar mesmo se o estado antigo continuar `live`, sem atualizar a Mint ou outras linhas. Substituir o badge por «Origem: proposta convertida» e retirar a possibilidade de reativar sincronização num projeto convertido.

Desativar a propagação de pagamentos não altera qualquer linha, valor ou data do plano: apenas impede futuros UPDATEs vindos da proposta. Não alterar o gerador de pagamentos, a função de conversão nem as tabelas/snapshots do contrato de referência. A proposta pode continuar acessível como documento de origem; não é fonte do planeamento operacional após conversão.

## 6. Alterações técnicas e validação após aprovação

- Migrações aditivas idênticas em `drizzle/migrations` e `supabase/migrations`: papel operacional, preenchimento apenas de novas ligações e bloqueio de sincronização em convertidos. Sem backfill de dados reais.
- Reutilizar e atualizar os adaptadores, `converted-quote-schedule.ts`, `build-project-gantt-tree.ts`, inspetor, entradas de projeto/global, cliente e badge; traduções EN/PT em conjunto. Registar as regras em `AGENTS.md` do módulo.
- Testes de regras: um único destino operacional, aprovação identificada por origem/snapshot, calendário com feriado/fecho, nenhuma propagação pós-conversão e cliente com empresa mas texto vazio.
- Criar uma cópia convertida descartável da Mint, nunca converter/editar a real. Arrastar e redimensionar uma barra de aprovação no separador Calendário; conferir datas persistidas após recarregar e Undo.
- Comparar proposta, cronograma relativo, contrato de referência e pagamentos antes/depois; devem permanecer idênticos. Eliminar a cópia e provar zero linhas de teste.
- Relatório com ficheiros/migrações, resultados e capturas PT antes/durante/depois do redimensionamento. Até aprovação deste plano, nenhuma alteração funcional ou de dados será feita.