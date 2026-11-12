# Oleiro — quebras de página e fidelidade do texto

## Resultado
- Corrigidas e verificadas as quebras explícitas no modo Páginas e no PDF: bloco Quebra de Página, quebra antes e quebra depois.
- Reproduzido antes da correção: Índice e Sumário ocupavam a página 2 na cópia descartável. Depois: Índice na página 2, Sumário na página 3.
- B1 permaneceu OFF (`preview`, `recorded`, `effective` falsos). Proposta original e blocos comparados após os testes: sem alterações. Cópias descartáveis eliminadas.

## Causa e correção
O Paged.js agrega regras por seletor, sem reproduzir integralmente a precedência CSS; as regras amplas de `avoid`/`auto` podiam substituir a quebra explícita apesar do estilo calculado indicar `page`. Além disso, o marcador de quebra fica vazio quando o conteúdo exclusivo da edição é removido.

A preparação da cópia de impressão transfere os marcadores e as opções antes/depois para a próxima secção imprimível, ignorando blocos invisíveis e evitando página inicial em branco. Um handler na iframe fixa estas fronteiras após a interpretação CSS do Paged.js. O PDF continua a exportar as páginas concluídas, sem segunda paginação.

## Texto: diagnóstico, não uma reescrita automática
A consulta inicial dos blocos da proposta Oleiro já devolveu no HTML guardado `estudos eProjecto de Arquitectura`, sem `<strong>` nessa expressão. A paginação reproduzia esse mesmo HTML. Não encontrei transformação de ortografia/maiúsculas pelo Paged.js nem substituição dessa expressão no renderizador.

Na cópia descartável, digitei a expressão correta no editor, apliquei negrito e mudei imediatamente para Páginas: espaço, `PROJETO DE ARQUITETURA` e negrito mantiveram-se. O mesmo texto foi preservado nos três PDFs efetivos. Não alterei o texto real nem introduzi substituições automáticas. A discrepância já guardada na proposta real não foi corrigida por este trabalho; a causa de uma eventual edição anterior não guardada não foi demonstrada.

## Validação
| Teste | Resultado |
|---|---|
| Quebra original Índice → Sumário na cópia integral | PASS |
| Bloco Quebra de Página isolado, Páginas + PDF efetivo de 2 páginas | PASS |
| Opção quebra antes isolada, Páginas + PDF efetivo de 2 páginas | PASS |
| Opção quebra depois isolada, Páginas + PDF efetivo de 2 páginas | PASS |
| Edição seguida imediatamente de Páginas: espaços, maiúsculas e negrito | PASS |
| Texto de cada página exportada igual ao modo Páginas | PASS |
| PDF efetivo: destino só na página 2, expressão em maiúsculas preservada | PASS |
| Fonte real intacta, cópia eliminada, B1 OFF | PASS |
| Compilação | PASS |

## Ficheiros alterados/adicionados
- `src/components/psa-composer/paginated-preview.tsx` — preparação das fronteiras na cópia de impressão.
- `src/lib/psa-proposal/explicit-page-breaks.ts` — normalização dos marcadores, sem alterar texto.
- `src/lib/psa-proposal/paged-frame.ts` — handler explícito após CSS parsing.
- `src/components/psa-composer/AGENTS.md` — regra técnica local.
- `scripts/test-proposal-explicit-breaks-e2e.py` — regressão com cópia descartável, limpeza e preservação da fonte.
- `roadmap.md` — resultado e limite da investigação.
- `docs/proposal-page-break-report-2026-11-12.md` — este relatório.

Sem SQL, migrações, alterações de políticas, permissões ou dados reais. `docs/DECISIONS.md` não foi alterado.
