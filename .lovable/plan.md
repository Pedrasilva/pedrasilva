# Carta de apresentação e Master Carta

## Resultado proposto
Transformar o bloco Carta numa carta empresarial **A4 vertical, de uma página**, no idioma da proposta (PT-PT ou EN). Manter Capa, Conteúdo, numeração do conteúdo, Gantt, honorários e pagamentos inalterados. **Implementação só após o OK de Luis. B1 OFF.**

## Verificação atual — Oleiro, apenas leitura
- Proposta **26117**, Travessa do Oleiro; idioma PT-PT; sem contacto ligado à quote.
- CRM: GREATLUCK INVESTIMENTOS IMOBILIARIOS LDA; morada **Talaíde Park, Estrada Octávio Pato, n.º 177, Edif.A, A3**; localidade guardada **S.D.Rana**; código postal em falta. Não expandir a localidade nem escolher um contacto da empresa por iniciativa própria. Na maquete usa-se a grafia da empresa fornecida por Luis; na implementação, predefinir a grafia CRM e permitir edição apenas na carta.
- Honorários por fases + avença: **203 300 € + IVA**, conforme plano atual; não usar o valor antigo da calculadora (**151 956,275… €**) nem os anteriores 201 840 €.
- A carta atual conta apenas a fase raiz e mostra **1 fase / 43 semanas**, omitindo os 12 meses da avença no programa global. Corrigir a projeção da carta para fases efetivas, sem duplicar grupos, e abranger a avença; intervalo global atual equivale a cerca de **87 semanas**, com sobreposição entre concurso e assistência. Não somar durações sobrepostas nem prometer datas operacionais.
- O documento inclui apoio ao concurso, mas exclui preparação/lançamento do concurso de empreitadas. A carta distinguirá apoio de preparação/lançamento; não corrigirá nem reescreverá as exclusões reais.

## Maquete textual PT — uma página
Os elementos entre parênteses retos são campos editáveis em falta ou indicações de posição, não factos inventados.

````text
[LOGÓTIPO PSA]

                         GREATLUCK INVESTIMENTOS IMOBILIÁRIOS, LDA.
                         [Nome e cargo do contacto — por preencher]
                         Talaíde Park, Estrada Octávio Pato, n.º 177,
                         Edif.A, A3
                         [Código postal] S.D.Rana

Pedra Silva Arquitectos
Trav. Corpo Santo 10, 1.ºD
1200-131 Lisboa, Portugal

Lisboa, 12 de novembro de 2026

Assunto: Proposta de Honorários – Travessa do Oleiro, 26117

Exmos. Senhores,

Agradecemos a oportunidade de apresentar a nossa proposta de
honorários para a intervenção no conjunto edificado da Travessa
do Oleiro, n.º 11 a 15, em Lisboa, com vista à sua reconversão em
apartamentos turísticos.

O âmbito compreende Programa, Estudo Prévio, Anteprojeto e
submissão do PIP, Licenciamento e Projeto de Execução, bem como
apoio ao concurso de construção e assistência técnica à obra.

Os honorários totalizam 203 300 €, acrescidos de IVA à taxa de 23%.
O pagamento prevê 33 460 € na adjudicação, deduzidos das
prestações das fases, com o remanescente repartido entre início
e conclusão de cada fase, conforme o Anexo A. A assistência à
obra corresponde a 12 mensalidades de 3 000 €, acrescidas de IVA.

O programa global previsto abrange cerca de 87 semanas, incluindo
a assistência à obra, com sobreposição parcial entre esta e o
apoio ao concurso. A avença inicia-se no primeiro dia útil do mês
seguinte à conclusão do Projeto de Execução, conforme o programa
relativo apresentado na proposta.

A proposta assenta na informação e nos levantamentos identificados
no documento. Não inclui, entre outros, projetos de especialidades,
taxas de entidades, preparação e lançamento do concurso de
empreitadas, nem direção e fiscalização da obra, nos termos das
exclusões apresentadas.

Ficamos à disposição para esclarecer qualquer questão ou reunir
convosco para analisar a proposta.

Com os melhores cumprimentos,

[Imagem da assinatura, quando carregada]
Luís Pedra Silva
Arquiteto | Sócio-gerente
Pedra Silva Arquitectos

──────────────────────────────────────────────────────────────
[Morada e contactos PSA das definições — apenas no rodapé]
````

**Maquete editorial para aprovação, não texto já guardado.** A data é um campo editorial, independente das datas relativas do Gantt. Os montantes e a duração serão recalculados da cópia da proposta utilizada no teste; não serão congelados pelos valores desta maquete. O remetente surge no corpo conforme o pedido; o papel timbrado mantém os contactos apenas na linha de rodapé, nunca junto ao logótipo.

