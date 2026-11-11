# Faturação — revisão da confirmação de Luis

11/11/2026, 22:19 UTC. D39 regista a regra confirmada. Nesta revisão só se alteraram documentos e memória, sem código, permissões ou dados reais.

## Resultado: parar antes de continuar

O plano e a implementação parcial não cumprem ainda exatamente a confirmação:

1. O plano separa saídas/honorários de fornecedores pelo respetivo acesso. A confirmação diz que acesso financeiro permite ver o plano de faturação. A projeção atual omite saídas sem o acesso adicional. É necessário decidir qual fronteira conservar antes de ampliar leituras.
2. Registo fiscal usa as permissões Finance existentes, não a exclusividade Luis/Tatiana. A regra agora está confirmada, mas a implementação atual não demonstra essa exclusividade; exige autorização no servidor, não ocultação de botões nem nomes/emails como condição.
3. Edição de datas individuais usa o gestor/Finance existente, não necessariamente todos os leitores Financials. Deve passar a aceitar o acesso financeiro do projeto, exclusivamente em previsões não emitidas.
4. Linhas emitidas ficam bloqueadas nas ações de planeamento, inclusive para Finance. Para cumprir «alterar linhas emitidas», falta confirmar se basta o editor fiscal existente e correções auditadas, mantendo valores/datas congelados do plano, ou se se pretende uma nova ação fiscal no separador. Não desbloquear diretamente pagamentos/linhas emitidas.

## Implementação parcial anterior — evidência histórica, não novo teste

Verificações anteriores: seis testes puros; junção/desfazer e releitura numa cópia sintética; alteração Gantt 10 000→12 000 preserva grupo e recalcula 6 000+6 000; registo manual sem PDF de uma linha e bloqueio após emissão. Faltam grupo completo/concorrência, PDF, conciliação parcial/integral, permissões negativas, avenças/calendário/conversão no novo ecrã.

Uma linha órfã QA de histórico comercial permanece protegida; não enfraquecer o bloqueio imutável para apagar. Publicação não certificada. Nenhum plano antigo preenchido.

## Ficheiros desta revisão

- docs/DECISIONS.md: D39 e clarificação histórica de D38.
- roadmap.md: confirmação e bloqueio da revisão.
- docs/project-billing-permissions-review-2026-11-11.md: este relatório.
- Memória da regra confirmada de permissões; nenhuma alteração à aplicação nesta revisão.

## Próxima implementação, após resolver desvios

Autorizar planeamento por Financials; atos fiscais por capacidade protegida atribuída apenas a Luis/Tatiana, reutilizando procedimentos existentes. Preservar isolamento de entidades/projetos e confirmação do gestor. Completar PDF/identidade externa/envio futuro sem integração. Testar só cópias descartáveis; B1 OFF; nenhuma migração de preenchimento retroativo nem atualização de faturas/pagamentos reais. Entregar capturas novas e resultados, sem apresentar capturas antigas como novas.