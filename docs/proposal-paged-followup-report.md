# Hotel Chiado — seguimento da vista paginada

Verificado em 8 de novembro de 2026, 23:40 UTC.

## Resultado
- **11 páginas no ecrã = 11 páginas físicas no PDF; primeiro bloco igual nas 11 páginas.** Depois da correção e antes da eliminação, a proposta tinha 12 páginas; a cópia do estado atual, após a eliminação autorizada, tem 11. Não foi forçada qualquer contagem.
- O rodapé estava ligado: `style_settings` só continha `marginLeft:25`; ausência de `showFooter` significa ligado. Não alterei o toggle real.
- Causa: o contrato A4 existia só numa página CSS nomeada; fragmentos sem essa atribuição usavam a geometria Letter de Paged.js (816×1056 px). O rodapé ficava abaixo da folha. A4 também como página por defeito resolve isso: 793,69×1122,52 px.
- Cabeçalho a 8 mm do topo e rodapé a 6 mm do fundo, nas 11 folhas. Morada à esquerda e “n / 11” à direita. PDF descarregado pela opção PDF da aplicação, com morada confirmada nas 11 páginas físicas. Toggle desligado verificado apenas na cópia: sem morada nem número.
- Índice inteiro na página 2; já não se divide entre páginas 1–2.
- Marcadores de listas dentro da coluna: gutter verificado nas listas geradas e de texto. Folhas exportadas são exatamente as completadas no iframe; sem segunda paginação.
- “Heading level” no topo para todos os tipos, incluindo Stage, com H1/H2/H3/sem título. H1 continua o default dos blocos existentes.
- Duplicate/Delete no topo; Delete também acessível no fim. Confirmação dentro da aplicação, sem diálogo nativo. Scroll chegou a 1796/1796 px num Stage; cancelar a confirmação verificado.

## Alteração real estritamente autorizada
Foi eliminado só o bloco `7d2e3a62-da65-4aaa-889a-5b6a6f8749c6`, cópia Estudo Prévio, sort_order 90. O original `2d9b0662-984c-41a7-b518-97baea89035b` permanece.
A transação comparou todos os outros blocos da aplicação, coluna por coluna em JSON, antes/depois: nenhum alterado. Leitura independente confirma cópia ausente (0) e original presente (1). Não foram renumerados/reordenados os blocos guardados nem alteradas fases, horas, propostas comerciais ou B1.
**Diferença entre a indicação verbal e os dados existentes:** antes da eliminação, o índice atual mostrava Programa em 4, Estudo Prévio original em 5, Licenciamento em 6 e cópia Estudo Prévio em 7. Não mostrava Programa em 6. Foi eliminado o ID inequívoco da única cópia Estudo Prévio em 7, preservando Programa e o original.

## Demonstração 3.1–3.5 — só na cópia
Os cinco Stage foram configurados H2 e colocados imediatamente após a secção 3 apenas na cópia temporária: 3.1 Programa, 3.2 Estudo Prévio, 3.3 Licenciamento, 3.4 Projecto de Execução, 3.5 Assistência Técnica. Índice indentado e títulos verificados; 11 páginas no ecrã/PDF também nesta variante.
A proposta real mantém níveis e ordem anteriores: existe um Cronograma intercalado antes de Projecto de Execução, que, mantendo H1, inicia outra secção. Para cinco subseções contíguas, esse bloco não pode interromper a hierarquia como H1. Não fiz essa alteração editorial na proposta real.

## Primeiro bloco de cada página — cópia atual
“Continuação” significa que a página começa num fragmento do mesmo bloco; foi comparado o ID do bloco e o texto de abertura, não apenas o título.

| Página | Ecrã: tipo / início do primeiro bloco | PDF | ID temporário (igual em ambos) |
|---|---|---|---|
| 1 | cover — Proposta de Honorários Hotel Chiado Proposta 26103 · 07/11/2026 | Igual | `d4dc54e8-3e16-4da8-bbc9-a2b17b41c7aa` |
| 2 | index — Índice | Igual | `9964c3ca-c966-4bf3-84d5-b964f6ee8ccf` |
| 3 | scope — Em cada fase, a PSA só poderá desenvolver o seu trabalho após a recepção dos elementos necessários por parte do RG. Caso estes elementos não sejam recebidos nos | Igual | `3a8b8458-1dc4-4b1a-8dc9-9800d6267905` |
| 4 | stage_item — Âmbito e entregáveis | Igual | `dd65bb9a-3ad3-4840-bfa7-dbfd4e204e74` |
| 5 | stage_item — Âmbito e entregáveis | Igual | `d879fef8-63ca-4d58-8a47-7ba4c54d347a` |
| 6 | stage_item — Actividades Principais | Igual | `4670c8a9-57d3-40e0-b717-5486b8b1a6aa` |
| 7 | stage_item — 8. Assistência Técnica | Igual | `6a11f58a-fb3b-42e1-a906-2bed85afa131` |
| 8 | timeline — 10. Cronograma | Igual | `0c09788f-67f5-4001-8bb8-0f8229999a68` |
| 9 | payment_terms — O período de aprovação de cada fase é de 5 dias úteis após a entrega. Na ausência de resposta do Cliente findo este prazo, a fase considera-se aprovada por amba | Igual | `7cdf5de0-c636-40bc-89af-73a7a13dade4` |
| 10 | billable_hourly_rate — Sócio 239 € Diretor 200 € Arquiteto Sénior 180 € Arquiteto 130 € Lead Designer 92 € Arquiteto Júnior 70 € | Igual | `46b8b8dc-ac1c-4860-bc96-e5400d906997` |
| 11 | acceptance — Validade e Aceitação | Igual | `999f2426-da2f-4fd7-ad40-3b65b905a62d` |

## Capturas
- [Página 1, cabeçalho e rodapé](proposal-paged-followup/page-1.png)
- [Página 2, índice inteiro, cabeçalho e rodapé](proposal-paged-followup/page-2.png)
- [Última página, cabeçalho e rodapé](proposal-paged-followup/page-11.png)
- [Painel Stage com Heading level e Duplicate/Delete](proposal-paged-followup/settings-heading.png)
- [Índice 3.1–3.5 na cópia](proposal-paged-followup/nested-index.png)
- [Resultados completos e matriz ecrã/PDF](proposal-paged-followup/results.json)

## Validação e limites
15 testes unitários PASS; auditoria de tradução: 0 novos candidatos; compilação OK; navegador sem erros. Cópia exclusivamente em memória do navegador, com IDs substituídos e todas as escritas de documentos bloqueadas/ecoadas localmente; dados reais relidos e iguais ao estado pós-eliminação. Contexto descartado, nenhuma cópia persistente a limpar.
PDF Chromium gerado pelo fluxo da aplicação e verificado; impressão física no computador de Luis não foi realizada. Nenhuma mudança B1.

## Ficheiros alterados
- `src/components/psa-composer/paginated-preview.tsx`
- `src/components/psa-composer/block-renderer.tsx`
- `src/components/psa-composer/block-settings-panel.tsx`
- `src/components/psa-composer/composer-shell.tsx`
- `src/components/psa-composer/AGENTS.md`
- `src/styles.css`
- `scripts/test-heading-levels.test.ts`
- `scripts/test-composer-paged-followup.py`
- `supabase/migrations/20261108233400_hotel_chiado_exact_duplicate_block.sql`
- `drizzle/migrations/0269_hotel_chiado_exact_duplicate_block.sql`
- `roadmap.md`
- `docs/proposal-paged-followup-report.md`
- `docs/proposal-paged-followup/* (capturas e resultados)`
