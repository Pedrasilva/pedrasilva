# Horas previstas — investigação de 12 novembro 2026

Nenhum código, política, salário, hora ou projeto alterado. Consultas read-only com identidade autenticada; B1 confirmado OFF. Só documentos/plano e regra confirmada D44 foram acrescentados.

## Causa
`_app.projects.index.tsx:482–519` calcula previsto exclusivamente como soma de `allocationHours`, nunca como honorário/taxa. Mint não tem alocações ativas; Alcanena tem alocações com esforço zero. A tabela de fases exibe travessão quando previsto <=0; a tabela principal compara usado >0 com previsto zero e colore vermelho. Os avisos existentes usam 80%, não 85%.

## Cálculos atuais e proposta
Média simples dos recursos explicitamente em `pm_project_team` e com taxa HR disponível; somente pessoas faturáveis. Nenhum override de projeto em `pm_project_rate_overrides` nos quatro exemplos. Flags globais de override existem mas todos os valores manuais correspondentes são zero, pelo que caem no HR. Valores abaixo usam taxas atuais retornadas pelo serviço HR, arredondadas a cêntimos; taxa nova simulada por custo atual arredondado ×1,5. Implementação calculará antes do arredondamento final, podendo diferir poucos centésimos.

| Projeto | Equipa usada na média | Honorários internos sem duplicação | Taxa média atual 1,75 | Estimativa à taxa atual | Taxa simulada 1,5 | Horas propostas est. | Alocado atual |
|---|---|---:|---:|---:|---:|---:|---:|
| Clinica Mint II | Rita Saragoça, Ricardo Cabrita | 30 980 € | 55,555 €/h | 557,65 h | 47,625 €/h | 650,50 h | 0 h |
| Alcanena | Irene Cunha, Ricardo Cabrita | 23 050 € | 60,155 €/h | 383,18 h | 51,560 €/h | 447,05 h | 0 h |
| Mastercard | Ricardo Conceição, Patricia Reis, Rita Saragoça | 315 000 € | 61,920 €/h | 5 087,21 h | 53,080 €/h | 5 934,44 h | 24 h |
| Uralchem IV | Ricardo Conceição | 651 200 € | 67,670 €/h | 9 623,17 h | 58,010 €/h | 11 225,65 h | 1 021 h |

Mint: 3 950 + 9 450 + 12 300 + 4×1 320 = 30 980; não somar novamente os filhos da avença. Cada mensalidade dará cerca de 27,72 h est.
Alcanena: 2 850 + 7 650 + 9 550 + 3 000 = 23 050. Pai Projecto zero é resumo, não falta de honorários quando os filhos têm valor.
Mastercard: só Architecture interna (25 000+72 000+18 000+100 000+15 000+8 000+77 000). Mais Engenharia/Nulty são fornecedores, não orçamento de trabalho da equipa PSA. `sold_fee=0` está desatualizado nos dados; usar fases atuais sem alterar esse registo.
Uralchem: 22 500+182 500+238 800+207 400 = 651 200. A equipa explícita tem uma pessoa; é importante confirmar se representa a equipa pretendida, sem atribuições automáticas.

As 1 021 h não vêm do honorário: 20 dias×6 h + 53 dias×(1,6+1+2,4+6+6) h = 120+84,8+53+127,2+318+318 = 1 021, calendário de trabalho atual excluindo feriados/fechos. Mastercard tem 3 dias×8 h =24. Luis confirmou manter estas reservas separadas das novas estimativas.

Média simples atual dos 11 recursos com taxa HR disponível: **61,1745 €/h**; simulação 50% cerca de **52,44 €/h**. Não é ainda a população certificada do fallback ativo: serviço atual filtra `archived_at`, não `estado` explicitamente; o novo fallback deve excluir inativos e pessoas sem custo, além de Backoffice.

