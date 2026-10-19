# Faturação provisória — reutilizar Finance

## O que já existe
- `financial_documents` é o registo central: 39 documentos de venda, dos quais 9 anulados; 24 com projeto no cabeçalho e 15 com ficheiro associado. Guarda cliente, datas, base/IVA/total, série, estado e campos InvoiceXpress. Todos estão marcados como origem manual; não há evidência que permita atribuí-los ao PHC.
- Linhas em `financial_document_lines`, pagamentos em `financial_document_payments` e recebimentos confirmados em `finance_recebimentos`. Não criar outro livro de faturas nem duplicar recebimentos.
- O projeto já tem Faturação, hoje de consulta e com ligação para criar em Finance. `pm_invoices` é um modelo legado separado; não o usar como novo registo de vendas.
- docs@ e uploads usam a mesma extração: NIF do atelier como emitente → venda; como destinatário → compra; dúvida → triagem. PDFs ficam no armazenamento privado `financial-documents`, com caminho guardado no documento/fila.
- Há código e campos para emissão InvoiceXpress, mas isto não confirma uma integração configurada ou operacional. SAF-T PT ainda não tem importador.

## Implementação
1. **Completar o registo existente**, sem criar tabela paralela de faturas. Série/número, data, cliente, projeto opcional enquanto aguarda associação, valores, PDF, origem e estado; notas de crédito ligadas ao original. Manter pagamentos parciais existentes. «Nota de crédito ligada» aparece como relação, sem apagar o estado de pagamento da fatura original.
2. **Um único registo por documento fiscal**, identificado pela entidade emitente + tipo fiscal + série + número normalizados. Dentro das faturas da mesma entidade, série/número é único; notas de crédito têm identidade fiscal própria. Mostrar a auditoria de colisões dos 39 documentos atuais e esperar pela confirmação de Luis antes de aplicar unicidade, mesmo sem colisões; não renumerar, juntar ou alterar documentos existentes sem confirmação. Todos os caminhos manual/upload/SAF-T/futura API usam a mesma verificação; valores diferentes mostram comparação, nunca sobrescrevem automaticamente.
3. **Adaptar Faturação existente no projeto**: lista de vendas, PDF, estado, crédito associado; «Registar fatura» com introdução manual ou PDF. Reutilizar formulário, armazenamento e motor do docs@; confirmação obrigatória de dados e milestone antes do registo final. Um PDF de compra ou de outra entidade não vira venda por força do botão. Listar em Finance os documentos atuais sem projeto para Luis os associar, sem associações automáticas presumidas; verificar também ligações nas linhas antes de os considerar sem projeto. Preservar as restantes vistas existentes.
4. **Totais coerentes**: faturado líquido = faturas emitidas válidas menos notas de crédito válidas; rascunhos/anuladas excluídos. Recebido deriva apenas dos pagamentos/recebimentos confirmados, respeitando pagamentos parciais e sem dupla contagem. Comparação com orçamento/earned/milestones usa valores sem IVA; recebido e saldo de cobrança mostram explicitamente a base com IVA. «Por faturar» é orçamento menos faturado, distinto de «por receber»; não ocultar sobrefaturação.
5. **Milestones**: conservar Revenue (earned); adicionar Faturado e diferença (earned − faturado), a partir das ligações das linhas aos marcos. Permitir várias linhas/marcos numa fatura sem contar a fatura inteira em cada marco. Sem alterar datas, horas, honorários ou estado das milestones planeadas só por registar uma fatura.
6. **Finance → Importar SAF-T**: carregar XML SAF-T PT mensal, validar entidade e estrutura; ler faturas, notas de crédito, estados e valores sem AI. Pré-visualização de novas/existentes/divergentes, sugestões de projeto por cliente/NIF, seleção manual quando ambíguo. Associar notas de crédito pela referência ao original; referências não resolvidas ficam explícitas. Não marcar como paga só porque foi importada. Preservar ficheiro de origem e rastreabilidade; SAF-T não contém os PDFs individuais.
7. **Acesso**: Faturação e registo apenas para quem está autorizado em Finance na entidade respetiva, com verificação no servidor e nas políticas de leitura/escrita. Reutilizar permissões Finance existentes; acesso geral a Projetos não concede faturação. Não alargar acesso a outras entidades.
8. **Futura InvoiceXpress**: guardar/sincronizar identificador externo no mesmo documento, reconciliado pela identidade fiscal; não emitir de novo uma fatura já emitida noutro software. Não ativar ou chamar a API neste trabalho.

## Detalhes técnicos
- Alterações aditivas em `financial_documents` e `financial_document_lines` para metadados de origem, referência ao documento original e ligação à milestone (`pm_payment_schedule_items`); reutilizar registos de importação existentes para auditoria de ficheiros/lotes.
- Manter `source` legado e acrescentar proveniência específica manual/upload/saft/invoicexpress sem reclassificar documentos históricos automaticamente.
- Operação transacional, verificação de permissões e chave única no banco protegem importações repetidas e criações simultâneas. Pré-análise de duplicados não substitui a proteção no banco.
- Reutilizar `ingestStoredDocument`, fila de revisão e Storage API para PDFs; extração não cria uma venda definitiva antes da confirmação. Parser XML compatível com o ambiente publicado, sem execução de entidades externas.
- Todas as alterações de banco com migrações idênticas nos diretórios de migrações do projeto; regras atuais de entidades/RLS mantidas. EN/PT-PT em todos os novos textos.

## Verificação
- Apenas pessoas/projetos/documentos descartáveis; limpar no fim. Nenhum documento real alterado na implementação.
- Testar: manual e PDF confirmados, compra recusada no registo de venda, nota de crédito, pagamento parcial, totais sem/com IVA, várias milestones, série/número repetidos e criação concorrente, SAF-T repetido e divergente, projeto ambíguo, entidades diferentes e acesso sem Finance recusado.
- Verificar no ecrã registo → lista → leitura após recarregar; importação → associação → milestone/totais. Confirmar integridade dos dados existentes antes/depois.

## Limite desta fase
Este é o plano antes de construir. Não foram criadas faturas, alteradas permissões, importados ficheiros ou ativada a API InvoiceXpress.