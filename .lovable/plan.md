# Fase B — isolamento financeiro completo por projeto (plano apenas)

## Estado e limites
A tentativa de Fase A foi revertida após Faturação não aparecer para Rita na Mint; corte OFF. Este plano não autoriza nova ativação nem altera dados reais. A correção de Faturação e repetição dos checks da Fase A são pré-requisitos separados. Nenhuma implementação da Fase B nesta entrega.

## 1. Fechar a Fase A antes de avançar
- Permitir leitura da Faturação do próprio projeto por Financials, sem abrir módulo Finance nem conceder editar, emitir, pagar ou alterar valores.
- Repetir Rita Mint/Uralchem, Patricia, membro all-OFF, quatro capacidades globais e anexo real permitido/negado; comparar matriz/dados e reverter imediatamente perante falha.
- Manter ação auditada e rollback prontos. Não inferir sucesso de zero linhas quando não existe evidência de linhas reais.

## 2. Leituras operacionais sem valores negados
Separar dados operacionais dos quatro grupos financeiros em projetos, fases, propostas convertidas, alocações, horas, recursos e snapshots. Criar projeções autorizadas que devolvem apenas campos permitidos; retirar leituras diretas amplas só depois de migrar todos os leitores. RLS de linhas, por si só, não oculta colunas.
- Datas, dependências, nomes, horas autorizadas e planeamento continuam operacionais.
- Contrato/venda por Financials; orçamento/custo/snapshots por Budget; despesas por Expenses; fornecedores por Suppliers.
- Lucro, margem e totais integrados só quando todas as parcelas necessárias são permitidas. Valor oculto não vira zero.
- Não mudar snapshots de custos, preços, datas, baseline, folhas de horas ou publicação semanal.

## 3. Todas as páginas e agregados
Migrar Overview/cabeçalho, Insights, avença, orçamento, inspetores e Gantt; depois homepage, Gantt global, pesquisa, forecasts e relatórios. Filtrar no servidor antes de agregar, inclusive contagens/totais que permitam reconstruir valores. Leituras de recebimentos usam a projeção operacional do item 2; previsões legadas de saídas não devem herdar datas relativas de propostas convertidas.

## 4. Documentos, anexos e servidores
Inventariar consultas/RPCs e funções privilegiadas que devolvem dados mistos, texto com valores, URLs, exportações e PDFs. Reautorizar downloads e geração pelo chamador/projeto/área; evitar devolver documento completo quando contém áreas negadas. Preservar conteúdo e idioma dos documentos; bloquear acesso ou produzir saída autorizada, nunca reescrever documentos históricos. Rever URLs assinadas existentes e sua validade sem prometer revogação instantânea de links já emitidos.

## 5. Migração e aprovação
- Inventário por leitor: origem, campos/área, chamador, projeção nova, testes e cobertura; investigar caminhos ainda não localizados antes de declarar cobertura completa.
- Migrações aditivas e mirrors idênticos; substituir SELECTs permissivos de leitura sem alargar ou remover proteções de escrita.
- Gate separado para a Fase B, inicialmente OFF; matriz de pessoas × projetos × áreas, perdas e exceções globais explícitas.
- Apresentar evidência e esperar aprovação própria para o corte da Fase B. Rollback só muda autorização, não dados.

## Verificação
Um fixture descartável de cada vez, sem testar mutações em projetos/propostas reais. Testar área isolada/tudo OFF/tudo ON, múltiplos membros ON, gestor versus não gestor, global e não-PSA. Exercitar API direta, deep links, agregados, exportações/PDFs/anexos e caches após troca/revogação de acesso. Confirmar horas e custos históricos intactos, PT/EN, comparação antes/depois e zero fixtures. Verificações com sessões reais apenas para leitura e após autorização. Cessar perante falha do pooler.

## Detalhes técnicos — alvos iniciais
- Projetos: `src/routes/_app.projects.$projectId.tsx`, hooks em `src/lib/projects` (`useProjects/useProjectDetail/useAllStages/useResources`, planner, actuals, baseline), `QuoteGantt` e inspetores.
- Globais: `_app.index.tsx`, routes Projects Gantt/financials/forecast/insights/resources, componentes `financial-kpi-strip`, `project-scorecard`, `project-health-table`, `project-value-chart`.
- Reports: `src/lib/reports/use-{business-performance,budget-consumption,estimate-vs-actual,supplier-stages,capacity-forecast}.ts`; ler AGENTS local antes de alterações.
- Finance: `use-cashflow-report.ts`, `legacy-sections.tsx`, servidores de recebimentos/issued-PDF/OCR, downloads e editor de Faturação. Preservar ownership e guards fiscais.
- Pesquisa/exportações/PDFs/documentos: completar mapa de ficheiros e chamadas antes da implementação; não são considerados já auditados.

## Entrega
Relatório de cobertura por superfície, matriz, testes, screenshots PT/EN, migrações, provas de dados preservados/zero e lista explícita de qualquer caminho ainda aberto. Sem afirmação de isolamento completo antes da verificação de todas as superfícies.
