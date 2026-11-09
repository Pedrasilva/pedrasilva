# Página-mestre das propostas

## Modelo de dados
- **Modelo do atelier:** um registo versionado de página-mestre, com leitura pelos editores autorizados de propostas e alterações apenas por administradores, verificadas no servidor.
- **Por proposta:** guardar o modelo aplicado e a sua versão nas definições de apresentação existentes, com uma substituição opcional própria. «Repor padrão do atelier» aplica explicitamente o padrão atual; alterar o padrão não modifica propostas existentes nem PDFs já emitidos. Novas propostas recebem o padrão atual.
- **Conteúdo do modelo:** A4; quatro margens; altura do cabeçalho/rodapé e respetiva visibilidade; logótipo (alinhamento, X/Y e largura); contactos (email/site, X/Y e largura); rodapé (morada à esquerda, «n / total» à direita e tamanho de letra). Medidas geométricas em mm; tamanho de letra em pt.
- **Primeira página opcional:** visibilidade própria do cabeçalho/rodapé e posição própria do logótipo; restantes valores herdados do modelo principal.

## Interface
- Botão **Página-mestre** na barra da proposta e no painel de estilo, abrindo um editor amplo: uma folha A4 a 100% de escala documental, com zoom de visualização sem alterar medidas, guias de margens e áreas de cabeçalho/rodapé.
- Separadores **Todas as páginas / Primeira página**; campos numéricos agrupados por margens, cabeçalho, logótipo, contactos e rodapé.
- Arrastar logótipo e contactos com encaixe nas guias; X/Y atualizam durante o movimento. O alinhamento define a referência horizontal e os campos mostram a posição efetiva em relação às bordas da folha, sem depender da margem do texto.
- Indicação **Padrão do atelier / Personalizado**, ação **Repor padrão do atelier** e gravação explícita das alterações. O mesmo editor em **Definições → Página-mestre das propostas**, com gravação do padrão reservada a administradores.
- Remover os controlos dispersos de margens/cabeçalho/rodapé; manter os controlos de tipografia do texto.

## Compatibilidade e implementação
- Um único resolvedor de geometria alimenta a folha-mestre, o editor e as caixas de margem do Paged.js; PDF continua a imprimir as folhas já concluídas no iframe isolado. Repaginação após 300 ms; guias e seleção nunca entram no PDF.
- Converter as definições antigas em memória, incluindo os atuais posicionamentos independentes de cabeçalho/rodapé, sem escrever em propostas reais. Guardar o novo formato apenas numa edição explícita; nada se desloca simplesmente por abrir uma proposta.
- Alterações de armazenamento aditivas, com permissões e ficheiros de migração idênticos nas duas pastas existentes. Preservar bloqueios, revisões, histórico, idioma e conteúdo das propostas; B1 intocado.

## Verificação e entrega
- Só numa cópia descartável do Hotel Chiado: guardar/reabrir modelo, arrastar com encaixe, alterar margens, verificar primeira página, reposição do padrão e autorização de administrador.
- Antes de editar a cópia: confirmar as 11 páginas e os primeiros blocos iguais entre ecrã/PDF; depois das alterações, confirmar nova paridade sem exigir 11 páginas quando as medidas mudarem a paginação.
- Capturas da página-mestre, Split, Pages e PDF; relatório dos ficheiros alterados e confirmação independente de conteúdo real preservado e cópia eliminada.

**Aguardar o OK de Luis antes de implementar.**
