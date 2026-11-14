# Rodapé editável da página-mestre

## Causa encontrada
O rodapé não tem seleção nem eventos de arrastar: estes existem apenas no logo e nos contactos do cabeçalho. O modelo guarda altura, texto e tamanho da letra, mas não posições dos elementos do rodapé. A apresentação paginada impõe ainda posições fixas de 14 mm nas laterais e 6 mm do fundo, anulando qualquer deslocação. Não é um bloqueio de permissões nem uma sobreposição a intercetar o rato.

## Correção proposta
- Tornar cabeçalho, rodapé e respetivos elementos selecionáveis, arrastáveis e redimensionáveis, com os mesmos controlos.
- Setas deslocam 1 pt; Shift + seta desloca 10 pt. Ajuste às margens e aos limites da coluna de texto.
- Painel do elemento selecionado: X/Y e largura em mm, alinhamento esquerda/centro/direita; rodapé com distância ao fundo. Preservar os valores antigos até edição explícita.
- Acrescentar opções independentes para ocultar rodapé na Capa e na Carta, sem alterar os restantes comportamentos da Carta.
- Usar as posições guardadas nos estilos comuns do editor, Páginas e PDF. A margem inferior do texto reserva automaticamente o espaço ocupado pelo rodapé, incluindo a folga de segurança.

## Verificação e preservação
- Testes pequenos para geometria, passos de teclado, encaixe, margem inferior e visibilidade por tipo de página.
- Exercitar seleção, arrasto, redimensionamento e gravação/reabertura numa cópia isolada; nunca gravar no Hotel Chiado nem criar documentos ligados à quote real.
- Renderizar o Hotel Chiado em leitura, usando alterações temporárias em memória, comparar Páginas e PDF das folhas concluídas e repor a posição original. Reportar separadamente qualquer limitação do botão PDF existente.
- Não alterar conteúdo, valores, fases, numeração ou ordem de blocos. B1 permanece OFF. Registar a decisão e entregar a causa, ficheiros alterados e resultados.

## Detalhes técnicos
Estender aditivamente o JSON da página-mestre, com resolução não mutável dos valores legados; centralizar geometria e ajustes num helper partilhado. Remover coordenadas fixas concorrentes da paginação e adaptar as posições também nas folhas horizontais. Reutilizar as gravações e permissões existentes, sem mudanças de segurança ou de dados comerciais.

<!-- Plano anterior conservado abaixo como contexto histórico; não integra esta aprovação. -->

# Numeração de leads, propostas e projetos (plano anterior)

## Aprovação pedida
Escolher **A ou B**, confirmar os casos de identidade abaixo e aprovar o mapa por registo antes de qualquer implementação ou alteração real. As regras de Luis estão registadas em **D53**. B1 confirmado **OFF, revisão 10**; investigação exclusivamente de leitura.

## O que existe hoje
- Leads não têm campo de número próprio; alguns nomes contêm códigos escritos manualmente.
- Quotes recebem número ao serem criadas, pelo contador anual, usando a data editorial da proposta. O formato atual é variável: 2601…2699, depois 26100…
- **Hotel Chiado 26103 = ano 26, posição 103**; **Oleiro 26117 = ano 26, posição 117**. O contador está em **129**; próximo atual **26130**. Testes, eliminações e antigas revisões consumiram posições: isto não equivale a 129 trabalhos reais.
- Projetos não têm um número comercial estruturado: usam nomes, ligações a quotes e identificadores externos. Conversão conserva o número no baseline, mas não estabelece uma identidade comercial única entre as três áreas.
- Novas revisões já reutilizam número e bloqueiam a raiz; as antigas Premium Fitness ainda têm 2661/2670/2671/2673. A impressão converte o ordinal interno em rev0/rev1…, a substituir por letras na apresentação futura, não nos PDFs antigos.

## Inventário completo e mapa
**31 leads + 41 quotes + 21 projetos + 35 documentos = 128 registos**, todos os estados, incluindo arquivados e testes. As ligações comprovadas agrupam 59 famílias; documentos não contam como trabalho novo.

