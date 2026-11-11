# PDF — cabeçalho e paridade final, 11/11/2026

## Resultado
**PASS no cenário Hotel Chiado testado:** 12 páginas A4 — Capa, Carta e dez páginas de Conteúdo — comparadas individualmente entre a vista paginada e o PDF real gerado por Download → PDF. O cabeçalho de Conteúdo já é pintado em todas as dez páginas. A publicação conjunta continua pendente da decisão separada de Luis sobre segurança; nenhuma política foi alterada.

## Causa e correção
Antes da alteração, o PDF tinha 12 páginas e texto de corpo correto, mas a região superior das páginas de Conteúdo estava vazia. Os nós do cabeçalho existiam no documento exportado, com posição e visibilidade aparentemente corretas: comparar apenas o DOM não detetava a falha.

Na fragmentação de impressão do Chromium, a caixa superior posicionada absolutamente não era pintada. O ajuste isolado que resolveu a falha foi manter `.pagedjs_margin-top-center` em posicionamento relativo no fluxo da grelha, compensando a margem esquerda de Paged.js. O ajuste é exclusivo do documento de impressão e das páginas com geometria master; não altera conteúdo, paginação, definições guardadas ou o ecrã.

Coordenadas relativas à página, ecrã vs impressão, em CSS px: cabeçalho (0, 0), logo (34,391; 30,234), contactos (551,047; 52,156), iguais antes de pintar. A alteração conserva estas coordenadas. Logo e contactos foram também confirmados nas imagens rasterizadas do PDF.

## Verificação página a página
| Folha | Tipo / número | Ecrã vs PDF | Cabeçalho / rodapé |
|---|---|---|---|
| 1 | Capa | PASS | Sem cabeçalho, rodapé ou contador |
| 2 | Carta | PASS | Papel timbrado; sem contador |
| 3 | Conteúdo 1/10 | PASS | Logo, contactos, rodapé e número |
| 4 | Conteúdo 2/10 | PASS | Logo, contactos, rodapé e número |
| 5 | Conteúdo 3/10 | PASS | Logo, contactos, rodapé e número |
| 6 | Conteúdo 4/10 | PASS | Logo, contactos, rodapé e número |
| 7 | Conteúdo 5/10 | PASS | Logo, contactos, rodapé e número |
| 8 | Conteúdo 6/10 | PASS | Logo, contactos, rodapé e número |
| 9 | Conteúdo 7/10 | PASS | Logo, contactos, rodapé e número |
| 10 | Conteúdo 8/10 | PASS | Logo, contactos, rodapé e número |
| 11 | Conteúdo 9/10 | PASS | Logo, contactos, rodapé e número |
| 12 | Conteúdo 10/10 | PASS | Logo, contactos, rodapé e número |

- Texto de cada folha igual ao documento exportado; 21 referências do índice verificadas contra as âncoras e a numeração de Conteúdo.
- PDF rasterizado página a página; diferenças de antialiasing/rasterização, sem perda de cabeçalho, conteúdo ou alteração da quebra de páginas. Diferença média por canal entre screenshot do documento exportado e PDF: 0,033–2,471 numa escala 0–255; não se afirma identidade binária de pixels.
- Teste de regressão lê o PDF efetivamente pintado com `pdftotext`, exigindo contactos em cada página de Conteúdo, não apenas a presença dos nós HTML. PASS numa segunda cópia descartável.
- Cinco testes de paginação passaram; sinal de compilação: `build OK` às 20:37:32 UTC; nenhum erro de página no teste.
- Em ambos os ciclos: cópia eliminada, zero cópias restantes pelo ID, proposta Hotel Chiado original e todos os seus blocos iguais antes/depois. B1 preview/recorded/effective false. Nenhuma alteração de dados reais, permissões ou políticas.

## Evidência
[Todas as páginas, ecrã à esquerda/PDF à direita](pdf-header-validation-2026-11-11/all-pages.png) · [Última folha no ecrã](pdf-header-validation-2026-11-11/screen-12.png) · [Última página PDF](pdf-header-validation-2026-11-11/pdf-12.png) · [Métricas por página](pdf-header-validation-2026-11-11/parity-results.json) · [Execução e limpeza](pdf-header-validation-2026-11-11/after.log) · [Regressão PDF pintado](pdf-header-validation-2026-11-11/result.log).

## Ficheiros alterados
- `src/components/psa-composer/composer-top-bar.tsx`: posicionamento de impressão do cabeçalho, mantendo a origem da página.
- `scripts/test-proposal-pdf-parity-e2e.py`: espera inicial e regressão do cabeçalho efetivamente pintado.
- `roadmap.md`, `docs/prepublish-validation-2026-11-11.md`, este relatório e a pasta de evidências acima.
- Sem migrações. `docs/DECISIONS.md` não mudou: nenhuma decisão de produto mudou.

## Publicação — tabela atualizada
| Item | Seguro publicar? | O que ainda bloqueia |
|---|---|---|
| Gantt — validação e dependências Projetos/CRM | Sim | Nenhum bloqueio nos testes reportados; [matriz](gantt-release-validation-report.md) e [painéis](prepublish-validation-2026-11-11.md). |
| PDF — Capa/Carta/Conteúdo, cabeçalho, numeração e índice | Sim, no cenário testado | Nenhum bloqueio de paridade nas 12 páginas Hotel Chiado. |
| Segurança — três regras de leitura | Não, pendente | Decisão de Luis, aplicação e validação das regras aprovadas; políticas atuais intactas. |
| Publicação conjunta | Não | Segurança pendente; PDF já não bloqueia. |

Este teste não certifica outros cenários anteriormente pendentes (carta longa/EN, criação pela interface, overrides ou carregamento da assinatura real); continuam descritos no [relatório de implementação](proposal-cover-letter-report.md). Não foi criada uma assinatura falsa.