## Edição e geração
1. Campos separados no painel: destinatário (empresa, contacto/cargo, rua, código postal/cidade), remetente, local/data, assunto e saudação. Preenchimento inicial pelos dados ligados à quote/definições; edições guardadas apenas no bloco, nunca no CRM ou nas definições globais. Valores preenchidos não são substituídos silenciosamente por atualizações da origem.
2. Saudação de acordo com o tratamento explicitamente guardado no contacto: «Exmo. Senhor [apelido],» / «Exma. Senhora [apelido],» ou «Dear Mr/Ms [surname],». Sem contacto, «Exmos. Senhores,» / «Dear Sirs,». Não inferir género pelo nome; tratamento desconhecido fica editável.
3. Corpo no editor rico existente; «Gerar com IA» usa apenas âmbito, fases, honorários, regras de pagamento, programa e pressupostos/exclusões presentes na proposta. Mostrar os dados usados; valores não comprovados ficam por preencher. Não obter custos HR, taxas internas ou dados de outras propostas para a carta.
4. IA devolve só o corpo: agradecimento, resumo executivo e disponibilidade. Despedida/assinatura/cargo são elementos separados; Luis é sempre o signatário. Preservar modelo/serviço IA atual, sem mudança de modelo.
5. Antes de substituir corpo editado manualmente, pedir confirmação explícita. Gerar/regenerar não altera destinatário, remetente, data, assunto, saudação, assinatura ou cargo. Falhas deixam o texto existente intacto; impedir substituição se houver edição enquanto a geração decorre.

## Master Carta e uma página
- Layout Carta próprio em mm: logótipo superior esquerdo, zona superior generosa, destinatário no quadrante direito, remetente e corpo abaixo. Sem título «Carta», cabeçalho corrente, índice ou número de página.
- Reutilizar predefinição do atelier, snapshot por proposta e alterações/reset explícitos. Não aplicar o novo layout retroativamente às cartas existentes; disponibilizar a adoção explícita do novo formato e predefinir para novas cartas.
- Composição e PDF usam as mesmas páginas concluídas no iframe. A Carta permanece excluída dos contadores; Conteúdo começa em 1.
- Texto IA curto, com orçamento de altura que inclui remetente/destinatário/assinatura. Ajustar apenas espaços dentro de limites legíveis; nunca cortar, esconder, reescrever texto manual ou reduzir indefinidamente a letra. Se as edições excederem a folha, indicar excesso e impedir exportação/fecho de versão como carta válida até o utilizador encurtar o texto. Esta é a regra proposta para cumprir uma página sem perder texto.

## Detalhes técnicos — pontos de alteração previstos
- `src/lib/psa-proposal/letter.ts`: campos estruturados, modelos PT/EN, resolução CRM/definições, saudação, assinatura/cargo e projeção financeira/programa só da proposta.
- `src/lib/psa-proposal/letter.server.ts` e `letter.functions.ts`: manter autorização existente; contexto estritamente documental e validação de valores/tokens; sem escrita de Gantt/pagamentos.
- `src/components/psa-composer/letter-page.tsx`, `letter-controls.tsx`, `block-settings-panel.tsx`: composição, campos editáveis, corpo rico, confirmação e proteção de edições concorrentes.
- `master-page.ts`, `master-page-editor.tsx`, estilos/paginação Carta: geometria tipada e deteção de excesso; preservar layouts Cover/Content.
- Reutilizar `content_rich`/`style_settings` para snapshots compatíveis; sem nova tabela ou política prevista. Se for indispensável uma mudança de dados, apresentar o âmbito antes de executar; migrações idênticas nas duas pastas.
- Traduções dos controlos EN/PT em paridade; texto documental continua independente do idioma da interface. Registar a decisão estrutural aplicável em AGENTS na implementação.

## Validação após aprovação
- Criar primeiro uma **quote copiada separada**; copiar o documento para essa quote e verificar todas as ligações antes de qualquer escrita. Original, blocos, snapshots e ponteiro principal ficam intactos.
- Testar PT e EN: contactos completos/incompletos/ausentes, tratamentos, campos editados e recarregamento; valores, pagamentos e duração incluindo avença sem duplicação de grupos.
- Verificar geração IA real na cópia, cancelar/confirmar regeneração, erro e edição durante geração; nenhuma perda de texto/campos.
- Conferir Carta numa única página A4 vertical em Editar/Páginas/PDF, assinatura com/sem imagem, rodapé, caso longo, primeira página de Conteúdo numerada 1 e Capa/Conteúdo sem diferenças.
- Entregar capturas, descrição das páginas PDF, resultados e ficheiros efetivamente alterados. D51 já regista requisitos e espera; acrescentar relatório de execução só após implementação. Não apagar cópias antigas ou históricos pendentes sem autorização.