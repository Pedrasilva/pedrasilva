# Oleiro — correções autorizadas, 12 novembro 2026

## Resultado
Arquitectura fatura subfases separadamente; Programa tem papel architecture; Construção contém Concurso primeiro e Avença segundo. Avença tem 12 meses × 3000, dependência FS de Projecto de Execução e início no primeiro dia útil do mês seguinte. B1 OFF.

Luis editou dados imediatamente antes do pedido: Concurso passou a **3500 €**, avença estava em 18 meses. Preservado Concurso 3500; avença corrigida para os 12 meses expressamente autorizados. Total atual **203300 € + IVA 46759 € = 250059 €**, não o anterior 201840 €.

## Numeração atual
| WBS | Fase |
|---|---|
|1|Arquitectura|
|1.1|Programa|
|1.2|Estudo prévio|
|1.3|Anteprojeto + submissão do PIP|
|1.4|Licenciamento|
|1.5|Projecto de Execução|
|1.6|Construção|
|1.6.1|Concurso de construção (apoio)|
|1.6.2|Avença fase de obra|

**Não é 2.6.2:** depois de retirar a avença da raiz existe só uma fase principal, Arquitectura. Não inventada uma fase nem alterado o algoritmo de numeração para forçar o prefixo 2.

## Plano guardado: 25 linhas
Mantidas regras existentes: adjudicação 20%, deduzida das prestações de fases; divisão início/fim existente; IVA 23%.

| Linhas | Descrição | Sem IVA |
|---|---|---:|
|1|Adjudicação|33460|
|2–3|Programa, início/fim|6800 + 6800|
|4–5|Estudo prévio, início/fim|20000 + 20000|
|6–7|Anteprojeto/PIP, início/fim|2720 + 2720|
|8–9|Licenciamento, início/fim|14000 + 14000|
|10–11|Execução, início/fim|22000 + 22000|
|12–13|Concurso, início/fim|1400 + 1400|
|14–25|Avença, meses de obra 1–12|12 × 3000|

A vista agrupa pelas regras já existentes de proximidade (7 dias): mostra **20 faturas**, mantendo 25 linhas e os mesmos totais. Mensalidades não agrupadas entre si; cada uma tem 690 € IVA, total 3690 €.
Escala relativa guardada: primeira mensalidade 2000-09-01 depois de Execução 2000-08-15; demais primeiro dia de semana de cada mês até 2001-08-01. São coordenadas relativas, não datas reais prometidas. Feriados/fechos reais aplicam-se na conversão.

## Preservação
- 34 blocos do original exatamente iguais à comparação inicial.
- Todos os 35 snapshots existentes às 12:45 preservados sem diferenças; há agora 36, com uma nova versão automática criada às 12:46:31 durante a sessão, antes da correção real. Nenhuma versão apagada ou restaurada.
- Monthly Assistance já não existia entre as 9 fases reais à primeira leitura. Não foi apagada nem recriada por esta tarefa.
- Cópia autorizada 102948d5-d0ea-46e7-88cb-7a8aa2a488bd e seu documento removidos; leitura independente confirma zero quotes.
- Nova cópia de teste separada 7d7accd8-706b-424d-8e91-14feae419d30 fica guardada: não há autorização para a apagar.

## Correção de código e validação
- Movimentos usam posição persistida/hierarquia, nunca o último segmento WBS visual; setas atravessam grupos, indentar/recuar mantém descendentes e não altera datas/valores.
- Adaptador operacional já não empurra artificialmente avenças para o fim por sort_order.
- Faturação expande pais com filhos de faturação personalizada: a avença dentro de Construção não vira pagamento único nem sofre desconto da adjudicação.
- Gerador segue WBS completo, não sort_order global entre filhos de pais diferentes.
- 24 testes unitários PASS; i18n zero novas cadeias; build OK.
- Subir/descer/recuar/indentar na cópia pela UI e recarregamento realizados; original lido apenas para confirmar resultado autorizado. Operacional usa o mesmo helper, mas não houve novo teste de navegador num projeto convertido; concorrência não certificada.
- Capturas verificadas em /tmp/browser/oleiro-approved/: moves.png (cópia), real-readonly.png, payments.png. Não exportado novo PDF nesta tarefa.

## Ficheiros
- src/lib/quotes/outline-moves.ts (novo)
- src/components/planner/planner-gantt.tsx
- src/components/projects/gantt-chart.tsx
- src/components/projects/gantt-outline-column.tsx
- src/lib/quotes/stage-billing.ts
- src/lib/quotes/payment-generators.ts
- scripts/test-outline-moves.test.ts (novo)
- scripts/test-nested-retainer-billing.test.ts (novo)
- src/lib/quotes/AGENTS.md; docs/DECISIONS.md (D49); roadmap.md; este relatório.
- SQL **0310_oleiro_authorized_billing_retainer.sql**, **0311_oleiro_authorized_fixture_cleanup.sql**, idênticos em supabase/migrations e drizzle/migrations. Dados aplicados pelo serviço de consultas, não por alteração de esquema; ficheiros registam exatamente as instruções executadas. Nenhuma política, papel ou esquema alterado.