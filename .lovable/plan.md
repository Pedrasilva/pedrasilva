# Item 2 — Datas reais dos recebimentos nos projetos convertidos

## Âmbito e condição de execução
**Apenas plano.** Nenhuma migração, alteração de aplicação ou escrita de dados neste passo. A leitura do esquema falhou por indisponibilidade da ligação em 3 novembro 2026; este plano baseia-se no código, tipos gerados, migrações e relatórios. As linhas atuais da Mint, respetivos IDs e datas ainda não foram confirmados.

O item 1 permanece pendente: limpar primeiro as fixtures anteriores e demonstrar contagens zero quando a ligação recuperar. Só depois da aprovação deste plano, ligação disponível e limpeza comprovada serão criadas novas cópias descartáveis.

Não alterar valores, IVA, condições de pagamento, conteúdo de propostas, contrato de referência nem `pm_convert_relative_quote`. Não converter nem editar a Mint real. Sem backfill de clientes.

## Causa atual e resultado pretendido
O separador Entrada do projeto chama `QuotePaymentScheduleTab` com o ID da proposta. Esse componente lê pagamentos/fases da proposta e `PaymentScheduleProposalView` força `proposalPaymentTiming`: por isso apresenta Adjudicação/Semana 2/6/12 mesmo após a conversão.

Na Entrada de projetos convertidos, usar exclusivamente as linhas operacionais de `pm_payment_schedule_items` e uma projeção comum de datas. O construtor de propostas e os documentos continuam relativos e sem novas escritas. Não reativar sincronização proposta → projeto.

Cada linha do projeto mostrará: marco e fase operacional, data prevista de faturação, data contratual de faturação, desvio em dias úteis, previsão de recebimento e estado. A previsão de recebimento fica separada da faturação: reutiliza as condições/offset atuais sem os modificar.

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

Não transformar «Semana 2» em +10 dias por leitura do texto: o rótulo é apresentação; a ligação vem do ID do marco no snapshot aceite e de `source_quote_stage_id`. Não ligar fases por nome.

**Por confirmar antes da implementação:** IDs das oito linhas, ligações às fases, adjudicação, datas do contrato, overrides e evidência de emissão/pagamento. Sem acesso à base, nenhuma linha pode ser declarada definitivamente mapeada ou impossível de mapear.

As quatro mensalidades não são pagamentos de fim de fase: preservar a regra mensal existente (primeiro dia útil do mês da avença + ordinal), não converter as quatro para o fim da mesma fase ou datas fixas. Preservar também linhas legadas `stage_start`. O seletor principal oferece Adjudicação, Conclusão de fase e Data fixa; mensalidade/início de fase existentes mantêm regra explícita sem alteração comercial.

Listar separadamente linhas com ligação ausente/duplicada, fase de outro projeto, data ausente, ordinal mensal ambíguo, adjudicação sem evidência ou contrato sem correspondência comprovada. Nesses casos mostrar «Por definir» com causa; nunca hoje, datas 2000 ou uma inferência pelo nome.

## Regras das datas
1. **Adjudicação:** evidência aceite imutável; não confundir adjudicação com data de início operacional. Guardar associação à evidência, não acompanhar futuras alterações da oportunidade/proposta. Comparar separadamente com a data contratual existente, ainda que a conversão antiga a tenha associado ao início do projeto.
2. **Conclusão de fase:** usar exatamente `pm_stages.end_date` atual, já calculada pelo Gantt/calendário operacional. Não somar a duração uma segunda vez. Alterações no Gantt mudam a previsão na leitura seguinte.
3. **Data fixa/override:** manter o dia escolhido, mesmo se não útil, com aviso; nunca deslocar silenciosamente uma data manual. Limpar override restaura o cálculo pelo marco.
4. **Mensalidades:** conservar ordinal por linha e direção, proveniente do plano aceite; resolver mês pela avença operacional e ajustar ao primeiro dia útil com `pm_calendar_shift(...,0)`.
5. Feriados e fechos usam o calendário comum `holidays`. Não alterar/recalcular fases em leituras. Um fim de fase legado não útil é sinalizado para corrigir no Gantt, não substituído por outro dia sem aviso.
6. **Desvio:** número assinado de dias úteis entre data contratual e data prevista (0 no mesmo dia; positivo = atraso), excluindo fins de semana, feriados e fechos. Devolver também diferença de dias de calendário, com nome distinto, para reutilização futura sem ambiguidade.
7. **Recebimento:** manter o `payment_offset_days` existente, aplicado uma vez em dias de calendário, como atualmente. Não reinterpretar condições comerciais como dias úteis. Override de faturação repercute-se na previsão de recebimento através do mesmo offset, salvo override independente de recebimento.

