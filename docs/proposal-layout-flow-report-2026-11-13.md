# Paginação partilhada das propostas — 13/11/2026

## Resultado e contagens
| Documento | Antes (leitura atual) | Depois (mesmo conteúdo capturado) | PDF pintado |
|---|---:|---:|---:|
| Hotel Chiado | 36 | 36 | 36 |
| Travessa do Oleiro | 37 | 37 | 37 |
| Hotel Alqueva | 32 | 32 | 32 |

Estas contagens incluem Capa/Carta quando existentes. O PDF de referência de 18:43 com 38 páginas não foi disponibilizado como ficheiro nesta tarefa; não se presume que o conteúdo seja idêntico à proposta atual. Chiado está a ser editado por Luis: a comparação final reutilizou exclusivamente o HTML capturado antes, no navegador, sem guardar esse conteúdo. Texto, valores e ordem desse conteúdo não foram alterados.

## Alterações gráficas
- Conteúdo em fluxo normal pelo topo; ignoradas apenas na apresentação as antigas opções de alinhamento vertical/flex de páginas de conteúdo. Capa/Carta mantêm composição própria.
- Títulos conservam ligação ao conteúdo seguinte; frases imediatamente anteriores a listas são marcadas apenas na cópia de paginação. Órfãs/viúvas: duas linhas. Listas/blocos longos podem dividir-se; linhas de tabela são unidades e cabeçalhos repetem-se.
- Removida a ligação automática entre blocos inteiros que podia encadear secções longas. Quebras explícitas existentes mantidas.
- Limites de títulos/pseudoelementos coincidem com a coluna, sem margens laterais negativas.
- Língua documental pt-PT/en propagada da proposta para páginas e janela PDF. Hifenização automática, última linha alinhada ao início e espaços normais. Hifenização portuguesa confirmada no PDF pintado.
- Índice com coluna numérica fixa, título flexível e página alinhada à direita. Títulos dos capítulos 1–24/1–21 alinham-se independentemente do número de dígitos; subsecções mantêm recuo próprio.

## Ficheiros de apresentação alterados
- src/styles.css
- src/components/psa-composer/canvas.tsx
- src/components/psa-composer/paginated-preview.tsx
- src/components/psa-composer/composer-top-bar.tsx

## Verificação / limites
Sessão autenticada; três propostas renderizadas em Páginas, Preview e Download PDF. Exportação contém exatamente as mesmas páginas e texto do conjunto concluído em Páginas; número real de páginas confirmado por pdfinfo. Imagens de páginas/PDF inspecionadas. Chiado: início de Porquê passou de 279 px para 0 px; continuação da Descrição passou de 453 px para cerca de 2 px abaixo do topo da área. Cabeçalhos/pés pintados. 11 testes existentes de níveis/paginação passaram; compilação sem erros.

Nenhuma operação de escrita foi autorizada para propostas: o navegador bloqueou duas tentativas automáticas preexistentes de criar snapshots, sem as executar. Não foram clicados campos de edição/guardar, nem executadas alterações à base de dados ou migrações. Fees, pagamentos, planeamento, números, textos, ordem e B1 não foram alterados por esta tarefa. Edições simultâneas de Luis não foram revertidas.

Avisos de rede 400 preexistentes continuam fora do âmbito; nenhuma exceção de paginação ou erro JavaScript foi observado na execução final. Regras tipográficas são prevenção, não garantia matemática para toda a combinação futura de conteúdo; quebras manuais existentes e páginas de Carta/aceitação/anexos conservam espaços intencionais.