- [Tabela integral: número atual, criação UTC, estado, opções A/B, ligações e ressalvas](../docs/numbering-investigation-2026-11-12.md).
- [CSV integral para rever linha a linha](../docs/numbering-inventory-2026-11-12.csv).

As datas apresentadas são criação/importação **no Hub**, não prova do ano original. Códigos antigos como 2502, 2028 ou 0410B não serão transformados em números de 2026 pela data de importação. Empates são ordenados pelo identificador estável apenas para tornar o mapa reproduzível; Luis pode corrigir a ordem histórica.

| Escolha | Regra do mapa | Primeiro a atribuir | Próximo após o mapa provisório |
|---|---|---|---|
| **A — sequência das pastas de Luis** | Reservar posições 001–018; manter números de quatro dígitos; atribuir 26019 em diante às famílias sem legado por criação disponível, remapeando os atuais números de cinco dígitos | **26019** | **26034** |
| **B — preservar contagem do Hub** | Manter todos os números existentes e o contador 129; preencher números em falta desde 26130, por criação disponível, sem compactar lacunas | **26130** | **26143** |

Estes próximos números são condicionais: casos pendentes e novas criações podem alterá-los. B preserva números atuais mesmo quando não seguem a ordem cronológica; A só reorganiza famílias sem legado — não renumera silenciosamente quatro dígitos.

### Exemplos das famílias sem legado
| Família / criação no Hub | A | B |
|---|---|---|
| Clinic Cascais / 05-05-2026 | 26019 | 26130 |
| DLMC Oral Surgery / 30-07-2026 | 26020 | 26131 |
| Cavid HÜSEYİN / 24-08-2026 | 26021 | 26132 |
| Bolshaya / 04-09-2026 | 26022 | 26133 |
| Sete leads de email / 07-10-2026, em ordem de criação | 26023–26029 | 26134–26140 |
| Greg Freemon — novo projeto / 18-10-2026 | 26030 | 26141 |
| Hotel Travessa do Oleiro — lead sem ligação / 18-10-2026 | 26031 | 26142 |
| Hotel Chiado — lead 18-10, quote 07-11 | 26032 | 26103 |
| Travessa do Oleiro — lead/quote 11-11 | 26033 | 26117 |

### Casos a resolver antes de aplicar
1. Confirmar se as **duas leads Oleiro** são o mesmo trabalho; não têm ligação entre si. Se forem, propor união de identidade preservando as duas linhas/histórias, não eliminação. O mapa recalcula-se antes da aprovação final.
2. Confirmar a lista real das pastas **P2601–P2618**, datas originais e códigos históricos em falta. O Hub não permite comprovar essa lista externa.
3. Escolher número canónico nas famílias com códigos diferentes: Mastercard **2609/2654**, Alcanena **2608/2662**, Alqueva **2616/2660**, CTT **2522/2655**, BCG **2521/2656**, Uralchem **2502/2657**, Tiago **2506/2658**, CTR **2028/2659**, Telheiras **0410B/2648**.
4. Premium Fitness: decidir número canónico (a indicação anterior **2616** continua pendente; Alqueva já o usa no nome) e confirmar correspondência das revisões históricas a A/B/C. Mint: confirmar se 2678/2680 são alternativas ou revisões. A tabela não inventa letras para quotes-raiz independentes.
5. Greg novo/histórico, projetos históricos sem código e documentos sem quote: identificar origem e ligações antes de lhes atribuir número. Nenhuma eliminação ou limpeza está autorizada neste pedido.

