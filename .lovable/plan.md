# Despesas de projeto e reembolsos — plano para revisão

## Limites
Inspeção apenas por leitura do código, estrutura, políticas e funções atuais. Nenhuma implementação, migração ou escrita de dados. Bernardo, contas de liquidação e saldos iniciais ficam fora deste plano e aguardam confirmação separada. Aprovar este plano não autoriza essas propostas.

## O que existe — e as lacunas
- **`pm_expenses`** já é o registo de custo de projeto: projeto obrigatório, custo/preço de venda, categoria, recibo, fornecedor, pago por, colaborador a reembolsar, refaturável e aprovação com autor/data. Reutilizar pelas duas entradas.
- **Entrada Finance:** `ingestStoredDocument` → `financial_document_review_queue`, com OCR, moeda, fornecedor, duplicados e confirmação transacional `fin_confirm_queue_item`. A captura no projeto ainda lê primeiro pelo OCR de benefícios e depois encaminha para Finance: atualmente há duas leituras.
- **Ligações:** `source_project_expense_id` liga fila e despesa; `created_expense_id` identifica o documento financeiro, não `pm_expenses`.
- **Reembolsos atuais:** `pm_expense_link_reimbursement` cria `financial_expense_items` para despesas pessoais aprovadas, mas salta as que têm recibo na fila. Outro mecanismo, `finance_holder_reimbursements`, cria dívida de compras pagas com cartão pessoal; exige documento, não tem aprovação de projeto e permite marcar repago sem transferência. Nenhum satisfaz sozinho o fluxo pedido.
- **Reconciliação:** painel único com `fin_reconcile_candidates`, sugestões em cache e pagamentos ligados. O diálogo antigo procura só benefícios HR; não criar segunda superfície.
- **Faturação:** `financial_documents`, linhas e pagamentos são o livro atual. A FK de `pm_expenses.invoiced_in_invoice_id` ainda aponta para `pm_invoices` legado; não criar novas faturas nesse modelo.
- **Totais:** `financial-rollups.ts` soma o custo de todas as despesas e reconhece refaturação ao custo quando há `invoiced_at`; ignora markup. Adaptar a receita do novo fluxo, preservando histórico e snapshots de horas.

## Fluxo proposto
### Uma entrada, duas portas
«Adicionar despesa» no projeto abre o mesmo formulário da Entrada Finance, com projeto predefinido; em Finance, projeto selecionável. Um upload, um ficheiro privado e uma extração pelo motor Finance. Reutilizar fornecedor, duplicados, classificação PRJ.EXP e confirmação.

Ambas as portas criam/atualizam **a mesma linha em `pm_expenses`**, com documento/evidência ligados — nunca outro custo. Rascunho manual pode existir sem recibo; anexar depois completa a mesma linha. Sem projeto, manter em triagem; custo efetivamente da empresa segue o destino existente, sem permitir projeto nulo em `pm_expenses`.

Campos:
- **Pago por:** conta/cartão da empresa ou colaborador escolhido por pessoa, sem exigir registo do seu cartão pessoal. Quem submeteu não é necessariamente quem pagou; submissão do colaborador predefine «pago por mim».
- **Refaturável:** não / ao custo / markup %. Projeto obrigatório; viagens de projeto predefinidas refaturáveis, editável.
- **Moeda:** original, data e EUR, câmbio/origem/data/evidência. EUR ausente fica «por confirmar», nunca zero. Match confirmado usa EUR debitado no cartão, conservando conversão anterior; taxas separadas não entram por suposição.
- **Fiscalidade:** por confirmar / disbursement («despesa reembolsável») / custo refaturado, com IVA configurável por despesa. Não inferir dedutibilidade, taxa zero ou regras para despesas do Reino Unido. Tratamento confirmado pelo contabilista antes da inclusão em fatura.

### Aprovação, reembolso e faturação separados
**Pessoais: submetida → aprovada pelo responsável do projeto ou Luis → paga.** OCR/fornecedor não aprovam reembolso. Rejeição guarda motivo; reenvio ou alteração material exige nova aprovação. Pagamentos nunca são desfeitos silenciosamente.

**«A reembolsar à equipa»:** apenas pessoais aprovadas, agrupadas pelo ID do colaborador. Selecionar despesas prepara um lote por pessoa, podendo abranger vários projetos. Não executar transferências bancárias: Finance associa a transferência real ao lote no painel existente. Só essa reconciliação marca pago. Pagamento parcial conserva saldo; desfazer exige motivo e reabre apenas montantes afetados.

**«A faturar aos clientes»:** refaturáveis agrupadas por projeto/cliente, pendente → incluída numa fatura ligada → paga pelo cliente. Independe de quem pagou ou de o colaborador já ter sido reembolsado. Mostrar custo EUR e valor a faturar separados; cliente em falta aguarda associação, sem adivinhar. Pagamentos parciais da fatura exigem alocação explícita às despesas; não marcar tudo pago com qualquer recebimento.