## Contrato original — fonte independente e só de leitura
Usar `pm_project_contract_baseline_payments.expected_invoice_date/expected_payment_date` quando a linha tiver correspondência única e comprovada. As migrações 0088 → 0092 → 0095 → 0215 mostram a passagem para datas de conversão; confirmar o resultado instalado e as linhas reais antes de afirmar que todas são datas válidas.

O contrato de referência **não tem ligação direta ao ID do pagamento de origem**. Não fazer uma associação apenas por rótulo ou posição. Resolver correspondência pelo snapshot aceite (ID da linha/fase), conjunto integral de atributos da prestação e baseline, exigindo unicidade; guardar a evidência numa ligação operacional separada. Ambiguidades ficam sem data contratual/desvio e requerem confirmação explícita.

Não usar `original_invoice_date` como data contratual: é uma base mutável de agrupamento. Não substituir datas do contrato por fins de fases atuais. Para legado relativo/incompleto sem evidência calendárica original, mostrar contrato indisponível; não reconstruir com o calendário atual como se fosse a promessa original.

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
Criar RPC invoker/RLS `pm_project_incoming_timing` como fonte única para Entrada e futuras leituras Finance. Devolve IDs, marco, fase, datas calculada/efetiva/contratual, desvios, origem da data, estado, congelamento e problemas de mapeamento; preserva os valores comerciais já existentes.

**Porque na leitura:** acompanha fins de fases sem UPDATEs de pagamentos no Gantt, evita cascatas de agrupamento e mantém a proposta/contrato intactos. Invalidar esta consulta após guardar/Undo do Gantt e após alterar/limpar override. A mesma função SQL atende Finance sem duplicar cálculos. Sem exposição pública ou bypass de permissões financeiras/entidade.

Prioridade: **congelada → override → marco operacional**. Datas automáticas não sobrescrevem `expected_*` nem `original_invoice_date`.

Na primeira emissão ou pagamento, capturar datas efetivas na mesma transação por trigger/ação existente, com bloqueio da linha: nenhuma corrida emissão/override pode alterar a prestação emitida. Considerar documento fiscal realmente emitido e pagamentos confirmados, não apenas existência de linha num rascunho. Emissão parcial congela a linha inteira; cancelamento/nota de crédito não descongela automaticamente. Legado já emitido/pago mantém as datas históricas comprovadas, sem recalcular a partir do Gantt atual.

Os campos de data e ligação ficam protegidos também contra UPDATE direto; apenas PM autorizado/admin com âmbito financeiro pode alterar linhas ainda planeadas. Não mudar montantes, IVA, termos, registos fiscais ou fluxos de emissão neste item.

## Migrações e ficheiros previstos — só após aprovação
- Duas novas migrações aditivas: `pm_incoming_live_timing` (campos, evidência/auditoria, projeção e override protegido) e `pm_incoming_date_freeze` (congelamento transacional e guardas). Numeração atribuída no momento; SQL idêntico em `drizzle/migrations` e `supabase/migrations`. Novas tabelas com grants/RLS e revogação de TRUNCATE; tipos regenerados pela ferramenta. Sem editar migrações antigas ou conversão.
- Novos: `src/lib/projects/payment-timing.ts`, `use-project-payment-schedule.ts`, `src/components/projects/project-incoming-payments.tsx`.
- Alterar `src/routes/_app.projects.$projectId.tsx`: Entrada convertida usa o adaptador operacional, não a superfície da proposta.
- Alterar invalidação em `src/lib/projects/use-project-planner-adapter.ts`/`use-planner.ts` após saves/Undo, conforme fluxo existente.
- Reutilizar `src/lib/projects/use-contract-baseline.ts`; sem escritas no baseline. Traduzir controlos EN/PT em `projects.json`, reutilizando common/glossary.
- Rever consumidores PM/agrupamento em `project-financial-tab.tsx` e `invoice-grouping-control.tsx` para não apresentar duas previsões divergentes; não alterar valores/grupos históricos. Páginas futuras de Finance não são construídas agora.
- Testes novos `scripts/test-project-payment-timing.test.ts` e SQL descartável de permissões/congelamento; manter regressões de timing relativo e conversão. Atualizar regras Projects e relatório próprio após execução.

## Verificação após aprovação
Limpeza item 1 primeiro, com leitura zero. Ler mapeamento real Mint sem alterações. Testar apenas cópias: os três marcos principais; mensalidades/início de fase legados; feriado/fecho; movimento/Undo de fase; override/limpeza; contrato invariável; ligação ambígua; emissão/pagamento parcial/concurrente e bloqueio de alteração; permissões e isolamento Finance. Confirmar montantes/IVA/termos e proposta/contrato/conversão inalterados. Capturas PT/EN, apagar fixtures e demonstrar zero novamente.