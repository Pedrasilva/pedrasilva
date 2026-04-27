UPDATE public.proposal_blocks
SET default_content = '## Fees

The retainer is structured on a **time-based monthly basis**, calculated from the planned monthly hours allocated by role and the corresponding hourly rates set out in our team rate card.

Estimated monthly fee: **{{monthly_estimate}}** (subject to the agreed monthly hours allocation).

This monthly fee is **billed in advance** at the start of each calendar month for the duration of the construction phase.

Reimbursable expenses (travel, accommodation, site allowances, printing and other site-related costs) are **not included** and will be billed separately at cost, with prior agreement.'
WHERE slug = 'retainer-fee-monthly' AND language = 'en';

UPDATE public.proposal_blocks
SET default_content = '## Honorários

O retainer é estruturado numa **base mensal por horas**, calculada a partir das horas mensais previstas por função e das respetivas tarifas horárias da nossa tabela de equipa.

Honorário mensal estimado: **{{monthly_estimate}}** (sujeito à alocação mensal de horas acordada).

Este valor mensal é **faturado antecipadamente** no início de cada mês civil, durante toda a fase de obra.

Despesas reembolsáveis (deslocações, alojamento, ajudas de custo, impressões e outras despesas relacionadas com a obra) **não estão incluídas** e serão faturadas à parte ao custo, mediante acordo prévio.'
WHERE slug = 'retainer-fee-monthly' AND language = 'pt-PT';

UPDATE public.proposal_blocks
SET default_content = '## Payment cycle

- **Retainer period:** from {{retainer_start_date}} to {{retainer_end_date}}.
- **First payment:** due at construction start, before the first site visit.
- **Subsequent payments:** invoiced monthly in advance, payable within {{payment_terms_days}} days of invoice date.
- **Reimbursable expenses:** invoiced monthly in arrears with supporting receipts. {{reimbursable_expenses_note}}

The retainer remains active for the agreed construction period and may be extended by mutual agreement if the works are delayed.'
WHERE slug = 'retainer-payment-cycle' AND language = 'en';

UPDATE public.proposal_blocks
SET default_content = '## Ciclo de pagamento

- **Período do retainer:** de {{retainer_start_date}} a {{retainer_end_date}}.
- **Primeiro pagamento:** devido no arranque da obra, antes da primeira visita.
- **Pagamentos seguintes:** faturados mensalmente, antecipadamente, com pagamento a {{payment_terms_days}} dias da data de fatura.
- **Despesas reembolsáveis:** faturadas mensalmente em diferido, com os respetivos comprovativos. {{reimbursable_expenses_note}}

O retainer mantém-se ativo durante o período de obra acordado e pode ser estendido por mútuo acordo em caso de atraso dos trabalhos.'
WHERE slug = 'retainer-payment-cycle' AND language = 'pt-PT';

UPDATE public.proposal_blocks
SET default_content = 'Services are provided on a **time-based hourly fee** of {{hourly_rate}}.

• Before each phase or significant task, we provide an estimate of the hours required, so the client can approve the scope in advance.
• Time is recorded in detail, with a description of the work performed.
• Invoicing is issued monthly, against actual hours worked.
• A minimum commitment of {{minimum_commitment_hours}} hours may apply per engagement, in blocks of {{hours_block}} hours.
• Each block of {{hours_block}} hours represents a value of **{{block_value}}**.
• An upfront commitment of **{{downpayment_amount}}** secures the minimum hours and confirms the engagement.
• The client retains full control over progression: work continues only while the client approves the next block of effort.

This model keeps the engagement flexible, transparent and aligned with the actual needs of each opportunity.'
WHERE slug = 'consultancy-fee-structure-time-based' AND language = 'en';

UPDATE public.proposal_blocks
SET default_content = 'Os serviços são prestados em regime de **honorário horário** de {{hourly_rate}}.

• Antes de cada fase ou tarefa significativa, fornecemos uma estimativa das horas necessárias, para que o cliente aprove o âmbito em avanço.
• O tempo é registado em detalhe, com descrição do trabalho realizado.
• A faturação é mensal, contra horas efetivamente trabalhadas.
• Pode aplicar-se um compromisso mínimo de {{minimum_commitment_hours}} horas por envolvimento, em blocos de {{hours_block}} horas.
• Cada bloco de {{hours_block}} horas representa um valor de **{{block_value}}**.
• Um adiantamento de **{{downpayment_amount}}** garante as horas mínimas e confirma o envolvimento.
• O cliente mantém o controlo total da progressão: o trabalho prossegue apenas enquanto o cliente aprovar o bloco seguinte de esforço.

Este modelo mantém o envolvimento flexível, transparente e alinhado com as necessidades reais de cada oportunidade.'
WHERE slug = 'consultancy-fee-structure-time-based' AND language = 'pt-PT';