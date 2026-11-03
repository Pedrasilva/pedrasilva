# Item 2 — Datas reais dos recebimentos nos projetos convertidos

## Âmbito e condição de execução
**Apenas plano.** Nenhuma migração, alteração de aplicação ou escrita de dados neste passo. A leitura do esquema falhou por indisponibilidade da ligação em 3 novembro 2026; este plano baseia-se no código, tipos gerados, migrações e relatórios. As linhas atuais da Mint, respetivos IDs e datas ainda não foram confirmados.

O item 1 permanece pendente: limpar primeiro as fixtures anteriores e demonstrar contagens zero quando a ligação recuperar. Só depois da aprovação deste plano, ligação disponível e limpeza comprovada serão criadas novas cópias descartáveis.

Não alterar valores, IVA, condições de pagamento, conteúdo de propostas, contrato de referência nem `pm_convert_relative_quote`. Não converter nem editar a Mint real. Sem backfill de clientes.

## Causa e resultado
Entrada chama `QuotePaymentScheduleTab`/`PaymentScheduleProposalView`, que leem a proposta e forçam `proposalPaymentTiming`. Substituir essa leitura no projeto convertido por `pm_payment_schedule_items` e uma projeção comum. Propostas/documentos continuam relativos; sem sincronização proposta → projeto.

Mostrar marco/fase, data prevista de faturação, data contratual, desvio em dias úteis, previsão de recebimento e estado. Faturação e recebimento são datas distintas; condições/offset comerciais ficam intactos.

## Mapeamento Mint — evidência documental, leitura atual pendente
Os nomes FT01–08 abaixo identificam prestações do plano, **não comprovam emissão de faturas**. Montantes do relatório: 30 980 € sem IVA, inalterados.

| Linha | Valor líquido | Marco da proposta | Ligação operacional prevista | Data atual/contratual |
|---|---:|---|---|---|
| FT01 | 2 570 € | Adjudicação | `project_start`: data de adjudicação aceite, se registada; na ausência de evidência, assinalar por confirmar, não substituir silenciosamente pelo início do projeto | Não confirmada |
| FT02 | 7 710 € | Semana 2 / conclusão de Programa Base / Conceito | `stage_end`: fase do mesmo projeto cujo `source_quote_stage_id` corresponde ao ID de fase do pagamento aceite | Fim operacional por consultar |
| FT03 | 7 710 € | Semana 6 / conclusão de Estudo Prévio | Mesma regra por ID, fim da fase operacional | Fim operacional por consultar |
| FT04 | 7 710 € | Semana 12 / conclusão de Projeto de Execução | Mesma regra por ID, fim da fase operacional | Fim operacional por consultar |
| FT05 | 1 320 € | Mês 1 de obra | Avença operacional ligada por ID + ordinal mensal 0 | Por consultar |
| FT06 | 1 320 € | Mês 2 de obra | Mesma avença + ordinal 1 | Por consultar |
| FT07 | 1 320 € | Mês 3 de obra | Mesma avença + ordinal 2 | Por consultar |
| FT08 | 1 320 € | Mês 4 de obra | Mesma avença + ordinal 3 | Por consultar |

«Semana 2» é apresentação, não uma regra +10 dias: ligar pelo ID do snapshot aceite e `source_quote_stage_id`, nunca pelo nome.

**Por confirmar antes da implementação:** IDs das oito linhas, ligações às fases, adjudicação, datas do contrato, overrides e evidência de emissão/pagamento. Sem acesso à base, nenhuma linha pode ser declarada definitivamente mapeada ou impossível de mapear.

As quatro mensalidades não são pagamentos de fim de fase: preservar a regra mensal existente (primeiro dia útil do mês da avença + ordinal), não converter as quatro para o fim da mesma fase ou datas fixas. Preservar também linhas legadas `stage_start`. O seletor principal oferece Adjudicação, Conclusão de fase e Data fixa; mensalidade/início de fase existentes mantêm regra explícita sem alteração comercial.

Listar ligações ausentes/duplicadas, fase de outro projeto, datas/ordinais/evidência ausentes. Mostrar «Por definir» e causa, nunca hoje ou datas 2000.

## Regras das datas
1. **Adjudicação:** evidência aceite imutável; não confundir adjudicação com data de início operacional. Guardar associação à evidência, não acompanhar futuras alterações da oportunidade/proposta. Comparar separadamente com a data contratual existente, ainda que a conversão antiga a tenha associado ao início do projeto.
2. **Conclusão de fase:** usar exatamente `pm_stages.end_date` atual, já calculada pelo Gantt/calendário operacional. Não somar a duração uma segunda vez. Alterações no Gantt mudam a previsão na leitura seguinte.
3. **Data fixa/override:** manter o dia escolhido, mesmo se não útil, com aviso; nunca deslocar silenciosamente uma data manual. Limpar override restaura o cálculo pelo marco.
4. **Mensalidades:** conservar ordinal por linha e direção, proveniente do plano aceite; resolver mês pela avença operacional e ajustar ao primeiro dia útil com `pm_calendar_shift(...,0)`.
5. Feriados e fechos usam o calendário comum `holidays`. Não alterar/recalcular fases em leituras. Um fim de fase legado não útil é sinalizado para corrigir no Gantt, não substituído por outro dia sem aviso.
6. **Desvio:** número assinado de dias úteis entre data contratual e data prevista (0 no mesmo dia; positivo = atraso), excluindo fins de semana, feriados e fechos. Devolver também diferença de dias de calendário, com nome distinto, para reutilização futura sem ambiguidade.
7. **Recebimento:** manter o `payment_offset_days` existente, aplicado uma vez em dias de calendário, como atualmente. Não reinterpretar condições comerciais como dias úteis. Override de faturação repercute-se na previsão de recebimento através do mesmo offset, salvo override independente de recebimento.

