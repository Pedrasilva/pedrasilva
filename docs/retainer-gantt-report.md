# Avenças no Gantt — 11 novembro 2026

## Resultado e limites
Implementação parcial validada em cópia descartável de Travessa do Oleiro e no seu projeto convertido. **Não certificar publicação integral.** B1 confirmado OFF. Proposta original preservada; cópias operacionais eliminadas.

| Verificação | Resultado |
|---|---|
| Reprodução antes da alteração | Avença inexistente no Gantt; cartão presente |
| 12 meses × 2 000 € | PASS: barra própria, 12 regras mensais, orçamento 24 000 € |
| 18 meses pelo painel na proposta | PASS: cartão e armazenamento 18 meses, 18 pagamentos, 36 000 € |
| Criar pelo botão | PASS: uma nova fase selecionada; bloqueio/ref enquanto guarda |
| Dependência FS de Projecto de Execução | PASS na cópia; usada na conversão |
| Conversão com aceitação/snapshot e calendário real | PASS: 12 filhos mensais, 12 pagamentos da avença, barra real |
| Extensão no painel do projeto para 18 meses | PASS: 18 filhos, 18 pagamentos, 36 000 €; resumo Obra estendido |
| Faturação | PASS: 18 linhas mensais, soma 36 000 €, datas iguais ao resolver de Incoming |
| Testes puros e regressões Gantt | PASS: 44 testes |
| Auditoria i18n / compilação | PASS: zero novos candidatos; build OK |
| Limpeza operacional | PASS: proposta e projeto descartáveis removidos |
| Limpeza de histórico | PENDENTE: seis linhas de auditoria imutável da extensão permanecem, sem projeto operacional; nenhum bloqueio de histórico foi relaxado |
| Financial summary / Architecture / Inflow UI completos | NÃO CERTIFICADO: orçamento e faturação verificados, não toda a cadeia visual |
| Arrasto/resize por rato, edição de todas as dependências | NÃO CERTIFICADO nesta tarefa; gravação partilhada integrada |
| Alteração mensal com confirmação, motivo e histórico | Implementado; NÃO CERTIFICADO end-to-end nesta tarefa |
| Faturas emitidas/pagas, concorrência e alocações não-fee-only | NÃO CERTIFICADO nesta tarefa |

## Armazenamento
- Avença é uma fase existente em `quote_stages` / `pm_stages`: `stage_kind=retainer_monthly`, `retainer_months`, `retainer_monthly_amount`, `start_date`, `end_date`, `retainer_anchor_month`, `is_fee_only` e `parent_stage_id`.
- Projetos conservam filhos técnicos `retainer_month` para histórico/alocações; não aparecem como linhas adicionais no Gantt.
- Criação: `pm_retainer_create`, com grupo Obra e dependência FS. Mudanças de calendário usam `pm_gantt_save`; triggers sincronizam meses. A conversão mantém a sua única criação de filhos.
- Pagamentos ficam em `quote_payment_schedule_items` / `pm_payment_schedule_items`; previsões reais leem `pm_incoming_resolve`. Valores/datas fiscais protegidos não são reescritos.
- Alterações mensais em propostas passam por `quote_retainer_change_value` e `quote_retainer_value_history`; projetos continuam no procedimento comercial auditado existente.

## Inventário real de Oleiro — nada eliminado
| ID | Nome | Tipo | Meses / valor |
|---|---|---|---|
| `7f2fcf5d-fda9-42cd-a8e0-de531187effe` | Construction retainer | retainer_monthly | 12 × 3 000 € = 36 000 € |
| `2d7938b4-3d71-4c8b-bf7c-3002391d5de3` | Monthly Assistance | regular, supplier_group, sob Construction | sem meses, 0 € |

Luis confirmou que já eliminou o duplicado. Nenhuma eliminação adicional foi realizada pelo agente.

## Primeiro mês — confirmado por Luis
Luis escolheu «No mês seguinte»: com Arquitetura a terminar a meio de junho, avença e primeira mensalidade começam no primeiro dia útil de julho. Regra aplicada à criação, dependências e conversão sem backfill real; teste concreto de 22 junho → 1 julho passou. D43 acrescentada, sem reescrever D42. As imagens e o ensaio convertido anteriores documentam a versão anterior a esta confirmação; a nova regra ainda não foi revalidada por conversão completa no navegador.

## Ficheiros alterados
- `src/components/planner/planner-gantt.tsx`, `retainer-settings.tsx`, `retainer-bar.css`.
- `src/components/projects/gantt-chart.tsx`, `new-retainer-stage-dialog.tsx`.
- `src/components/quotes/quote-planning-tab.tsx`, `quote-planner-inspector.tsx`, `retainer-stage-editor.tsx`.
- `src/lib/projects/retainer-schedule.ts`, `retainer-schedule.test.ts`, `schedule-engine.ts`, `build-project-gantt-tree.ts`, `use-project-planner-adapter.ts`, `use-gantt-commercial.ts`.
- `src/lib/quotes/use-quote-stages.ts`, `src/lib/finance/use-billing-plan.ts`.
- `docs/DECISIONS.md` (D42/D43 acrescentadas), `roadmap.md`, este relatório; tipos regenerados automaticamente. Regra estrutural não gravada em AGENTS.md por limite de tamanho; nenhuma regra existente encurtada.

## Migrações SQL
Pares idênticos em `drizzle/migrations` e `supabase/migrations`:
- 0296 / `20261111232500_retainer_gantt_monthly_schedule.sql`
- 0297 / `20261111232800_retainer_quote_value_history.sql`
- 0298 / `20261111233100_retainer_conversion_single_owner.sql`
- 0299 / `20261111233200_retainer_conversion_linked_summary.sql`
- 0300 / `20261111233300_retainer_conversion_construction_budget.sql`
- 0301 / `20261111233400_retainer_conversion_parent_value_rollup.sql`
- 0302 / `20261111233500_retainer_canonical_incoming_dates.sql`
- 0303 / `20261111233600_retainer_preserve_operational_timing_evidence.sql`
- 0304 / `20261111233700_retainer_extend_construction_summary.sql`
- 0305 / `20261111233800_retainer_next_month_start.sql` — confirmação do primeiro mês; 45 testes puros/regressão passaram após a alteração.

Todas aplicadas; sem backfill de registos existentes nem políticas de armazenamento alteradas. Nova tabela de histórico tem grants, RLS e revogação TRUNCATE.