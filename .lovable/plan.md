# Propostas — Capa, Carta e Conteúdo

## Modelo de dados
- Evoluir o modelo da página-mestre para três layouts independentes, em mm: **Capa**, **Carta** e **Conteúdo**. Reutilizar a predefinição do atelier e os overrides por proposta, com versão/revisão; interpretar o modelo antigo sem gravar nem alterar a aparência das propostas existentes.
- Acrescentar o tipo de bloco **Carta**, com texto rico e tokens preservados no texto, resolvidos a partir da proposta: cliente, saudação do contacto, projeto, honorários totais, número de fases, duração estimada, número e data editorial. Valores ausentes ficam explicitamente por preencher, nunca são inventados. A duração continua relativa; a data da carta não cria datas operacionais.
- Guardar em Definições modelos de carta PT-PT/EN e o signatário configurável, inicialmente Luis, com nome e referência à imagem da assinatura. Upload administrativo protegido no servidor; imagem privada carregada uma vez. Propostas novas recebem uma cópia das predefinições; alterações posteriores nas Definições não reescrevem documentos existentes. A assinatura apresentada é uma imagem editorial, não uma assinatura DocuSign nem um envio.

## Interface
- No editor da página-mestre, seletor **Capa / Carta / Conteúdo**, com os mesmos controlos de posição, dimensões e pré-visualização.
- **Capa:** página inteira, imagem opcional do projeto/cliente, título, cliente, número e data; sem cabeçalho ou rodapé.
- **Carta:** logo, morada PSA, data, nome/morada do cliente, saudação, texto e assinatura/nome de Luis; sem número de página. Inserção explícita após a capa, sem acrescentar blocos a propostas existentes automaticamente.
- **Conteúdo:** preservar a página-mestre atual. Numeração começa em **1** na primeira página de conteúdo; o total e as referências do índice contam apenas páginas de conteúdo. Se a carta ocupar mais de uma página, as suas páginas continuam sem numeração e excluídas do total.
- No bloco Carta: editor rico, inserção de tokens, valores utilizados e botão **Rascunho com IA**. Gerar na língua da proposta, não na língua da interface. Confirmar antes de substituir texto já editado; não enviar nada.

## IA e impressão — detalhes técnicos
- Função autenticada com acesso à proposta, chamada explícita pelo utilizador; apenas os dados autorizados dessa proposta seguem para a IA, sem salários, outros projetos ou imagem da assinatura.
- Reutilizar uma única projeção dos valores já apresentados pelo Composer. Gerar texto curto no tom PSA e validar as referências numéricas contra essa projeção; recusar números sem origem. Mostrar os valores efetivamente enviados. Serviço Lovable AI com o modelo predefinido, resposta em streaming e erros explícitos; sem geração em segundo plano.
- Manter Paged.js no iframe e exportar exatamente as páginas concluídas, com layouts identificados por tipo. Um único mapa de páginas de conteúdo alimenta rodapés e índice, sem subtrair cegamente duas páginas.
- Alterações de estrutura apenas aditivas, com proteção de acesso e migrações espelhadas; nenhuma alteração de permissões existentes ou de B1.

## Validação e entrega
- Testar numa cópia descartável de Hotel Chiado: três layouts, carta com tokens, texto longo, imagem/assinatura, numeração e índice, PT/EN, confirmação antes de substituição, negação de upload a não-admin e paridade ecrã/PDF por página.
- Verificar que a proposta original permanece idêntica, eliminar a cópia e confirmar B1 OFF. Não testar uploads/predefinições reais do atelier: usar configurações isoladas descartáveis.
- Após aprovação, acrescentar estas decisões a `docs/DECISIONS.md`, mantendo D14–D17 e assinalando apenas o âmbito substituído do modelo de primeira página. Entregar relatório com capturas, resultados e ficheiros alterados.

**Aguardar o OK de Luis antes de implementar.**