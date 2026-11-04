# Item 4 — Listas de despesas Finance

## Como as despesas são registadas hoje (antes do código)

- **Dono/projeto:** `pm_expenses.project_id` obrigatório; `entity_id` identifica PSA no fluxo atual. Nunca ler `company_expenses` como custos de projeto.
- **Duas versões:** `workflow_version=1` conserva história; novas despesas usam `workflow_version=2`, com recibo/intake partilhado, moeda/valor original e valor EUR (`eur_amount`) com evidência cambial. Não adaptar nem atualizar história.
- **Refaturação:** `rebillable` é o indicador legado; V2 usa `rebill_mode=none/cost/markup` e `markup_pct`, independente de quem pagou. `tax_treatment`/`tax_parameters` guardam o tratamento fiscal confirmado; `pending` não pode ser silenciosamente resolvido.
- **Pagamento pessoal:** `payment_source_type=personal` e `reimburse_collaborator_id` identificam quem pagou; `reimbursable` é mantido como indicador. Conta/cartão da empresa têm referências próprias e não geram dívida ao colaborador.
- **Aprovação:** despesa pessoal exige submissão e `approval_state=approved`; obrigação em `finance_holder_reimbursements.project_expense_id`. Não reembolsar despesas por aprovar.
- **Reembolso:** lotes `project_reimbursement_batches` e alocações `project_reimbursement_allocations` guardam reservas e valores liquidados; ligação opcional à transferência bancária. Obrigação usa `status=owed/repaid`, `repaid_at/repaid_by`; despesa usa `status=paid`, `paid_at`. Reversões são explícitas.
- **Faturação cliente:** alocações `project_expense_invoice_allocations` ligam parcelas de custo/venda/IVA a linhas de fatura; créditos e recibos têm alocações próprias. Campos existentes `invoiced_at`, `invoice_reference`, `invoiced_in_invoice_id` registam referência de faturação legada/manual. Não confundir faturado com recebido.
- **Recibo/auditoria:** `receipt_path` reutiliza o ficheiro já guardado; `project_expense_events` regista ações, autor, hora, antes/depois e evidência. Escritas V2 passam por ações guardadas, não UPDATE livre.
- **Hoje na UI:** `/finance/project-expenses` já contém listas V2 e operações detalhadas de alocação/lotes, mas não filtra corretamente apenas os saldos pendentes nem apresenta totais/recibos como as duas listas pedidas.

## Implementação

Reutilizar campos existentes, valores EUR e alocações para saldos; páginas Finance separadas agrupadas por projeto/cliente e por colaborador. Confirmação manual de refaturação usa os campos existentes de referência/data, sem criar fatura fiscal fictícia. Reembolso manual usa lote/alocação/obrigação existentes, com data em `paid_at`, sem reconciliar banco ficticiamente. Ambas as ações auditadas e restritas a Finance + Expenses do projeto, com barreiras fiscais/aprovação. Indicar totais por faturar no item 3 apenas para projetos em que o leitor também pode ver Expenses. Sem emails, sem dados reais alterados; concluir com fixtures exatas/zero e parar antes da Fase B.

## Verificação

Em curso.