## Sem dupla contagem
1. Recibo de cartão da empresa liga-se à linha existente do extrato; não cria movimento nem segunda despesa. Funciona também se o extrato chegou primeiro. Correspondência confirmada por pessoa com valor/moeda, data, fornecedor e conta/cartão; last4 sozinho não prova pagamento.
2. Compra pessoal é custo do projeto, paga ao fornecedor pela pessoa. Não surge como compra por pagar ao fornecedor no banco da empresa; só a obrigação ao colaborador é candidata à transferência.
3. Reembolso, liquidação de cartão e recebimento do cliente são movimentos de liquidação, nunca novas despesas. Classificação de movimento já ligado não cria custo adicional.
4. Projeto soma `pm_expenses` uma vez; Finance distingue documento/dívida/lote para não somar novamente.
5. Preservar o critério histórico de custo incorrido, distinguindo submetido/aprovado/pago. Aprovação define o que se deve reembolsar, não o momento bancário. Receita do novo fluxo vem da alocação efetivamente faturada, incluindo markup, sem duplicar a receita da fatura; tratamento económico de disbursements fica configurável com o contabilista.

## Detalhes técnicos — esquema proposto
Nomes novos indicativos.

| Estrutura | Alterações propostas |
|---|---|
| `pm_expenses` | Reutilizar pago por, cartão, `reimburse_collaborator_id`, `rebillable`, aprovação e custo. Acrescentar conta pagadora, moeda/valor original, EUR/câmbio/data/origem/evidência, modo/percentagem de markup, tratamento/parâmetros fiscais confirmados, documento de compra ligado e versão do novo fluxo. Projeto continua obrigatório. |
| Fila Finance | Reutilizar as ligações/extrações existentes; acrescentar contexto estruturado de pessoa pagadora/refaturação. Confirmar documento e despesa juntos, idempotentemente. |
| `finance_holder_reimbursements` | Reutilizar como obrigação única; acrescentar ligação única à despesa de projeto e metadados de aprovação. Documento pode faltar apenas havendo despesa ligada. Novas obrigações só ficam devidas após aprovação; cartão pessoal não é requisito deste fluxo. Preservar estados/documentos antigos. |
| Lotes e alocações de reembolso | Duas pequenas tabelas: cabeçalho por entidade/pessoa e alocações obrigação → movimento com montante. São relações de liquidação, não outro livro de custos; saldo derivado, autor/data/motivo auditados. |
| Alocações de faturação | Relação despesa → linha de `financial_document_lines`, com custo/valor faturado e IVA confirmado. Cobrança deriva dos pagamentos reais com alocação explícita. Crédito/anulação reabre a parcela afetada. Preservar FK legado de `pm_invoices`, sem repontar/migrar por suposição. |
| Auditoria | Eventos de submissão, decisão, câmbio, faturação e liquidação/desfazer com antes/depois, pessoa, data e comprovativo. Reutilizar `fin_reconcile_audit` para pagamentos/movimentos; acrescentar cobertura dos novos eventos. |

Para despesas novas, unificar os caminhos de dívida: impedir o bridge antigo de gerar `financial_expense_items` extra e o trigger de cartão de criar segunda dívida pelo documento ligado. Nenhuma obrigação antiga apagada ou reconvertida automaticamente.

### Permissões e integridade
- Submissor vê as próprias despesas; responsável vê/aprova as dos seus projetos; Luis validado pela identidade/autoridade existente no servidor, nunca por nome no cliente.
- Submissão no projeto usa acesso estreito ao mesmo motor, sem conceder acesso ao Hub, despesas de outros, contas ou outras entidades. Finance controla faturas/reconciliação.
- Preservar política restritiva `psa_staff_only`; acesso de aprovador sem acesso financeiro geral.
- Transações e bloqueios/verificações de saldo impedem pagamento sem aprovação, dupla alocação, pessoa/entidade incompatível, movimento consumido e alteração em período fechado. Índices únicos protegem despesa/documento e repetição. Sugestões continuam read-only.

## Ecrãs afetados
1. Projeto → Despesas: formulário partilhado e estados independentes.
2. Finance → Entrada/documento: mesmo formulário e ligações.
3. Finance → «A faturar aos clientes» e «A reembolsar à equipa»: aproveitar vistas existentes e substituir ações inadequadas para o novo fluxo, sem painéis concorrentes.
4. Projeto → Faturação/editor de fatura: selecionar despesas e ligá-las às linhas.
5. Bancos → Reconciliação: compras ligadas e lotes por pessoa no painel único; não alterar importador, saldos iniciais ou contas.
6. Totais/Insights/relatórios coerentes; horas, salários e planeamento intactos. EN/PT-PT.

## Migração e verificação — depois de aprovação
1. Auditoria read-only de referências/obrigações antigas; pré-visualizar ambiguidades antes de qualquer backfill. Não usar Mastercard real nos testes.
2. Migração aditiva de campos, relações, índices e auditoria. Novas tabelas públicas com GRANT explícito, revogação de TRUNCATE a anon/authenticated e RLS por pessoa/entidade. SQL idêntico em `supabase/migrations` e `drizzle/migrations`.
3. Operações transacionais de confirmação, aprovação, obrigação única, faturação e lote/reconciliação. Versão do fluxo mantém histórico inalterado; adaptação histórica só após pré-visualização e autorização separadas.
4. Substituir OCR do projeto pelo motor Finance e ligar ecrãs. Não migrar faturas, documentos ou contas por suposição.
5. Fixtures descartáveis: portas/concorrência → uma despesa; GBP/câmbio; empresa/pessoa; aprovação; markup/projeto obrigatório; dívida única; lote/pessoa; parciais/desfazer; recibo/extrato em ambas as ordens; fatura/crédito/cobrança; isolamento/período fechado. Comparar totais/snapshots e limpar.

**Entrega atual: apenas plano.** Nenhuma despesa, conta, fatura, transferência, fixture ou migração criada; propostas financeiras pendentes intactas.
