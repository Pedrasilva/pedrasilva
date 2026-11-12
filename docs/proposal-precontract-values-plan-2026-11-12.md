# Valores livres antes do contrato — plano para aprovação

## Decisão e limites
D50 regista a decisão de Luis de 12/11/2026, 16:23 UTC. Ainda não foi alterado código, executada migração ou eliminado histórico. B1 verificado OFF, revisão 10. A assinatura ou conversão, e não a aceitação simples, inicia as proteções contratuais.

## Onde os avisos e históricos são acionados hoje
| Entrada | Comportamento atual e origem | Alteração proposta |
|---|---|---|
| Gantt da proposta, fases normais | `ProposalScheduleAdapter` e `quote-planner-inspector.tsx` gravam `quote_stages.budget` diretamente; não foi encontrado diálogo de responsabilidade nem histórico comercial próprio nestes caminhos. Se a proposta está convertida, `QuoteScheduleEntry` encaminha para o adaptador operacional. | Preservar edição livre em Draft/Sent/Approved; usar a fronteira contratual explícita, não apenas `model.operational`. Auditar caminhos de valores herdados, honorários fixos e Estimate. |
| Avença da proposta, cartão e painel | `retainer-settings.tsx` abre sempre confirmação ao alterar mensalidade não operacional. `quote_retainer_change_value` exige cliente de acordo, responsabilidade e motivo, depois insere em `quote_retainer_value_history`. `quote_retainer_value_guard` bloqueia também uma atualização direta sem a ação, independentemente do estado da proposta. Meses usam `changeGanttStage` e não pedem este diálogo. | Antes de contrato, guardar mensalidade e meses diretamente através de ação validada, sem confirmação, motivo ou inserção comercial. Após contrato, preservar ação confirmada e proteção equivalente contra atualização direta. |
| Calculadora / Estimate | `quote-fee-calculator-card.tsx` → `CalculatorApplyDialog` → `quote_apply_calculator`: confirmação de sobrescrita de valores manuais, substituição de fases e eliminação de linhas. Não há motivo/responsabilidade nem inserção nas duas tabelas comerciais. Existem snapshots de desfazer em `quote_template_imports`, que não são histórico comercial. | Retirar a confirmação exclusivamente de sobrescrita de valores pré-contrato, incluindo a exigência `_overwrite_manual` correspondente no servidor. Preservar confirmação de substituição/eliminação de estrutura e desfazer/revisões; fornecedores e avenças continuam fora da aplicação da calculadora. Não retirar evidência documental ou guardas de aceitação/conversão. |
| Gantt do projeto / proposta convertida | `planner-gantt.tsx` → `GanttValueDialog`; `GanttStageCommercial`, `GanttContractSummary` e `GanttCommercialHistory` mostram referência, diferenças e histórico. `pm_gantt_change_value`, `pm_gantt_value_guard`, `pm_gantt_new_stage_history` e `pm_retainer_sync_schedule` registam valores, novas fases ou extensões. | Manter proteções dos projetos contratados/convertidos e das avenças futuras; impedir que ligações antigas pré-contrato produzam proteções/histórico indevidos. Projetos diretos com referência contratual comprovada continuam protegidos. Ausência de montante em projeto antigo não significa autorização para o desbloquear. |

## Estado a utilizar — detalhes técnicos
- A fonte é `fee_proposals.signed_at IS NOT NULL OR fee_proposals.pm_project_id IS NOT NULL`, reconciliada com o ciclo `crm_quote_lifecycle` (`signed`/`converted`). Não usar `quote_status='approved'`, `approved_at`, snapshot aceite, existência de documento de contrato em rascunho, `is_locked` ou presença de orçamento como prova de contrato.
- Expor um único indicador calculado no servidor, `hasContract`, para os quatro caminhos. O browser não decide direitos nem cria a referência.
- `is_locked` e as verificações de acesso continuam independentes: a ausência de contrato não desbloqueia propostas protegidas por outros motivos.
- No projeto, resolver a ligação de conversão efetiva e a referência contratual comprovada, incluindo projetos diretos e evidência de origem existente. Não classificar projetos antigos como proposals Draft por uma ligação incompleta. Casos ambíguos permanecem protegidos e são reportados, sem preenchimentos reais automáticos.
- Fixar uma referência imutável por fase/mensalidade e total na primeira assinatura ou conversão, uma só vez, com evidência e identificadores remapeáveis. Hoje a assinatura manual e DocuSign apenas carimbam `signed_at`; as leituras de referência estão sobretudo em baselines do projeto/aceitação. Acrescentar a fronteira de assinatura e reutilizar a referência na conversão, sem substituir snapshots existentes ou inventar valores antigos.
- Não reutilizar como baseline um histórico de edição pré-contrato. Preservar referências já existentes; correções/reconstruções em dados reais exigem relatório e OK separado.
- Validar estado, permissão, âmbito, revisão/valor esperado, valores não negativos e concorrência dentro da transação. A regra aplica-se às ações e aos triggers, incluindo gravações diretas e importação/reaplicação. Bloqueios fiscais de emitidas/pagas ficam intactos.
- Migração aditiva idêntica em `supabase/migrations` e `drizzle/migrations`; sem alterações a papéis, RLS de outros módulos ou B1.