## Contrato original — fonte independente e só de leitura
Usar `pm_project_contract_baseline_payments.expected_invoice_date/expected_payment_date` com correspondência comprovada. Migrações 0088 → 0092 → 0095 → 0215 resolvem datas na conversão; confirmar instalação/dados.

O baseline **não tem ID do pagamento de origem**. Associar pelo snapshot aceite (ID linha/fase) e atributos integrais da prestação, exigindo unicidade e guardando evidência separada; nunca só pelo rótulo/posição. Ambiguidades ficam sem data contratual/desvio, aguardando confirmação.

`original_invoice_date` é base mutável de agrupamento, não contrato. Legado sem evidência original mostra contrato indisponível; não reconstruir uma promessa pelo calendário/fases atuais.

## Desenho técnico — colunas existentes e adições
### `pm_payment_schedule_items` atual — 31 colunas, segundo tipos/migrações
| Tipo | Colunas |
|---|---|
| UUID obrigatório | `id`, `project_id`, `entity_id` |
| UUID opcional | `stage_id`, `supplier_company_id`, `linked_payment_item_id`, `supplier_id`, `invoice_group_id`, `source_quote_payment_item_id` |
| Texto obrigatório | `label`, `direction` |
| Texto opcional | `notes`, `generator_source`, `payment_terms`, `supplier_label` |
| Enums | `trigger_type` (project_start/stage_start/stage_end/manual_date/monthly), `amount_type` (fixed/percent), `billing_status` (planned/issued/paid/cancelled) |
| Numérico | `amount_value`, `vat_rate` |
| Inteiro | `sort_order`, `payment_offset_days` |
| Booleano | `manual_override`, `vat_rate_override` |
| Data opcional | `expected_invoice_date`, `expected_payment_date`, `original_invoice_date` |
| Timestamp | `created_at`, `updated_at` |

Reutilizar `stage_id` como ligação à fase operacional e `trigger_type` como marco. Não alterar enums existentes nem usar `manual_override` comercial como override exclusivo de data.

Adicionar campos opcionais: `timing_month_index`, `appointment_date`, `timing_evidence` (snapshot/ID/critério), `contract_baseline_payment_id`, `planned_invoice_date_override`, `planned_payment_date_override`, `date_override_by`, `date_override_at`, `frozen_invoice_date`, `frozen_payment_date`, `dates_frozen_at`, `dates_frozen_document_id`. Validação de projeto/fase/baseline, unicidade e evidência dentro de ações protegidas; histórico de alterações de datas separado e auditado. Novas colunas sem preenchimento presumido de linhas reais.

### Recalcular na leitura; congelar por evento
RPC invoker/RLS `pm_project_incoming_timing` comum a Entrada e futuras leituras Finance: IDs, marco/fase, datas calculada/efetiva/contratual, desvios, origem, estado, congelamento e problemas. Valores comerciais intactos.

**Na leitura:** acompanha fases sem escritas de pagamentos/cascatas de agrupamento. Invalidar após save/Undo do Gantt e override. Finance reutiliza a mesma função, mantendo permissões financeiras/entidade e sem acesso público.

Prioridade: **congelada → override → marco operacional**. Datas automáticas não sobrescrevem `expected_*` nem `original_invoice_date`.

Primeira emissão/pagamento congela datas na mesma transação por trigger/ação, bloqueando a linha contra concorrência. Rascunhos não congelam. Emissão parcial congela a linha inteira; cancelamento/crédito não descongela. Legado emitido/pago conserva datas históricas comprovadas, nunca recalculadas pelo Gantt atual.

Guardar datas/ligações apenas por ações autorizadas PM/admin com âmbito financeiro, bloqueando UPDATE direto e linhas congeladas. Sem mudar registos fiscais ou valores.

## Migrações e ficheiros previstos — só após aprovação
- Duas migrações aditivas: `pm_incoming_live_timing` (campos/evidência/auditoria/projeção/override) e `pm_incoming_date_freeze` (congelamento/guardas). Numeração no momento; mirrors idênticos `drizzle/migrations`/`supabase/migrations`, grants/RLS/revoke TRUNCATE e tipos regenerados. Sem editar conversão/migrações antigas.
- Novos: `src/lib/projects/payment-timing.ts`, `use-project-payment-schedule.ts`, `src/components/projects/project-incoming-payments.tsx`.
- Alterar `src/routes/_app.projects.$projectId.tsx`: Entrada convertida usa o adaptador operacional, não a superfície da proposta.
- Alterar invalidação em `src/lib/projects/use-project-planner-adapter.ts`/`use-planner.ts` após saves/Undo, conforme fluxo existente.
- Reutilizar `src/lib/projects/use-contract-baseline.ts` sem escritas. Traduções EN/PT `projects.json`, common/glossary.
- Rever consumidores PM/agrupamento em `project-financial-tab.tsx` e `invoice-grouping-control.tsx` para não apresentar duas previsões divergentes; não alterar valores/grupos históricos. Páginas futuras de Finance não são construídas agora.
- Testes `scripts/test-project-payment-timing.test.ts` e SQL descartável; regressões relativo/conversão. Regras Projects e relatório após execução.

## Verificação após aprovação
Limpeza item 1 primeiro, com leitura zero. Ler mapeamento real Mint sem alterações. Testar apenas cópias: os três marcos principais; mensalidades/início de fase legados; feriado/fecho; movimento/Undo de fase; override/limpeza; contrato invariável; ligação ambígua; emissão/pagamento parcial/concurrente e bloqueio de alteração; permissões e isolamento Finance. Confirmar montantes/IVA/termos e proposta/contrato/conversão inalterados. Capturas PT/EN, apagar fixtures e demonstrar zero novamente.