# Saldos iniciais — confirmação aplicada em 23/10/2026

## Aplicação e auditoria
11 aberturas guardadas com corte em **31/05/2026**, incluindo os cinco cartões a zero e Coverflex a 1 870,75 €. Auditoria: Luis Pedra Silva / luis@pedrasilva.com, **21:26:31 UTC**, documento fonte e linha original completa em cada correção. Joana continua arquivada; tipos e ligações de pagamento mantidos. Todas as outras colunas das 11 contas verificadas iguais às anteriores, exceto atualização automática de data.

| Conta | Abertura anterior | Abertura aplicada |
|---|---:|---:|
| PSA 01 MBCP | 48 478,47 | 48 548,51 |
| PSA 02 CGD | 25 000,00 | 276,36 |
| PSA 03 MBCP Associados | 1 928,62 | 1 928,62 |
| PR MBCP | Não definida | 335 643,39 |
| PR CGD | Não definida | 76 477,28 |
| Bernardo, Joana, Irene, Ricardo, Luis — cada cartão | Não definida | 0,00 |
| Coverflex — benefícios | Não definida | 1 870,75 |

CGD Via Verde −6,70 €: data **31/05 → 01/06**, restante linha rigorosamente preservada, incluindo conciliação já existente. O timestamp original 31/05 às 23:00 UTC corresponde a 01/06 em Lisboa.

## Totais atuais em Bancos > Saldos
| Grupo | Antes | Depois |
|---|---:|---:|
| Bancos PSA | 242 277,07 | **217 616,77** |
| Bancos Pedra Rioja | 0,00 (aberturas não definidas) | **412 120,67** |
| Cartões PSA ativos | −290,66 | **−8,95** |
| Benefícios PSA | 0,00 (abertura não definida) | **1 870,75** |

PSA depois: MBCP 214 855,09; CGD 833,06; Associados 1 928,62. Os cartões mudaram porque movimentos anteriores ao início de junho deixaram de entrar, não por alteração de movimentos ou conciliações. Coverflex continua excluído dos bancos. Totais PSA e PR lidos no ecrã após recarregar a empresa.

## Bernardo — antes/depois e impedimento
As duas linhas na conta Associados estão mal localizadas, mas a deslocação criaria duplicados com a mesma assinatura única. Não alterei assinaturas nem apaguei cópias.

| Linha | Antes | Depois | Evidência existente no cartão Bernardo |
|---|---|---|---|
| Adobe +29,99, 12/06 | Associados, não classificada | **Igual; deslocação não feita** | +29,99 ignorada, assinatura idêntica; também −29,99 classificada |
| Vrto.me +10,00, 22/06 | Associados, não classificada | **Igual; deslocação não feita** | +10,00 ignorada, assinatura idêntica; também −10,00 classificada |

O PDF EXTR_CC.pdf pág. 5 confirma débitos 29,99 e 10,00 do Bernardo e pagamento centralizado 39,99. As datas importadas têm diferenças de fuso já visíveis; não foram corrigidas porque a autorização específica era apenas para o débito CGD.

**Próxima decisão necessária:** marcar as duas cópias positivas de Associados como duplicados, preservadas e não conciliadas, em vez de as mover para onde já existem; manter os débitos negativos do cartão. Não aplicado sem aprovação.

## Fecho MBCP de junho
149 movimentos somam −19 564,13: **48 548,51 − 19 564,13 = 28 984,38**.
Isto confirma o extrato completo, **não** significa que junho ficou conciliado: só 45 movimentos estão conciliados, somando +48 146,91; o saldo conciliado a 30/06 é **96 695,42**, com 104 movimentos ainda por conciliar. Nenhuma conciliação automática realizada.

## Proposta — pagamentos centralizados (nada criado)
Criar duas contas de liquidação de cartões, fora do total bancário: **Associados central** com abertura **−2 254,35** e pagamento pela **03 MBCP Associados**; **Luis central** com abertura **−12,30**, ligação à **01 MBCP** a validar no extrato. Corte 31/05 para ambas. Compras ficam nos cartões individuais; transferências de dívida para a conta central têm contrapartida nos individuais; pagamento pelo banco reduz a dívida central. Assim não se conta a mesma compra/dívida duas vezes. Aguardar aprovação e confirmação da conta pagadora de Luis.

## Coverflex
Documento junho 01–30/06, EXTR_006_2026.pdf, Drive 16Rdlo7_yEUxgNwtfKV_ydouE9hWF7bnX, pág. 1, IBAN ES2767071000640145181691, abertura 1 870,75 e fecho 848,19. Conta do tipo benefícios, sem movimentos guardados atualmente. Formulários sugerem **Pessoal > Subsídio de alimentação (PES.FOOD)** pelo contexto da conta; não preselecionam nem gravam classificação. Teste visual com movimento descartável apenas em memória, sem gravação. Carregamentos entre banco e carteira devem preservar a transferência entre contas para não duplicar o custo dos subsídios distribuídos.

## Verificação
Teste de corte/data imutável com conta descartável desfeito integralmente; quatro testes de sugestões/pesquisa passaram. Auditoria 14 linhas (11 aberturas, 1 data, 2 decisões de não deslocar). Cópia da alteração estrutural idêntica nos dois diretórios; sem erros de compilação. Verificação do ecrã PR exigiu recarregar após trocar empresa: atualização imediata sem recarga não foi corrigida neste pedido.