## Auditoria de históricos existentes — leitura às 16:25 UTC
| Conjunto | Resultado |
|---|---:|
| `quote_retainer_value_history`, todas as propostas | **0 linhas** |
| Histórico de projeto ligado a proposta existente sem assinatura e sem conversão | **0 linhas** |
| `pm_gantt_value_history`, total | 133 linhas |
| Projeto convertido Uralchem IV | 3 linhas |
| Projeto direto Bolshaya | 7 linhas |
| Projeto já inexistente, origem atual não reconstruível pela ligação | 123 linhas |

**Lista de linhas comprovadas de propostas Draft/Sent/Approved pré-contrato: nenhuma.** Oleiro está `draft`, sem `signed_at`, sem `pm_project_id`, não bloqueado; não foi alterado.

As 123 linhas órfãs não demonstram histórico de propostas Draft: a ligação ao projeto/quote já não existe. Nomes e motivos contêm fixtures descartáveis, mas não classifico todas como testes sem prova histórica. Permanecem integralmente preservadas. Uma contagem inicial com LEFT JOIN incluiu órfãos como se fossem propostas não convertidas; foi corrigida exigindo a existência da proposta.

As três linhas Uralchem são: `c342842a-a773-4b0c-8c40-55fc58224f93` (F2, 160 000 → 182 500 €, 11/11 15:58:08 UTC), `80520924-9d3a-44f0-8d0c-b5cc76bc48b3` (nova fase, 0 €, 16:00:25), `78cdf563-8474-4652-9308-4ee41b4ab4e8` (nova fase, 0 → 207 400 €, 16:01:11). A proposta continua com enum `approved` e sem assinatura, mas **está convertida**; as proteções são portanto válidas. Não eliminar estas linhas.

## Implementação após OK
1. Indicador contratual comum no servidor e referência imutável na assinatura/conversão, sem backfill real automático.
2. Aplicar o indicador aos cartões/painel/Gantt, marcadores, comparação e acesso ao histórico; retirar confirmação de valores da calculadora só pré-contrato.
3. Alinhar ações e triggers; suprimir novas linhas comerciais pré-contrato, preservando validação, revisão/desfazer, snapshots de documento, permissões e proteção fiscal.
4. Atualizar regras locais e testes, migrar só o código/esquema autorizado e entregar ficheiros/resultados. Qualquer necessidade de mexer em dados reais obriga a parar.

## Testes — apenas depois de aprovado
- Criar primeiro uma quote copiada separada; todos os documentos, revisões, fases e eventuais projetos de teste têm de pertencer à cópia (D46/D47).
- Draft, Sent e Approved sem assinatura: mudar valor de fase, mensalidade e meses (aumentar/reduzir), reaplicar cálculo; guardar e reabrir, sem diálogo de responsabilidade/acordo/motivo, marcador contratual ou novas linhas comerciais.
- Repetir por chamada direta autorizada; garantir que não depende de esconder o diálogo. Testar concorrência e valores inválidos.
- Na cópia assinada, confirmar referência fixa e exigência de motivo/responsabilidade/acordo; na conversão da cópia, verificar que a referência não é recriada a partir de valores posteriores.
- Validar Gantt operacional, extensões e alterações futuras com históricos novos somente pós-contrato; preservar fiscal congelado e impedir acesso cruzado, em fixtures.
- Confirmar que snapshots/desfazer e consentimento de eliminação estrutural continuam disponíveis, sem confirmação de mera mudança de valor.
- Unitários por regra e teste end-to-end autenticado com readback; comparar hashes de dados reais antes/depois e B1 OFF. Não transicionar nem editar Oleiro real.

**Aguarda OK de Luis. Não há limpeza de histórico incluída neste plano.**