## Regras e experiência proposta
- Cada lead nova recebe **YYNNN** na criação: ano original + sequência anual de três dígitos. O número acompanha propostas e projeto, sem nova reserva na conversão. Projetos diretos recebem identidade do mesmo registo central, sem obrigar a criar uma lead operacional artificial.
- Pasta principal: **P26019 Nome**. Mudança de nome não muda a identidade. Mostrar número como campo separado nos cartões, listas, pesquisa, proposta, carta e projeto.
- Primeira proposta: **26019**; primeira revisão: **26019A**, depois B, C… Após Z, propor AA, AB…; ordinal interno continua numérico, apresentação deixa de usar rev1. Alternativas da mesma lead precisam de ordinal/revisão distintos, nunca duas propostas com referência igual.
- **Retomar / Reativar**, disponível numa lead perdida ou projeto parado/arquivado: mostrar número original, escolher ano da retoma, motivo e confirmar nova versão. Não cria novo trabalho, pasta principal, contrato, conversão ou horas automaticamente.
- Notação proposta, ainda por aprovar: **22014-26**, revisões **22014-26A/B**; pasta principal permanece **P22014 Nome**, com secção/subpasta **22014-26** para a retoma. Se houver duas retomas no mesmo ano, propor **22014-26-02**, revisões **22014-26-02A**. Topografia, documentos anteriores e histórico continuam na identidade original; planeamento novo só por ação explícita, sem alterar horas/custos/contratos antigos.
- Só administradores podem **editar número**, com confirmação de impacto, motivo e histórico antes/depois. A atribuição automática ao criar uma lead não exige administração. Reativação conserva permissões atuais de edição e é validada no servidor; não concede novos direitos.

## Implementação técnica — só após aprovação
1. Adicionar registo central de identidade de trabalho, contador anual e versões de retoma; ligar aditivamente leads/quotes/projetos por ID. Número canónico único no registo central; não impor unicidade do mesmo número nas três tabelas, pois a partilha é intencional. Conservar números anteriores como aliases reservados, com proveniência; não os reutilizar noutro trabalho.
2. Constraints únicas para número canónico/alias, `(work_id, version_key)` e `(work_id, version_key, revision_ordinal)`. Conflitos atuais ficam fora da aplicação até mapeamento aprovado; não forçar valores sobre dados ambíguos. Esquema com GRANT, RLS e REVOKE TRUNCATE em novas tabelas; roles permanecem em `public.user_roles`, sem alterações.
3. Atribuição e revisão em transações com bloqueio do contador/família e restrição única final. Ano obtido do momento de criação original, não de `data_proposta`; salvar data original comprovada separadamente da importação. Sequência 001–999; ao esgotar 999, bloquear e pedir decisão, sem truncar ou inventar quatro dígitos.
4. Guardas no servidor para todas as escritas, incluindo criação direta, criação a partir da lead, intake confirmado, imports, duplicação, revisão, backfill de projeto e conversão. Edição manual apenas por papel admin verificado no servidor; nenhuma autorização baseada em dados do navegador.
5. Migrações idênticas nas duas pastas acordadas; mapa aprovado com IDs e valores anteriores/novos, pré-visualização/hash e aplicação atómica com recusa de alterações concorrentes. Renumeração por ação administrativa auditada, não por abertura de página. Preservar PDFs enviados, snapshots, baselines e identificadores externos; documentos futuros usam a referência atual. Não renomear pastas externas sem pré-visualização e aprovação específica.
6. Atualizar apresentação e impressão em CRM, Projetos, composer/carta/cover, versões, pesquisa e exportações futuras; chaves EN/PT. Conteúdo literal, provas fiscais e documentos históricos não são reescritos.

## Validação após aprovação
- Testes unitários de 26001/26019, viragem de ano, letras A/B/Z/AA, legado e retoma.
- Testar apenas **quote copiada separada**, nunca documento/revisão ligado a quote real: criação da identidade, revisão, conversão numa cópia, retoma e leitura posterior na interface.
- Verificar criações/revisões concorrentes, número duplicado rejeitado, não-admin impedido de editar, ano original preservado, nenhum número novo na retoma/conversão e nenhum efeito em horas/custos/planeamento.
- Fixtures em identidade isolada de QA sem consumir contador comercial; auditar e remover só dados descartáveis criados para o teste, sem contornar proteções de histórico.
- Comparar dados reais antes/depois, verificar B1 OFF e emitir relatório da correspondência aplicada. Nenhum teste de escrita foi executado nesta investigação.

## Entrega desta fase
Alterados apenas documentos de investigação/planeamento, `docs/DECISIONS.md`, roadmap e memória das regras de Luis. Nenhuma alteração de aplicação, esquema, números ou dados reais. **Parar e aguardar Luis: escolha A/B, notação da retoma e aprovação do mapa após resolver os casos pendentes.**