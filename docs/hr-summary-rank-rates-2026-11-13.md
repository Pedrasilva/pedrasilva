# Resumo HR e categorias / valores horários

13 novembro 2026 — pedido de Luis às19:21UTC. B1 OFF; nenhuma escrita na base de dados.

## 1. Resumo Geral corrigido

**Causa:** `src/routes/_app.hr.resumo.tsx` comparava `collab.departamento` com `t("common:projectTeam")`. O valor guardado é `Projecto`; os rótulos são `Project team`/`Equipa Projeto`. Nunca coincidiam. Backoffice coincidia por acaso em ambos os idiomas. Não foi exclusão pela classificação híbrida ou perda salarial.

Nova função pura `src/lib/hr/summary-departments.ts` particiona pelos valores guardados, antes de traduzir os rótulos. Não altera seleção de fichas nem fórmulas. Existem11 colaboradores Projecto e1 Backoffice não arquivados:8 dos11 têm ficha efetiva e3 usam o fallback proposto já existente; Backoffice tem1 efetiva.

| Indicador | Antes (filtro identificado) | Depois verificado na UI de Luis |
|---|---:|---:|
| Pessoas Projeto | 0 | 11 |
| VBG Projeto | 0 € | 371 090,57 € |
| VBG Backoffice | 26 090,80 € | 26 090,80 € |
| VBG total pessoas | 26 090,80 € | 397 181,37 € |
| Custo anual atelier, incluindo operação | 286 090,80 € | 657 181,38 € |
| Horas Projeto (11 ×230 ×8) | 0 | 20 240 |
| FTE Projeto híbrido | 9,70 | 9,70 |

`/hr/valor-bo` confirma exatamente371090,57€ para11 colaboradores. Híbrido é uma atribuição distinta: não exige que9,70FTE sejam11 pessoas nem usa o mesmo subconjunto de fichas; não foi modificado.

Verificação autenticada com Luis: duas tabelas Geral (1+11), KPIs e composição;35 linhas nas tabelas da página, incluindo outras tabelas existentes. A primeira leitura falhou porque bloqueava também consultas RPC de autorização; corrigido apenas o script de leitura. Nenhuma proteção da aplicação alterada. Interface verificada em EN; preferência persistida da conta sobrepôs tentativa de PT local, pelo que não se declara validação visual PT independente. O filtro é agora independente do idioma por construção/teste.

Dois testes de regressão passaram (`scripts/test-hr-summary-departments.test.ts`); testes salariais existentes `scripts/test-salary-vbg.mjs` passaram; preview build OK. Scripts de navegador sob `/tmp/browser/hr-summary`, com bloqueio de operações REST de escrita e sem clicar em qualquer ação de guardar.

## 2. Onde vivem categorias e valores

- **Catálogo:** Administração → Títulos comerciais, `/admin/proposal-roles`. Lista as funções, rótulos, senioridade padrão e custo/hora manual do catálogo (`proposal_roles`).
- **Atribuição individual:** Team/HR → ficha do colaborador → **Função comercial**: Função em proposta, Função de faturação opcional e Nível de senioridade. São independentes do cargo HR. Guardados na ficha do colaborador.
- **Custo individual HR:** ficha de compensação/snapshot efetivo (fallback proposto no resumo), dias/horas, carga faturável e quota Backoffice; apresentado em **Resumo → Pricing**. Não existe um custo salarial fixo por rank para cada pessoa; deriva da remuneração e dos parâmetros HR. Margem global em `/hr/valor-bo`, override individual na ficha. Custos históricos continuam os snapshots bloqueados das horas; não foram tocados.
- **Venda por proposta:** editor da quote → separador de valores horários faturáveis; `quote_billable_hourly_rates` guarda os overrides por função e quote. Não são valores universais da equipa.
- **Renderização da tabela do documento:** `live-data.ts` escolhe custo manual positivo do catálogo, senão custo HR médio por função; override de venda positivo da quote ganha. Sem override, este caminho usa atualmente **custo ×2**, não ×1,5 como o preço por pessoa do planeador.

Leitura atual de Chiado: Sócio239€, Diretor200€, Sénior180€, Arquiteto130€, Júnior70€ são vendas manuais da quote. Não existe override92€ Lead Designer no banco: valores manuais encontrados para essa função noutras quotes são75€. Os92€ podem decorrer do fallback HR ×2 no documento; sem o documento específico não se confirma a origem exata dessa linha. Oleiro não tem overrides na tabela consultada.

Catálogo atual: custo Sócio **0,02€/h**; outras8 funções com0 (fallback HR). Valor suspeito, **não corrigido**. Catálogo contém9 funções, não só as6 mostradas pelo documento.

### Divergências que requerem decisão, sem correções neste pedido

1. Venda do bloco documental usa ×2; regra global de preço por recurso aponta ×1,5. Confirmar com Luis qual política manter para catálogo/documentos, preservando sempre overrides por proposta e documentos emitidos.
2. Custo Sócio manual0,02€ positivo sobrepõe custo HR neste caminho; validar antes de alterar.
3. Tab de edição apresenta custo manual do catálogo; tabela impressa pode usar média HR quando custo manual é0. Não confundir estes dois preços.

## 3. Proposta — não construída

**Definições → Categorias e valores horários (Ranks & rates)**, acesso HR completo existente, sem novas permissões:

- Uma linha por função: colaboradores atribuídos, média e intervalo de custo/hora HR, custo manual catálogo separado e identificado, venda padrão, markup sobre custo e margem sobre venda claramente distintos.
- Mostrar pessoas sem ficha/custo como incompleto, nunca custo zero; Backoffice excluído dos recursos de projeto, custo distribuído por FTE.
- Abrir a ficha de cada colaborador para editar função ou remuneração pelas ações existentes.
- Mostrar overrides de venda por proposta separadamente, não substituir contratos/PDFs/snapshots históricos.
- Reutilizar cálculos HR e catálogo existentes; definir com Luis precedência e markup antes de construir.

## Ficheiros alterados

`src/routes/_app.hr.resumo.tsx`, nova função `src/lib/hr/summary-departments.ts`, teste `scripts/test-hr-summary-departments.test.ts`, regra local `src/lib/hr/AGENTS.md`, `docs/DECISIONS.md` (D59), este relatório, `roadmap.md`. Sem migração ou alterações salariais/custos guardados. B1 não foi acionado.