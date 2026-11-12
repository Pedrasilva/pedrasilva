# Termos Gerais e Gantts — 12/11/2026

## Entregue
- Padrão PT copiado literalmente do HTML aprovado por Luis: 39 723 caracteres, igualdade exata verificada; 20 artigos H3, 117 elementos strong, sem reescrever legislação ou texto.
- Inglês mantém texto anterior e recebe integralmente 11.6 Site Signage depois de 11.5, com título/número em negrito.
- O renderizador comum seleciona o padrão pelo idioma quando não existe conteúdo editorial: novos documentos e blocos de templates usam o mesmo padrão. Conteúdo personalizado guardado num template continua a prevalecer; não foi substituído nem retroativamente migrado.
- Gantts de Projeto, Obra, parcial e Anexo B usam modelo WBS não-mutável; uma página A4 landscape nomeada por gráfico, sem cópia rodada. Fontes de tabela 9 pt; rótulos mínimos 8 pt. Meses no eixo; programas extensos espaçam apenas rótulos, não removem meses ou fases. Acima de 22 linhas, separar Projeto/Obra e depois continuar em folhas adicionais sem eliminar fases.
- PDF exporta páginas concluídas com dimensão real de cada folha (297 × 210 mm horizontal ou 210 × 297 mm vertical). Master adaptado: logo mantém alinhamento e contacto vai para a margem direita da folha horizontal.

## Diagnóstico
Antes: Projeto fragmentado entre título e gráfico; Obra partilhava folha com outras secções; Anexo B aparecia em três páginas com dois gráficos rodados iguais. O anexo combinava cópias horizontal/rodada, alturas A3 e alinhamentos herdados num documento A4. Regras CSS agregadas do Paged.js também não mantinham sempre a página nomeada. Corrigida preparação da árvore imprimível, página nomeada e dimensões próprias antes de fragmentar.

## Testes e descrição das capturas
Cópia descartável de Oleiro validada em PT e depois como proposta EN; original e blocos comparados no fim, intactos; cópia eliminada; B1 preview/recorded/effective todos false.

| Verificação | Resultado |
|---|---|
| PT padrão igual ao bloco aprovado | PASS |
| 11.6 PT/EN presentes nas páginas e PDFs efetivos | PASS |
| 3 Gantts, cada um só numa folha horizontal PT/EN | PASS |
| Projeto 6 linhas, Obra 4, Anexo B 10; todas presentes no PDF | PASS |
| PT 35 páginas / EN 34; PDF com mesma contagem e texto de cada página | PASS |
| PDF misto: precisamente 3 folhas horizontais 842 × 595 pt em cada idioma | PASS |
| Dimensão real das fontes mínima ~7,995 pt (8 pt com arredondamento Chromium), sem shrink-to-fit | PASS |
| Divisão de 29 linhas em 22/2 de projeto + 5 de obra, sem perda | PASS — unitário |
| Programa relativo editorial e independência de datas | PASS — 3 testes existentes |
| Testes unitários | 5 PASS |
| Auditoria i18n | 0 novos candidatos |
| Compilação | PASS |

Capturas: folha horizontal com logo PSA no canto superior esquerdo, contactos no direito, título e intervalo por semanas, tabela WBS/duração à esquerda e eixo mensal com barras à direita; rodapé/endereço e paginação nas margens inferiores. Projeto, Obra e Anexo B não apresentam título separado, sobreposição ou duplicação. Na captura EN, rótulos Stage/Duration/Month seguem o inglês, nomes guardados das fases permanecem intactos.

## Limites
- Não testada em navegador uma proposta artificial com centenas de fases/nome excepcionalmente longo; regra de divisão coberta por teste unitário. Textos/introduções dos antigos Gantts não são migrados: o gráfico comum mostra título, identificação do anexo e intervalo.
- EN foi testado numa cópia de Oleiro com idioma inglês e padrão inglês, não numa proposta real inglesa.
- Não foi necessário fallback rodado: Paged.js e Chromium suportam folhas horizontais nesta validação.
- Sem SQL/migrações, alterações de políticas, dados reais ou publicação.

## Ficheiros
- `src/lib/psa-proposal/general-terms-content.ts`
- `src/lib/psa-proposal/document-gantt.ts` (novo)
- `src/lib/psa-proposal/paged-frame.ts`
- `src/components/psa-composer/document-gantt.tsx` (novo)
- `src/components/psa-composer/document-gantt.css` (novo)
- `src/components/psa-composer/block-renderer.tsx`
- `src/components/psa-composer/paginated-preview.tsx`
- `src/components/psa-composer/composer-top-bar.tsx`
- `src/components/psa-composer/composer-shell.tsx`
- `src/components/psa-composer/AGENTS.md`
- `scripts/test-document-gantt.test.ts` (novo)
- `scripts/test-proposal-terms-gantt-e2e.py` (novo; saídas em /tmp/browser)
- `docs/DECISIONS.md` (D45), `roadmap.md`, este relatório.
