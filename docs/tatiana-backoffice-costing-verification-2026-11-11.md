# Tatiana — Backoffice e preços de projeto

11/11/2026. Decisão de Luis às 21:08 UTC; verificação apenas por leitura. B1 OFF. Nenhum código, política, dado salarial, recurso, hora ou preço alterado.

## Confirmado

- Tatiana está em `departamento=Backoffice`, `resource_classification=backoffice`, `backoffice_pct=100`, `include_in_planning=false`.
- A função real `getPmDefaultResourceRates` devolveu **11 recursos com preços**, nenhum de Tatiana: Luis, João, Ricardo Conceição, Irene, Patricia, Bernardo, Francisco, Ricardo Cabrita, Adalberto, Rita Saragoça e Mariana. B1 false na mesma sessão.
- `default-rates.functions.ts:142-187`: VBG de Backoffice entra no overhead; denominador é a soma dos FTE de Projecto; cada pessoa recebe quota proporcional ao seu FTE. Só Projecto recebe preços próprios. `pricing.ts` divide custos operacionais + VBG Backoffice pelo FTE total quando disponível.
- `cost-rates.server.ts:73-125`: períodos de custo usam a mesma distribuição; `hrRate` recusa não-Projecto. Tatiana não tem qualquer período em `pm_cost_rate_periods`.
- O recurso técnico de Tatiana existe, ativo, mas custo/venda guardados são ambos **0**, não preços próprios válidos. Zero alocações de projeto e zero associações a equipas de projeto. Zero entradas de horas de tipo project e zero preços de venda positivos nas suas entradas.

## Contradições / ressalvas a rever, sem corrigir

1. **Fórmula de propostas:** `src/lib/quotes/use-resource-pricing.ts:79-116` percorre todos os recursos com ficha e salário, sem excluir Backoffice antes de calcular custo/venda; acrescenta a quota de overhead ao VBG de cada pessoa. Por isso pode atribuir a Tatiana um preço próprio, com overhead adicional, em contraste com o cálculo de Projetos. O resultado é consumido em `quote-construction-assistance-tab.tsx:99-106` para preços de deslocações. É um caminho contraditório no código; não se testou/grava uma proposta real nem se afirma que Tatiana tenha sido utilizada numa.
2. **Recurso técnico ativo:** não equivale a recurso de projeto com preço, mas leitores/pickers que não filtrem Backoffice podem incluí-la. A lista autorizada de recursos do relatório financeiro anterior tinha 16 linhas, enquanto só 11 tinham preços HR; não confundir lista técnica com as 11 pessoas de Projecto. O indicador `hourly_rate_is_override=true` com custo/venda 0 também merece atenção, embora atualmente não gere preço próprio positivo.
3. **Análise interna histórica:** 152 entradas de Tatiana; 139 com fonte `overhead_salary`, zero de tipo project, zero de custo positivo noutra fonte. Existe `pm_backoffice_salary_cost` que divide salário por horas apenas para análise interna Backoffice; a regra de Projetos determina exclusão destes valores dos totais de projetos já carregados de overhead. Não é preço de recurso de projeto nem venda, mas contradiz uma leitura literal de «não existe qualquer valor horário em parte alguma». Preserve-se o histórico; Luis deve decidir separadamente se pretende manter esta análise interna ou retirar também a sua apresentação. Nada recalculado/eliminado.
4. **Override manual futuro:** `computePeriods` pode criar um período manual positivo para um recurso não-Projecto se alguém lhe gravar tal override. Atualmente Tatiana tem zero e nenhum período; falta uma exclusão estrutural neste caminho para garantir a regra contra alterações futuras.

## Conclusão

O cálculo HR de **Projetos** já trata Tatiana como overhead e exclui-a dos 11 preços próprios. Não há dupla contabilização demonstrada nesse cálculo. Há um caminho de preços **de propostas** e possíveis overrides/pickers que não garantem a mesma exclusão; apenas assinalados, sem correção. Registar D34 não aprova modificações nesses caminhos nem novas atribuições de permissões.