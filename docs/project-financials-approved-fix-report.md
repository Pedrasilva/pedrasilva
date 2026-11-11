# Financeiro dos projetos — correção aprovada

11 novembro 2026, verificação concluída às 15:04 UTC. B1 OFF, revisão 10; nenhuma ativação, alteração de salários, recursos, horas, despesas, honorários ou projetos reais. Sem fixtures persistidas ou Fase 2 do Gantt.

## Resultado verificado em Mastercard

Comparação autenticada real Luis / Ricardo, só leitura, antes e depois:

| Leitura / apresentação | Luis | Ricardo |
|---|---:|---:|
| Recursos autorizados | 16 | 16 |
| Pares HR derivados custo/venda válidos | 11 | 11 |
| Horas faturáveis | 535,65 h | 535,65 h |
| Horas não faturáveis | 6,50 h | 6,50 h |
| Total de horas | 542,15 h | 542,15 h |
| Valor de Serviços (estimado, apresentação) | 32 408 € | 32 408 € |
| Custo de Serviços (apresentação) | 18 735 € | 18 735 € |
| Lucro de Serviços / margem (apresentação) | 13 674 € / 42% | 13 674 € / 42% |
| Custo/Lucro total, com despesas | — | — |

As listas completas de recursos, preços derivados e resumos de horas são exatamente iguais entre os dois. Os resumos de horas e os preços de Luis são iguais antes/depois. Os euros da tabela são valores arredondados da página, não salários. A venda continua identificada como estimada quando não existe preço guardado.

Patricia, sem nenhuma área financeira de Mastercard: `pm_project_rate_access=false`, zero recursos e preços; chamadas de preview também devolvem zero. Página mostra apenas Resumo/Notas e informação operacional, não métricas financeiras. Identidades e preços não são autorizados por nomes/emails; usa-se o acesso financeiro por projeto já existente.

## Correções

- Um único acesso por projeto, verificado na origem, autoriza a lista explícita de recursos e os custos/preços HR derivados em ambos os estados B1. O cálculo continua a incluir overheads. As políticas de salários e HR não foram alteradas.
- O leitor individual de recursos, usado em alocações aninhadas, segue a mesma regra; evita divergências entre lista e detalhes.
- O cálculo privilegiado HR verifica primeiro o acesso do chamador ao projeto. Acesso a outro projeto continua a exigir a autorização desse outro projeto; a ausência de projectId não reutiliza uma autorização por projeto.
- Faturável e Não faturável somam os campos de classificação do resumo que deriva de `pm_time_entries.billable`, independentemente de recursos encontrados/preços. Não faturável nunca é calculado por subtração do total.
- Se o resumo não carregar ou falhar, as pílulas mostram «—» e uma razão curta; não se usa uma lista parcial de entradas próprias como se fosse o total do projeto. O histórico importado mantém as suas próprias colunas e fica fora dos totais de uma fase.
- A página usa a área Financials para permitir o cálculo financeiro e não apresenta o painel financeiro de Análises a quem não tem essa autorização.

B1 ON não foi ativado para testes. A autorização destes leitores é independente do estado B1; testes de regressão verificam os mesmos caminhos e a proteção de margens. Não se afirma certificação de toda a página em produção com B1 ON.

## Despesas a completar por Tatiana

Foi encontrada **uma** despesa versão 2 sem EUR. Despesas versão 1 sem eur_amount não são erros: usam purchase_price.

| Projeto | Despesa | Data | Valor original | EUR | Estado | Documento |
|---|---|---|---|---|---|---|
| 2609 Mastercard | Visita Londres | 13/10/2026 | 53,80 GBP | Por completar | submitted | 74088-74089-4410-6792-22-06-J |

Linha exata: `pm_expenses.id = 2e2ee7fa-ca9e-4822-81f9-c71e220cf5de`; projeto `a07f12ad-5033-4c38-b26b-2077d6ffd55b`. Nada preenchido, nenhuma taxa de câmbio inventada. Tatiana deve completar o valor EUR com evidência. Até lá, custo/lucro integrados continuam corretamente indisponíveis para ambos; o custo/lucro de Serviços já é visível.

## Decisão comercial em aberto

**Manter custo × 1,75 (75% markup) em Projetos por agora.** Uma futura uniformização com o construtor de propostas exige decisão separada. Não houve alteração à fórmula, snapshots históricos ou overrides.

## Ficheiros alterados / adicionados

- `src/lib/projects/default-rates.functions.ts` — autorização por projeto antes de HR, OFF/ON.
- `src/routes/_app.projects.$projectId.tsx` — Financials do projeto, pílulas independentes e falhas sem números fictícios.
- `src/lib/projects/project-hour-classification.ts` — agregação pura da classificação guardada.
- `src/i18n/locales/en/projects.json`, `src/i18n/locales/pt-PT/projects.json` — razão de indisponibilidade.
- `drizzle/migrations/0273_project_scoped_hr_rate_reads.sql` / `supabase/migrations/20261111145600_project_scoped_hr_rate_reads.sql` — acesso comum e projeção de lista, cópias byte-idênticas.
- `drizzle/migrations/0274_project_scoped_single_resource_read.sql` / `supabase/migrations/20261111150200_project_scoped_single_resource_read.sql` — leitor individual, cópias byte-idênticas.
- `src/integrations/supabase/types.ts` — regenerado automaticamente.
- `scripts/test-project-hour-classification.test.ts`, `scripts/test-project-rate-access.test.ts` — regressões específicas.
- `AGENTS.md`, `src/lib/projects/AGENTS.md`, `roadmap.md` — regras/estado; memória de acesso atualizada.
- Relatório e capturas em `docs/project-financials-approved-fix/`.

## Verificações

- 23 testes Vitest: classificação, acesso, preços, totais e margens; 5 testes adicionais de custos de avença através de Node, todos PASS.
- EN/PT parity PASS; auditoria de novos literais: zero; último resultado de compilação OK.
- Navegador 1280 × 1800: Luis e Ricardo em Análises, Patricia sem financeiro. Comparação de respostas completas, não apenas números arredondados.
- A primeira execução de testes de avença foi feita com o runner errado; repetida com Node, 5/5 PASS. Uma navegação inicial expirou durante carregamento; repetida com espera de DOM e executada com sucesso.
- As visitas usam a funcionalidade já existente de páginas recentes pessoais; não foram feitas gravações de dados de negócio. Sem testes de escrita em projetos reais.
