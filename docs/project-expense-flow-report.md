# Despesas de projeto e reembolsos — estado da implementação

Atualização: 2 novembro 2026. **Implementação ampliada e parcialmente validada; o plano completo ainda não está validado.**

## Implementado
- Formulário partilhado em Projetos e Entrada de Finanças, com moeda original/EUR, comprovativo cambial, pagador, refaturação ao custo/acréscimo e tratamento fiscal predefinido «Por confirmar».
- A faturar aos clientes e A reembolsar à equipa em `/finance/project-expenses`, agrupamento por projeto/pessoa, aprovação e lotes.
- Afetações a linhas de fatura e pagamentos existentes, liquidação de lotes pelo painel de conciliação, anulações com motivo e auditoria.
- Salvaguardas para pagamentos pessoais, períodos fechados, limites de afetação, alteração de faturas afetadas e leitura de dados do novo fluxo.
- Totais de Insights, Finance e consumo de orçamento adaptados ao novo fluxo; documentos de compra associados não adicionam um segundo custo em Finance.

## Migrações
0193–0202 em `drizzle/migrations`, espelhadas byte a byte em `supabase/migrations` (20261102162000–20261102170500).
0198/0200 e os privilégios temporários de 0199/0201–0202 serviram exclusivamente à execução de testes descartáveis pelo ambiente de desenvolvimento; todas as permissões temporárias foram revogadas.
Nenhum backfill, vínculo histórico presumido, alteração de saldos iniciais, duplicados Bernardo ou contas de liquidação.

## Verificado
- 33 testes existentes de totais financeiros aprovados.
- Testes i18n aprovados: 9 testes do tradutor, paridade EN/PT e zero candidatos UI.
- Fixture de base de dados dentro de transação anulada: predefinição fiscal, ausência de obrigação antes da aprovação, aprovação, lote por pessoa, candidato único, liquidação e recusa de segundo pagamento. Formulário/listas abriram na sessão autenticada sem erros de página.
- Zero despesas version-2 persistentes após testes.
- Hash dos campos históricos de todas as despesas antes/depois: `8ad815d38361ee7f693c69daea004115`, idêntico.
- Sem mudança dos totais históricos: antes → depois idênticos; nenhum novo custo persistente.
- Última compilação: OK.
- Capturas PT: [formulário](project-expense-flow/form-pt.png), [clientes](project-expense-flow/clients-pt.png), [equipa](project-expense-flow/team-pt.png).

## Projetos ativos sem responsável de equipa com conta capaz de aprovar
Consulta apenas de leitura; atribuições não alteradas:
- 0410B Telheiras Obra
- 0434 Sérgio Varanda
- 2101 Colares
- 2128 Sandycove Road Dental Clinic
- 2502 Uralchem IV
- 2521 Escritórios BCG
- 2522 Escritórios Banco CTT - Atrium 2
- 2608 Alcanena
- Bolshaya

## Ainda não concluído/verificado
Esta entrega não deve ser considerada o plano completo validado.
- Falta testar ponta a ponta OCR → registo → confirmação, afetação de fatura/IVA e recebimento, correspondência de compra com taxa efetiva do cartão, permissões de colaborador/responsável e cenários concorrentes.
- Falta captura PT de um lote preenchido e verificação do fluxo de projeto com uma fixture persistida e eliminada após leitura no ecrã; capturas atuais mostram listas vazias.
- O painel antigo de despesas ainda conserva código de leitura legado; o novo botão/arrastar abre o formulário comum, mas é necessário concluir a remoção das vias de criação legadas restantes sem alterar histórico.
- A correspondência de compra precisa de integração integral no painel único; a função existe, mas os pagamentos normais do painel ainda não encaminham automaticamente esse caso específico.
- Falta integração orientada na criação de novas linhas pelo editor de faturas; atualmente a lista liga linhas existentes.
- Falta verificar a propagação de avisos/formatadores em todos os relatórios e rever cálculos de IVA/recebimentos proporcionais do novo fluxo.

As regras de negócio que estas verificações podem afetar devem ser finalizadas antes de registar despesas reais.

