# Controlos de formatação do índice

## O que será acrescentado
Grupo **Índice** na página-mestre e na tipografia da proposta, com os mesmos mecanismos de pré-visualização e gravação existentes:
- Níveis visíveis: 1, 1–2 ou 1–3.
- Por nível: avanço, fonte do corpo/título, tamanho, peso, caixa normal/versaletes/maiúsculas, preto/suave e intervalo entre entradas.
- Espaço entre número e texto, alinhamento das linhas quebradas sob o texto ou sob o número, entrelinha e espaço adicional antes do nível 1.
- Números de página visíveis/ocultos, alinhados à direita com algarismos tabulares, peso igual à entrada ou mais leve.
- Pontilhado, linha ou sem guia; espaço da guia.
- Título visível/oculto, texto de apresentação e espaço depois; largura máxima da coluna de texto em pt.

## Herança e padrão PSA
Configuração independente do índice: a proposta herda o modelo vivo até ativar **Substituir nesta proposta**; **Repor modelo** remove apenas a substituição do índice. Overrides de outros espaçamentos mantêm-se.

Padrão: três níveis; avanços 0/14/28 pt; fonte do corpo 10,5 pt; nível 1 negrito e 6 pt antes; níveis 2/3 regulares, nível 3 suave; 2 pt entre entradas; entrelinha 1,3; linhas quebradas sob o texto; guia pontilhada; páginas à direita/tabulares. Restantes valores iniciais: 6 pt entre número/texto, 4 pt de espaço da guia, título documental atual visível com 6 pt depois, coluna de texto até 300 pt.

Guardar explicitamente este padrão no modelo. Chiado e Oleiro herdam-no sem regravar as propostas quando não tiverem substituição própria. Texto personalizado do título é apenas apresentação; vazio conserva «Índice»/«Index» conforme a língua documental, sem alterar blocos.

## Verificação e preservação
- Testes de valores concretos do padrão, herança, substituição, reposição e limites de níveis.
- Verificar controlos e alterações ao vivo; mudanças experimentais apenas numa cópia isolada ou em memória, nunca em documentos ligados às quotes reais.
- Conferir Chiado e Oleiro em Páginas e PDF físico das mesmas folhas concluídas: hierarquia, quebras, guias, título e números; reportar contagens e limites do botão PDF nativo.
- Nenhuma mudança de conteúdos, ordem de blocos, fases, fees, pagamentos ou numeração; B1 OFF.

## Detalhes técnicos
Adicionar configuração aditiva ao JSON existente da página-mestre e às opções da proposta, resolver a herança num helper puro e emitir tokens partilhados. Reutilizar o painel e as gravações com revisão/guardas existentes. Renderização do índice usa a mesma configuração para selecionar níveis/título; CSS e paginação consomem os mesmos tokens, preservados na exportação. Não alterar permissões nem criar tabelas.

Registar a decisão e fornecer relatório dos ficheiros alterados e da verificação.