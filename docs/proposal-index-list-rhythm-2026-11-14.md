# Índice e ritmo de listas — 14 novembro 2026

## Alteração
- `src/styles.css`: offsets explícitos por data-toc-level (0/1,5/3em), quatro colunas para número/texto/pontilhado/página e quebra dentro da coluna de texto.
- Listas com marcadores exteriores; mesmo tamanho/entrelinha do corpo e margem entre itens ligada a `--psa-paragraph-gap`. Introduções com dois pontos mantêm também a margem normal.
- Causa da regressão: a regra de ritmo `li { margin: 0 !important }` sobrepôs-se ao `ml-8` do índice; níveis continuavam presentes nos dados.

## Verificação sem gravações
- Hotel Chiado autenticado, modo Pages: 38 folhas, índice hierárquico, Descrição do Projeto e Organização do Projeto e Fases inspecionados.
- Dados do documento atualmente mostram Descrição como secção2 e Organização/Fases como secção3; não renumerados.
- Corpo/listas14px, entrelinha21px, intervalo entre parágrafos/itens10,5px. Níveis1/2 a0/21px; sondagem visual temporária do nível3 confirmou42px. Alteração temporária do token para1,2 confirmou16,8px em ambos os intervalos, sem gravação.
- PDF físico38 páginas, gerado com as folhas completas e CSS exato do exportador. Botão Download→PDF permanece bloqueado em janela vazia: captura direta usada para validar a impressão, sem alterações ao exportador/guardas.
- 12 testes existentes aprovados (tipografia, níveis de títulos, parágrafos da carta); aplicação sem erros e compilação OK.
- Evidência temporária em `/tmp/browser/proposal-rhythm`: index.png, scope.png, stage_list.png, chiado.pdf e result.log.
- Não há uma contagem anterior comparável desta sessão;38 é a contagem final, não uma comparação com conteúdo histórico.

Nenhum texto, proposta, valor, fase, pagamento, número ou configuração persistida alterado. B1 não tocado/OFF.