# Calculadora → Gantt — 11 novembro 2026

## Resultado
Implementada aplicação transacional de fases ligadas às linhas da calculadora, com proteção de valores manuais, duração editável em meses, aviso de conteúdo existente e histórico/desfazer partilhados com templates. B1 não foi alterado. Nenhuma proposta, projeto, fatura, pagamento ou template real foi corrigido.

## Diferença nos dados de origem
Travessa do Oleiro tem honorários guardados de 151956,2754808188 €, custo de obra guardado de 2325000 €, mas os inputs atuais são 930 m² × 2700 €/m² e produzem 162487 €. Para testar os 151956 € pedidos, exclusivamente nas cópias foi usado 2500 €/m², correspondendo aos 2325000 € guardados. A fórmula da curva não foi alterada; apenas o resultado final/distribuição passou a euros inteiros.

## Verificação
| Caso | Resultado |
|---|---|
| Cópia de Oleiro: aviso antes de aplicar a fases existentes | PASS, diálogo com Adicionar/Substituir/Cancelar |
| Adicionar na cópia: cinco fases ligadas, mesma ordem, 151956 € | PASS; valores 15196 / 45586 / 30391 / 45587 / 15196 |
| Fornecedores e avença existentes preservados | PASS; nomes, valores e datas iguais à origem |
| Variante descartável vazia: cinco fases sequenciais de um mês | PASS, origem relativa 2000-01-03, fim 2000-06-02; sem datas reais |
| Resumo financeiro da variante vazia | PASS, 151956 € visível na interface |
| Licenciamento alterado para dois meses no Gantt e reaplicado | PASS, 2000-03-03 → 2000-05-02 preservado, mesmo identificador/valor |
| Valor manual alterado | PASS, RPC bloqueia sem consentimento; diálogo e confirmação na interface |
| Reaplicar sem duplicados | PASS, cinco fases ligadas |
| Acrescentar linha | PASS, nova fase no fim |
| Remover linha e eliminar fase ligada | PASS, detetada antes da aplicação e removida apenas após opção explícita |
| Desfazer | PASS, nome anterior restaurado por histórico partilhado |
| Template de fases da calculadora | PASS, cinco fases, remapeamento de IDs, ligações preservadas, 151956 € |
| Sem predefinição de pagamentos | PASS, «Plano por definir», zero linhas automáticas; geração silenciosa impedida |
| Testes automatizados | PASS, quatro testes; traduções EN/PT e auditoria sem novos literais |
| Limpeza independente | PASS, três propostas e um template descartáveis eliminados |

## Ligação e caminho partilhado
`fee_proposals.project_fee_calculation.stages[].id` é a chave estável da linha; `quote_stages.calculator_row_id` guarda-a com índice único por proposta. Linhas antigas recebem `legacy-{índice}` antes da primeira aplicação; novas linhas usam UUID. `calculator_last_value` guarda o orçamento da última aplicação para detetar edição manual. Reaplicação altera nome/orçamento, nunca datas/duração. `sale_source=budget` e orçamento fixo alimentam os totais; o multiplicador é compensado no orçamento para não aumentar o resultado final.

Templates e calculadora criam fases por `quote_stage_snapshot_insert`, reutilizam `PlanningReplacementWarning` e `quote_template_imports`/`quote_undo_template_import`. A revisão integral impede sobrescrever trabalho posterior. Trocas com filhos protegidos ou pagamentos protegidos são recusadas, nunca apagadas em cascata silenciosamente.

## Pagamentos
Nova configuração explícita do atelier em `quote_planning_defaults`, inicialmente sem linha/predefinição. O Plano de pagamentos permite guardar percentagens início/fim, com acesso protegido por administrador. Novas fases com predefinição geram regras percentuais; sem predefinição ficam por definir. Nenhuma regra real foi definida ou alterada durante os testes.

## Ficheiros
- `drizzle/migrations/0295_calculator_linked_stages.sql`
- `supabase/migrations/20261111230600_calculator_linked_stages.sql` (SQL byte-idêntico)
- `src/lib/quotes/fee-calculator.ts`, `fee-calculator.test.ts`, `calculator-planning.ts`, `AGENTS.md`
- `src/components/quotes/quote-fee-calculator-card.tsx`
- `src/components/quotes/calculator-apply-dialog.tsx`, `calculator-payment-defaults.tsx`, `planning-replacement-warning.tsx`
- `src/components/quotes/import-full-template-dialog.tsx`, `quote-payment-schedule-tab.tsx`, `quote-planner-inspector.tsx`
- `src/components/planner/relative-stage-fields.tsx`
- `src/i18n/locales/{en,pt-PT}/crm.json`
- `docs/DECISIONS.md`, este relatório, `roadmap.md`

## Limites — não certificar publicação completa
- A cópia fiel de Oleiro já contém fornecedores ligados a fases de Arquitetura e uma avença de 36000 €. Adicionar preserva-os, pelo que o total global inclui os valores existentes além dos 151956 € da calculadora; não pode igualar 151956 € sem decidir como tratar esses valores. A variante vazia demonstrou esse total exato. Substituir um pai com filho fornecedor é bloqueado, não foi inventado um relink.
- Teste do ramo com predefinição efetivamente guardada, IVA/marcos e leitura subsequente não executado: exigiria mudar uma configuração real do atelier. Sem predefinição foi validado.
- Concorrência/suppliers/retainers na substituição completa e conversão para projeto não certificadas. Templates mantêm também os limites já registados no relatório D40.
- Os avisos ainda usam sort_order nas listas da calculadora, não numeração WBS derivada; ajustar antes de certificar conformidade total de referências.
- Não foi alterada nenhuma política de storage.
