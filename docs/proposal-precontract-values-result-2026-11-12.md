# D50 — Valores pré-contrato: resultado e limites

Plano aprovado por Luis e implementação aplicada em 12/11/2026. B1 OFF, revisão 10.

## Resultado verificado
- Mensalidade de avença Draft guardada na interface sem diálogo: 3 000 → 3 100 €, refletida no cartão e total. Fases, mensalidade e meses alterados por chamadas autenticadas sem motivo/acordo e sem histórico comercial.
- Calculadora reaplicou um valor manual sem `_overwrite_manual`, conservando a operação de desfazer e as confirmações estruturais.
- Na cópia com assinatura, referência imutável capturada, mudança sem responsabilidade rejeitada, atualização direta rejeitada e mudança confirmada registada. A referência manteve-se igual após mudar o valor. Diálogo pós-assinatura verificado na interface.
- 10 testes unitários PASS; auditoria i18n: zero novos candidatos; build OK às 16:42:57 UTC. Testes end-to-end reproduzíveis em `scripts/e2e/precontract-values`.
- Oleiro real continua Draft sem assinatura/conversão; os 34 blocos originais foram comparados e permanecem iguais. Os 133 históricos de projeto permanecem guardados. Sem alterações a papéis, B1 ou fiscal.

## Histórico Draft entretanto identificado — NÃO eliminado
A primeira leitura devolveu zero linhas em `quote_retainer_value_history`. Durante a investigação, antes de aplicar a nova regra, foi criado às **16:25:41 UTC**:

| ID | Proposta | Fase ID | Antes | Depois | Motivo |
|---|---|---|---:|---:|---|
| c16cb84d-bc34-4842-89c9-05cbc9d3a287 | Hotel Chiado, a9f08834-6fb2-4d4b-8bb1-730f59336da6; Draft, não assinada/não convertida | 1143b5bf-1ccf-4c0c-80ae-de9eb09d9bd9 | 2 200 € | 3 500 € | bug in quotes |

Esta linha é real, não foi criada pelos testes e está preservada. Há também uma linha pós-assinatura da cópia D50. Nenhum histórico apagado. As 123 linhas órfãs antigas permanecem igualmente preservadas.

## Limites — não certificado como conclusão integral
- **Sent/Approved:** a regra comercial já usa assinatura/conversão, mas o bloqueio geral existente `fee_proposals_autolock` torna essas propostas somente leitura. O plano aprovado mandou preservar esse bloqueio independente. Não o removi nem contornei em dados reais; tornar esses estados editáveis sem revisão exige decisão adicional de Luis sobre o bloqueio de propostas enviadas/aceites.
- Teste de conversão da cópia e do Gantt operacional completo não executado. A leitura operacional usa a referência capturada na assinatura como primeira fonte e mantém os baselines antigos como fallback.
- Referências anteriores não foram preenchidas automaticamente. Casos antigos sem referência continuam protegidos, não tratados como orçamento zero.
- As cópias 1fa468c4-7b80-4c5b-93d0-6a3767272fbb e 2e56f202-a5e2-4913-af20-c48b3499a237 foram preservadas conforme a fábrica D46/D47; eliminação aguarda OK explícito, sobretudo a primeira com referência/histórico imutável.

## Ficheiros alterados
- `docs/DECISIONS.md`, plano/este relatório, `roadmap.md`, `AGENTS.md`, regras locais de Quotes/Projects.
- Migrações espelhadas e byte-idênticas 0310_precontract_values_boundary, 0311_precontract_value_actions, 0312_contract_reference_project_read em `supabase/migrations` e `drizzle/migrations`; tipos regenerados automaticamente.
- `src/lib/quotes/use-quote-commercial.ts`, `calculator-planning.ts`, `src/lib/projects/use-gantt-commercial.ts`.
- `src/components/planner/quote-value-dialog.tsx`, `retainer-settings.tsx`, `planner-gantt.tsx`, `planner-inspector-model.ts`, `project-inspector-adapter.tsx`, `gantt-commercial-panel.tsx`.
- `src/components/quotes/quote-planner-inspector.tsx`, `calculator-apply-dialog.tsx`.
- `scripts/test-precontract-values.test.ts`, `scripts/e2e/precontract-values/verify.py`, `calculator.py`.

Nenhuma alteração ao conteúdo documental real nem eliminação de históricos foi feita nesta execução.