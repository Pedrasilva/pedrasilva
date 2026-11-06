# Correções antes de B1 — 6 novembro 2026

## Resultado e limites
- **B1 OFF; Fase A ON**, confirmados por leitura das auditorias antes e depois. Nenhuma ação de corte, nenhum registo real alterado; B2 não iniciado.
- Rita, sessão autenticada própria, pré-visualização B1 de Mint: **receita 3 086 €, custo 1 812 €, lucro 1 274 €, margem 41%**, iguais à sessão Luis em Resumo/Análises.
- Valores sem arredondamento: receita **3 085,875**, custo de fases **1 763,775**, Pursuit **47,99**, custo total **1 811,765**, lucro **1 274,11**, margem **41,28845141167415%**. Evidência: `pre-b1-fixes/reconciled-figures.json`.
- A pré-visualização intercepta somente no navegador de teste a leitura do estado B1 e encaminha recursos, custos e preços para as ações de revisão próprias autorizadas; **não é teste de corte real ON**. Não injeta valores de Luis na sessão Rita. O estado real permaneceu OFF.

## 1. Detalhes vazios a 800px
Reproduzido: a grelha sem coluna mínima abaixo de `lg` adotava a largura intrínseca da tabela (aside **1629,97px**), levando os valores alinhados à direita para fora da janela. Não era falta de datas.
Correção: coluna `minmax(0,1fr)` e `min-w-0`; cada DetailRow empilha valor abaixo da etiqueta com quebra de palavras.
Após: aside **704px** a 800; **240px** a 1050 e 1400. Estado, início **1 jun 2026**, fim **23 jul 2027**, restante **259d** visíveis. Sem alterações de datas.
Capturas: [antes 800](pre-b1-fixes/mint-before-800.png), [antes 1077](pre-b1-fixes/mint-before-1077.png), [depois 800](pre-b1-fixes/mint-after-800.png), [depois 1050](pre-b1-fixes/mint-after-1050.png), [depois 1400](pre-b1-fixes/mint-after-1400.png). Antes específico de 1050/1400 não foi capturado.

## 2. Ações pelo estado atual
Projeto ativo já não apresenta «Activate». Mostra Pause / Close out / Archive. Cada ação cujo destino já é o estado atual é omitida; restantes ações usam variante discreta. Nenhuma mudança de estado foi efetuada no projeto real.

## 3. Banner da equipa
A consulta `pm_preview_project_access` já devolvia `active=true`, mas a mensagem estava incondicional. Agora só aparece se `active === false`; não aparece enquanto carrega nem quando ON.
Captura: [Manage team com Fase A ON](pre-b1-fixes/team-phase-a-on.png).

## 4. Pursuit pertence a Budget
O leitor legado `pm_project_pursuit_totals` exigia permissão financeira global, não o acesso Budget do projeto; Rita não recebia o custo pré-contrato. Novo `pm_b1_pursuit` usa autorização PSA/projeto e `budget_cost`, mantém snapshots e horas sem snapshot. Quando Budget está negado devolve valores null, preservados como indisponíveis, nunca zero. Sem oportunidade/sem entradas autorizado: contribuição legitimamente vazia.
O hook do detalhe usa este caminho apenas em B1; relatórios/listas legados permanecem fora do corte B1. Cache inclui pessoa e estado B1. Novo leitor de revisão de custo usa a mesma autorização Budget sem ligar o gate.
Capturas: [Rita Resumo](pre-b1-fixes/rita-mint-b1-review-overview.png), [Rita Análises](pre-b1-fixes/rita-mint-b1-review-insights.png), [Luis Análises](pre-b1-fixes/luis-mint-insights.png), [Rita Uralchem Resumo](pre-b1-fixes/rita-uralchem-b1-review-overview.png), [Rita Uralchem Análises](pre-b1-fixes/rita-uralchem-b1-review-insights.png).
Uralchem: continua operacional, sem totais financeiros; Pursuit negado retorna null. A identidade do cliente «Sem cliente» em Rita já era outro caminho de leitura e não foi alterada nesta tarefa.

## 5. Três alertas QA
1. **Faturas a emitir fora da ordem de data:** restaurada data de emissão prevista ascendente em cada grupo; construção só desempata datas iguais. Não mistura números WBS entre projetos. Dois testes concretos de datas e construção.
2. **Adicionar despesa reutiliza recibo antigo:** `handleAdd` limpa `droppedFile`. Reabrir a mesma sessão do recibo conserva o mecanismo existente de reutilização; uma nova despesa começa limpa. Teste com gesto drop de PDF sintético, fechar e Add expense: **um POST simulado**, campos vazios, sem segundo envio. Storage simulado e extração bloqueada antes de executar: zero documentos/custos/ficheiros reais criados. [Primeira sessão](pre-b1-fixes/expense-first-synthetic.png), [nova despesa limpa](pre-b1-fixes/expense-new-clean.png). Não é teste de extração AI ou gravação real.
3. **Códigos de tradução:** EN/PT adicionados para `common:users`, `searchPlaceholder`, `filterPlaceholder`, `noResults`, `view`, `failed`, `ok`; `finance:payments.matched`, `payments.manual`; `glossary:proposalRole.unassigned`. Ecrãs: permissões admin, Novo colaborador, inspetor de backups, importações admin, benefícios RH/admin RH, Faturação do projeto e agregação de papéis da proposta. `finance:bank.col.snapshotCheck` já existia EN/PT, preservado. Paridade e auditoria AST passaram; não foram abertas todas estas páginas em browser.
O quarto alerta atual, Marketing capture deletion, não integra os três alertas QA pedidos e não foi alterado.

## Ficheiros alterados
- `src/routes/_app.projects.$projectId.tsx`
- `src/components/projects/project-team-card.tsx`
- `src/components/projects/project-expenses-section.tsx`
- `src/lib/projects/use-pursuit.ts`
- `src/lib/finance/invoices-to-issue.ts`
- `src/components/finance/invoices-to-issue.tsx`
- `src/i18n/locales/{en,pt-PT}/{common,finance,glossary}.json`
- `scripts/test-pre-b1-fixes.test.ts`; regras em `src/lib/projects/AGENTS.md`; `roadmap.md`
- Migrações **0264** Budget Pursuit e **0265** revisão read-only custo, cópias idênticas em `drizzle/migrations` e `supabase/migrations`. Tipos gerados automaticamente.

## Verificação
23 testes de valores B1/receita/Pursuit/ordem de fila/estado do formulário passaram; suite i18n, paridade EN/PT e AST passaram; último build OK. Layout e faixa verificados em browser autenticado; comparações Rita/Luis feitas em sessões distintas.
Nenhuma fixture persistente necessária nesta tarefa: recibo apenas browser-local, envios interceptados e extração abortada. Leitura independente final: fixtures com prefixo `[QA DISPOSABLE] Pre-B1 2026-11-06` = **0**, Fase A **true**, B1 **false**. Nenhuma limpeza de dados reais.
