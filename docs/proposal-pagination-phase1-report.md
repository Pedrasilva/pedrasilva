# Proposal builder — paginação, continuação 8 novembro 2026

## Resultado
**Hotel Chiado: 12 páginas no ecrã e 12 no PDF; primeiro bloco idêntico nas 12 páginas.** Ensaio autenticado numa cópia apenas no navegador; todas as escritas foram interceptadas. Nenhuma proposta real alterada.

## Porque apareciam 5 páginas no ecrã e 12 no PDF
O ensaio anterior lia o ecrã assim que existia qualquer `.pagedjs_page`, antes do estado `ready` e antes de o snapshot vivo estar completo. A prova de 5 páginas continha «Projeto —», fases genéricas e o aviso para selecionar uma fase. A janela PDF aguardava paginação concluída e copiava um conjunto posterior, já com os dados vivos: 12 páginas. Reproduzindo com os dados carregados, **12/12 mesmo antes desta correção**. Portanto a evidência não demonstra sete páginas acrescentadas por reflow do browser: comparava duas versões do conteúdo em momentos diferentes.

## Correção
- Paginação só inicia com proposta, blocos e snapshot vivo presentes, sem consultas em curso/erro; cada bloco também expõe a prontidão do seu snapshot.
- Mantido debounce 300 ms, removida invalidação baseada em todas as consultas da aplicação. Fontes/imagens do documento são aguardadas pelo Paged.js.
- Execuções substituídas libertam os listeners das páginas antes de remover staging. Reprodução inicial teve quatro erros `getAttribute` em nós removidos; ensaio final **zero erros**.
- `printProposalDocument` copia exclusivamente `.proposal-paginated-preview .pagedjs_pages` concluído, removendo apenas seleção editorial. Regista a contagem no HTML exportado. Não chama outro paginador nem reconstrói os blocos; `@page A4 margin:0`, uma folha gerada por página. A preparação de revisão no diálogo usa a mesma função; o PDF enviado continua a ser anexado pelo utilizador, não foi enviada nenhuma revisão neste teste.

## Comparação
`proposal-pagination-phase1/parity.json`: 12 páginas, IDs dos primeiros blocos iguais no ecrã e HTML de impressão, texto inicial encontrado na página correspondente do PDF **12/12**. Páginas iniciam pelos blocos de ordinal 0,1,5,6,7,7,8,10,11,16,19,23 da cópia; um bloco continuado pode começar mais de uma página. PDF em `hotel-chiado-comparison.pdf`, captura em `hotel-chiado-pages.png`. Cinco testes de prontidão PASS; compilação OK.

**Limite da verificação:** o PDF foi materializado pelo Chromium a partir da janela que contém o HTML de impressão verdadeiro. O comando nativo `window.print()` não foi certificado end-to-end: no sandbox essa janela ficou com estilos externos sem `sheet` e imagens do logótipo pendentes. A paridade de paginação/primeiros blocos passou, mas isso não prova carregamento de todas as imagens nem aparência pixel-a-pixel do PDF. Corrigida espera por eventos de stylesheet já terminados e imagens copiadas passam a eager; o problema residual de carregamento na janela permanece explícito, não ocultado por timeout.

## Ficheiros desta continuação
- `src/components/psa-composer/canvas.tsx`
- `src/components/psa-composer/composer-shell.tsx`
- `src/components/psa-composer/paginated-preview.tsx`
- `src/components/psa-composer/composer-top-bar.tsx`
- `src/components/psa-composer/AGENTS.md`
- `src/lib/psa-proposal/pagination-ready.ts`
- `scripts/test-proposal-pagination-ready.test.ts`
- `roadmap.md`, este relatório e evidências em `docs/proposal-pagination-phase1/`.

A cópia foi descartada ao fechar o navegador; nunca existiu na base de dados. Não houve eliminação de dados reais. B1 não foi ativado; B2 não iniciado.