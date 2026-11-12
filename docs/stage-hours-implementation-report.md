# Horas por honorários — implementação parcial, 12 novembro 2026

## Estado
**Não certificado para publicação.** B1 OFF. Nenhum fee, equipa, hora ou snapshot real alterado. Apenas colunas nullable/função novas; testes em projeto/conta descartáveis eliminados no fim. D44 e plano aprovado preservados.

## Entregue
- Default Projects venda custo×1,5 partilhado, sem recalcular custos/snapshots; `financial-calculation.ts` não tinha literal 1,75.
- Projeção autenticada servidor: equipa explícita faturável/média simples, fallback HR do atelier, overrides positivos preservados, Backoffice excluído, quota BO incluída.
- Horas por fee, hierarquia, avença mensal, alvo manual separado de alocações. `planned_hours_target` nullable em fases/projetos, sem backfill; `pm_set_hours_target` exige edição Gantt autorizada e rejeita negativos/NaN/Infinity.
- Lista, cálculo de fases da página, painel de horas/edição manual no projeto e no inspector Gantt, totais do overlay Gantt integrados na projeção.
- Novas respostas hours-only e leitores do app removem fees/custos/taxas antes de chegar ao navegador sem Financials; cache por identidade/projeto. Gate financeiro `pm_project_rate_access`; acesso operacional usa projetos visíveis pelo RLS + PSA staff (não usar `can_view_project_area(...,'planning')`, que não é um gate operacional válido).
- Limiares novos âmbar>=85%, vermelho>100%; sem fee não há orçamento zero. EN/PT, auditoria sem candidatos.

## Resultados observados
| Teste | Resultado |
|---|---|
| Fórmulas e regressões (16 testes) | PASS |
| Projeto descartável estima fee 100 000 € | PASS |
| Alvo explícito 250 h persiste e lê novamente | PASS |
| Staff sem Financials recebe 250 h e sem financial/budget na resposta nova | PASS |
| Staff não pode gravar alvo 400 h | PASS |
| Página carregada admin/staff e painel 250 h | PASS; imagens inspecionadas |
| Limpeza projeto/colaborador/recurso/conta/papéis | PASS: zero operacional restante |
| Build e i18n | PASS: build OK, zero candidatos novos |
| Acesso direto antigo `pm_stages.select(id,budget)` pelo staff descartável | **FAIL: devolveu 100 000 €** |
| Certificação de toda a rede/UI/Gantt/picker e utilizador Financials não-admin | PENDENTE |

O FAIL é anterior à nova projeção: política Authorized read pm_stages permite projects.view/all sem Financials; `pm_b1_redact` devolve linha inteira em B1 OFF. Alterações dos leitores do app reduzem exposição nos seus próprios pedidos, mas **não revogam o acesso direto**. Não alterar essas políticas nem a semântica B1/cutover precipitadamente: a correção exige projeções operacionais hours-only e fronteira de leitura financeira por coluna/ação, com revisão do impacto em todas as escritas/cron/intake. Não esconder este bloqueio nem certificar a regra 5.

## Comparação atual após default 50%
| Projeto | Média servidor | Estimativa |
|---|---:|---:|
| Clinica Mint II | 47,625 €/h | 650,4987 h |
| Alcanena | 51,5625 €/h | 447,0303 h |
| Mastercard | 53,075 €/h | 5 934,9976 h |
| Uralchem IV | 58,005 €/h | 11 226,6184 h |

Diferença de centésimos versus investigação: multiplicação sem arredondar venda individual. Estes quatro projetos foram só lidos; não testados por escrita.

## Ficheiros e SQL
- `src/lib/projects/sale-margin.ts`, `hour-budget.ts`, `hour-budget.test.ts`, `hour-budget.functions.ts`, `use-hour-budgets.ts`, `safe-project-rows.functions.ts`, `safe-project-rows.test.ts`.
- `default-rates.functions.ts`, `use-default-rates.ts`, `cost-rates.server.ts`, `b1-projection.ts`, `use-planner.ts`, `use-gantt-actuals.ts`.
- `src/components/projects/hour-budget-panel.tsx`, dashboards `stage-hours-breakdown`, `project-health-table`, `project-effort-table`; `src/components/planner/project-inspector-adapter.tsx`, `planner-gantt.tsx`.
- Routes Projects index/detail; EN/PT projects namespaces; module AGENTS/roadmap/docs.
- `drizzle/migrations/0306_project_manual_hour_targets.sql` = `supabase/migrations/20261112001000_project_manual_hour_targets.sql`, aplicada e idêntica. Sem nova tabela ou data backfill.

## Não terminado
1. Fronteira Data API/RPC direta sem Financials (acima) e todos os leitores legados financeiros, incluindo snapshots de entradas e extras da lista; requer revisão detalhada de impacto antes de alterações de acesso.
2. Teste end-to-end de lista→Gantt→picker, Financials não-admin e projetos negados; gravação manual por botão só foi testada pela ação seguida de leitura/página, não clique completo de todos os painéis.
3. Paginação de fases/tarefas/histórico com >1 000 registos; entradas são paginadas, restantes ainda não. Atribuição legacy quote_stage_id e horas sem fase requerem reconciliação sem mudar números usados antigos.
4. Summary financeiro em euros por pai deve usar valor comercial rollup, não budget do resumo zero; manual targets em hierarquias mistas e snapshots zero de avença precisam testes adicionais.
5. Algumas vistas antigas de resumo ainda podem mostrar ausências/NaN ou classificar horas por custo; não certificadas. Custos HR atuais reutilizam arredondamento do motor de períodos; todos os defaults/overrides devem ser reconciliados antes de certificação.

Nenhuma definição de autenticação, política de armazenamento ou papel real alterada; conta descartável removida.