## Inventário 1,75 e impacto
- `default-rates.functions.ts`: `PROJECT_DEFAULT_MARGIN=0.75`, `computePricing` e saída sale; mudar default para 0,5, nomes p75 e comentários.
- `use-default-rates.ts`: constante exportada 0,75 e comentários/banda de venda 75%; unificar com a mesma constante.
- `cost-rates.server.ts`: `MARGIN=0.75` passado a pricing; não afeta custo, mas alinhar constante/comentário; nunca reconstruir snapshots históricos por esta alteração.
- `financial-calculation.ts` **não contém hoje literal 1,75 nem 0,75**. Usa taxas resolvidas e sale snapshots; recebe indiretamente o default anterior via leitores. Não multiplicar outra vez nem reescrever snapshots.
- `rich-text-editor.tsx` contém string `1.75` de entrelinha; não é preço e não alterar.
- Consumidores indiretos: lista/detalhe/forecast/financials de Projects; `use-stage-budget-control`; relatórios business-performance, budget-consumption, company-health, estimates e recoverability através do mesmo resolvedor. Auditar cada um após aprovação.

Venda inferida cai **14,2857%**; horas estimadas por honorário sobem **16,6667%** sem override. Margem teórica sobre venda passa de **42,857% para 33,333%**. Valores de planos valorizados pelas taxas atuais e receita horária sem snapshot podem mudar. Honorários fixos e custos snapshot não mudam; logo margem real sobre honorários fixos NÃO deve mudar só por mudar o default. A lista usa `financialResult(revenue,cost)` e tem receitas horárias/snapshots; não prometer alteração uniforme de todas as margens.

## Proposta de média e metas
Usar média simples da equipa explicitamente atribuída, sem ponderar por horas registadas (orçamento não deve variar quando alguém regista trabalho) nem por alocações (muitas têm zero e reservas independentes). Equipa vazia → média simples de pessoas faturáveis ativas do atelier, marcada como fallback; equipa com pessoa faturável sem taxa → dados incompletos, não excluir silenciosamente para baratear. Sem taxa válida: «Taxa por definir».

`baseline_target_hours` existe mas todos os quatro exemplos são NULL; é referência bloqueada, não editar nem converter automaticamente em alvo corrente. `retainer_capacity_hours_per_month=160` é default de capacidade, NÃO alvo manual. Propor campo separado nullable de alvo corrente, sem backfill, só em cópias de teste antes da aprovação de uso; registo manual posterior via ação autorizada. Nenhuma escrita nos dados reais durante a implementação/testes.

## Permissões e euros
Reutilizar `pm_project_rate_access(projectId)`: auth.uid presente + `is_psa_staff()` + projeto não finance_only + `can_view_project_area(projectId,'financials')`. É o gate por projeto atualmente definido para B1 OFF e ON; não usar cargo/email/client storage nem simples permissão global da página como autoridade.

Nova projeção read-only autenticada verifica acesso operacional a cada projeto antes de calcular. HR privilegiado só no servidor; pessoa sem Financials recebe objeto explicitamente permitido com IDs, horas, origem/estado, sem budget/cost/sale/fee/rate, snapshots ou metadados que revelem euros. Pessoa autorizada recebe campo financeiro opcional só desse projeto. Segregar cache por utilizador/projeto/permissões, impedir reutilização de resposta privilegiada.

Sem acesso, também auditar os atuais leitores de fases, recursos, alocações e entradas da lista: esconder colunas não basta. Horas novas por si só não podem revelar taxa exata, mas alguém com conhecimento externo do honorário pode inferir uma média por divisão; nenhuma UI pode eliminar essa inferência matemática mantendo as horas pedidas.

€ gasto = custos reais por snapshots, nunca horas×taxa de venda. € restante = fee atual−custo gasto, não horas restantes×venda. Custos incompletos propagam aviso/indisponível; não estimar custos de avença ausentes.

## Limites por resolver na aprovação
Confirmar média simples/fallback e escopo interno versus fornecedores. Preservar hierarquia por helpers WBS/ownership; não contar pai+filhos/avença+meses duas vezes. Listar fases sem fee, sem transformar em zero ou em overrun. Cálculos novos não gravam horas, taxas ou budgets e não alteram Finance/CRM/planeamento semanal.