## Atualização desta entrega — implementado e observado
- O painel único e a confirmação de Entrada encaminham compras associadas a despesas para `pe_match_purchase`, em vez de criar um pagamento normal separado. A função exige o débito EUR integral, conta/cartão correto, período aberto e ausência de pagamentos/afetações anteriores; repetição exata é idempotente.
- Teste real de OCR numa imagem criada exclusivamente para teste: leu GBP 100 e o número FIXTURE-OCR-92010. Formulário comum → registo → confirmação da mesma fila → botão Conciliar no painel → um pagamento de **118,20 EUR**, custo **118,20 EUR**, original **100 GBP** e fonte `bank_actual`, sem segundo movimento. O extrato da fixture chegou antes do recibo.
- Foi necessário encaminhar comprovativos de despesas para `purchases` durante a confirmação. A extração bruta permanece preservada; na correspondência cambial as linhas/documento de compra são valorizados em EUR para não misturar GBP com pagamentos EUR.
- Seleção de despesas em A faturar aos clientes abre o editor normal com linhas calculadas no servidor. Criada e relida no browser uma fatura fixture: custo 120 EUR, acréscimo 20%, líquido 144 EUR, IVA confirmado 23% = 33,12 EUR, total 177,12 EUR. Tratamento pendente impede criar linhas.
- Novo `pe_save_intake` serializa a fila e a chave/hash do recibo numa transação: as duas entradas usam a mesma despesa. Correspondência de duplicados existentes não adapta dados históricos.
- Removido o criador legado que fazia OCR HR + inserção direta; upsert sem ID é recusado e novas inserções v1 são bloqueadas. O diálogo antigo é agora leitura de histórico. Arrastar uma imagem entrega-a ao formulário comum.
- Acrescentadas parcelas de crédito e valores recebidos líquidos de IVA; as afetações de recebimentos verificam períodos bancários fechados. Crédito parcial reabre apenas a parcela afetada, com recusa quando recebimentos excedem a parcela restante.
- Finance evita estimativa proporcional e dupla contagem nas linhas do novo fluxo; custos em falta mostram — e aviso. Leitores de despesas no dashboard e relatórios de fornecedores usam EUR v2. Relatório IVA continua a ler somente documentos fiscais, nunca somando IVA de despesas outra vez.

## Migrações adicionais
0203–0212, espelhadas byte a byte em `supabase/migrations` (20261102173000–20261102181500): conclusão/parcelas de crédito; claim de intake; acesso temporário de validação; auxiliar de teste fixo; correção de alias; encaminhamento de recibo; valorização EUR; limpeza limitada ao UUID/nome da fixture; revogação final.
Todos os privilégios temporários de funções e UPDATE foram revogados; os auxiliares de teste/limpeza foram substituídos por funções que apenas recusam execução. Consulta final: **zero** acessos sandbox aos RPCs/auxiliares temporariamente concedidos.

## Resultados por cenário
| Cenário | Resultado / limite |
|---|---|
| OCR → registo → confirmação | Passou com JPEG fixture e motor Finance real; confirmação executada pelo RPC autenticado, não pelo botão final da Entrada |
| GBP + comprovativo cambial + EUR efetivo cartão | Passou: 100 GBP → estimativa 120 EUR → débito 118,20 EUR; 1 pagamento, 1 custo |
| Extrato primeiro | Passou no painel real com movimento criado antes do recibo |
| Recibo primeiro | Mesmo encaminhamento implementado, mas ordem inversa não repetida end-to-end |
| Pessoal / empresa | Ambos guardados e relidos em fixtures; pessoal só originou obrigação após aprovação |
| Aprovação / rejeição / reaprovacão | Passou no teste transacional; aprovação direta de Luis também no browser |
| Lote por pessoa entre projetos | Passou na transação: 120 + 30 = 150 EUR |
| Pagamento parcial / anulação | Passou na transação: 75 EUR liquidado e saldo do movimento restaurado para 75 EUR ao anular |
| Fatura / acréscimo / IVA | Passou por transação e editor real: 120 → 144 + 33,12 EUR |
| Recebimento explícito parcial | Passou: 88,56 EUR bruto → 72 EUR líquido; duplicação recusada |
| Crédito parcial | Passou por RPC transacional: 30 EUR de custo creditado, só parcela correspondente reaberta |
| Permissões colaborador / responsável / Luis / Finance | Luis autenticado passou; matriz completa com contas distintas **não executada** |
| Submissões concorrentes dos dois pontos | Repetição da chave passou; verdadeira corrida de dois pedidos **não executada** |
| Período fechado | Guardas implementadas; cenário completo com período fixture fechado **não executado** |
| Avisos em todos os relatórios | Finance e leitores de custo corrigidos; revisão visual integral de todos os relatórios **não executada** |

