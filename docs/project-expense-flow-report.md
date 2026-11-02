# Despesas de projeto e reembolsos — estado da implementação

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