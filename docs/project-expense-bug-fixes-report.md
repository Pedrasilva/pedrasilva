# Dois bloqueios — 2 novembro 2026

## Alterações aplicadas
- `0213_project_expense_unambiguous_function_locals.sql`: apenas substitui 13 funções `pe_*`, renomeando variáveis locais para `v_*`; a junção de alocações usa aliases distintos. Tokenização preserva strings/JSON e assertion impede alterações de mensagens.
- `0214_intake_counterparty_queue_entity_visibility.sql`: apenas substitui `fin_confirm_queue_item`. Evidência de contraparte tem de pertencer à entidade da fila e o utilizador tem de aceder a essa entidade. Inclui PSA, correspondência na própria fila, documentos, despesas e ligações. A visibilidade global/RLS não foi alargada; ligação explícita continua deliberada e auditada.
- Espelhos byte-idênticos em `supabase/migrations/20261102172700_project_expense_unambiguous_function_locals.sql` e `20261102172800_intake_counterparty_queue_entity_visibility.sql`.

## Testes executados
Estrutura real copiada para PostgreSQL isolado; nenhuma linha real copiada para os cenários. Funções aplicadas exportadas novamente e retestadas.
- Antes: reproduzidos exatamente `column reference "o.id" is ambiguous` e `Counterparty not visible in this entity`.
- Depois: dez ações `pe_action` executadas com sucesso: save, submit, decide (rejeição/aprovação), batch, settleBatch, invoice, receipt, reverseReimbursement, reverseInvoice, reverseReceipt.
- Despesa pessoal existente: guardar/editar com recibo, submeter, rejeitar, voltar a submeter/aprovar. Idempotência, lote entre projetos, transferência parcial/undo, IVA/markup, crédito e recebimentos também passaram.
- Cartão empresa existente: recibo preservado, GBP 53,80 / EUR 63,70, guardar/editar/submeter e repetir após nova gravação — passou.
- Entrada: seis cenários passaram — fornecedor só PSA; auto-match na fila; ligação explícita; PSA rejeita fornecedor só Rioja mesmo com admin multi-entidade; utilizador Rioja bloqueado para fornecedor só PSA (inclusive visibilidade global); fornecedor ligado a Rioja confirmável.
- Cenários em rollback; nenhuma fixture ou privilégio temporário criado na base real. Testes retidos em `scripts/e2e/project-expense-bugs/`.

## Preservação / estado real
Hashes completos de `pm_expenses` e `financial_document_review_queue` idênticos antes/depois:
- `4115c261ac1accb481669e9af5d2a133`
- `9d04fed1ffae67d637e1f839f43bc95e`

A despesa real encontrada com GBP 53,80, recibo e cartão 0223 (`Visita Londres`) está **submitted / not_required**, não draft, e `eur_amount` está vazio. Não foi alterada nem submetida neste trabalho. A capacidade de guardar/submeter foi demonstrada na fixture com EUR 63,70; não se afirma ter submetido um draft real nem corrigido o EUR ausente.

Nenhuma alteração de dados, projetos/responsáveis ou propostas pendentes. Pré-visualização: sem erros de página observados, mas a página do projeto permaneceu em carregamento durante a captura; não é prova visual de submissão. Os resultados conclusivos são os testes das funções aplicadas na cópia isolada.