20 testes unitários financeiros novos/existentes + 33 testes rollups passaram. i18n: testes passaram, paridade de 13 namespaces e 0 candidatos UI. Teste transacional completo em 0207 emitiu PASS e depois `PE_FIXTURE_ROLLBACK_SUCCESS` obrigatório: todos os dados anulados. Compilação mais recente: OK.

## Preservação e limpeza
Hash histórico, mesmas colunas (nova coluna intake_key omitida para comparação): **d1b61923408bcafd7f887a5becab48d4 → d1b61923408bcafd7f887a5becab48d4**.
Hashes completos de projetos, contas e movimentos bancários antes/depois idênticos:
- Projetos: a85b94ec71662610f0a885851eb40eab
- Contas: 0f23e7651031d8ead40cbcd5ac2b12fd
- Movimentos: 78b5ed20420ee1f6044ad0189ffc7029

Custos de despesas por projeto antes → depois:
- 30f1e184…: 117 000,00 → 117 000,00 EUR
- 32810ca9…: 22 344,00 → 22 344,00 EUR
- 936b3ca5…: 18 665,50 → 18 665,50 EUR
- a07f12ad…: 1 089,37 → 1 089,37 EUR
Estas são somas dos registos de despesas, não uma captura de cada indicador de todos os projetos. Os inputs históricos foram preservados.

Zero despesas v2 persistentes depois da limpeza. Eliminados o projeto, cliente, pagador, cartões/conta/movimento, despesas, fila, documentos/linhas, lote e afetações criados neste turno. Um JPEG fixture removido do armazenamento. Nenhuma escrita em Mastercard ou outros projetos reais; propostas Bernardo, liquidação e saldos iniciais e responsáveis de projeto não alterados.

## Capturas PT com dados antes da limpeza
- [Formulário preenchido](project-expense-flow/form-filled-pt.png)
- [Lote preenchido](project-expense-flow/batch-filled-pt.png)
- [A faturar com itens](project-expense-flow/clients-filled-pt.png)
- [Editor de fatura a partir de despesas](project-expense-flow/invoice-filled-pt.png): mostra valores antes de confirmar; a confirmação e leitura posterior passaram, mas não foi guardada uma captura do documento já emitido.

## Ainda não concluído/verificado — lista atual substitui a anterior
- Matriz de permissões com contas de colaborador, responsável e Finance distintas; concorrência simultânea; teste com período fechado; ordem recibo-primeiro end-to-end.
- Crédito parcial: RPC verificado, mas falta controlo no editor para escolher o montante parcial da parcela (o seletor atual preenche o montante completo).
- Guardar/editar posteriormente rascunhos de faturas com linhas afetadas ainda precisa de integração: as linhas protegidas não podem ser apagadas/recriadas pelo editor legado. O caminho novo cria diretamente documentos emitidos; o botão Guardar rascunho não deve ser considerado validado para estas linhas.
- Revisão completa de todos os relatórios, avisos cambiais e captura do documento efetivamente emitido.
- O recibo fixture encontrou o fornecedor pelo mecanismo explícito de ligação; a recusa de visibilidade PSA do mecanismo genérico foi diagnosticada, mas não alterada por estar fora do âmbito. A experiência de confirmação pela Entrada requer verificar essa escolha no ecrã.

**Não considerar o plano completo nem usar os cenários ainda não verificados como garantia.**
