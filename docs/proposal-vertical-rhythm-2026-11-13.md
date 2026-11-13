# Ritmo vertical das propostas — D61

## Alterações
- `src/styles.css`: conjunto único `--psa-*` derivado da linha do corpo; parágrafos, títulos, listas, tabelas e notas sem folgas uniformes antigas. Células com filetes e números tabulares; margens internas de parágrafos anuladas.
- `src/lib/psa-proposal/document-rhythm.ts`: transformação de apresentação com parser HTML independente do navegador; remove vazios/quebras consecutivas, identifica introduções, títulos consecutivos, colunas numéricas, totais e notas imediatamente após tabelas. Não é sanitizador nem participa em gravações.
- `src/components/psa-composer/block-renderer.tsx`: normalização do HTML livre e dos termos na apresentação; ignora parágrafos de texto vazio.
- `src/components/psa-composer/paginated-preview.tsx`: aplica a mesma normalização à cópia paginada, incluindo conteúdo gerado. Exportação existente copia as páginas e os mesmos estilos completos.
- Dependências de parsing declaradas; regra técnica registada no AGENTS do módulo.

## Verificação
- Sessão autenticada, bloqueio de escritas e de RPCs não identificados como leituras; nenhuma gravação de proposta, revisão ou snapshot executada.
- Chiado: 35 páginas completas na pré-visualização e 35 no PDF físico A4; zero erros JavaScript. Não se compara a uma captura anterior de conteúdo idêntico, pois Luis continua a editar o documento.
- Corpo14px com linha21px (1,5); parágrafos10,5px (0,75em), intervalo entre itens4,2px (0,3em), padding vertical de célula4,2px, números à direita, total700, nota11,9px (85%). Cabeçalho repetido preservado.
- Imagens da tabela e lista inspecionadas; 11 testes existentes de títulos/prontidão de paginação aprovados; compilação OK.
- Não foram editados valores, textos guardados, numeração, planeamento ou outras propostas; B1 não alterado.