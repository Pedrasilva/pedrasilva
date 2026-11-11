# Faturação do projeto — investigação e plano para aprovação

**11/11/2026 · Apenas leitura e documentação. Nenhuma alteração de código, políticas, permissões ou dados. DECISIONS.md lido e intacto. B1 OFF: auditoria mais recente, revisão 10, after_active=false.**

## 1. Porque aparece vazio

O separador Faturação atual mostra **documentos financeiros já registados**, respetivas linhas e recebimentos, não o plano de emissão. Se não existem documentos nem pagamentos associados ao projeto, termina no estado vazio **antes de mostrar os marcos**. O plano está noutro separador, Recebimentos.

No projeto aberto, **2502 Uralchem IV**, existem **duas linhas previstas de entrada**, ambas `planned`, mas **zero documentos financeiros associados**, seja no cabeçalho ou nas linhas. Portanto, o vazio é explicável: o ecrã consulta uma fonte diferente daquela que Luis pretende. As duas linhas têm origem `gantt_value` e gatilho de fim de fase; não foram copiadas de um plano CRM (a proposta ligada tem zero pagamentos).

Isto não prova perda de pagamentos na conversão: os quatro projetos com baseline contratual possuem pagamentos operacionais. Outros projetos antigos simplesmente não têm plano. Não criar propostas artificiais para preencher o vazio, nem chamar `ensure_project_has_quote`/`backfill_quote_from_project`.

## 2. O que existe hoje

### Inventário real dos 21 projetos

Contagens de linhas, não de faturas emitidas. Consulta por `inflow`/`outflow`, os valores realmente usados no armazenamento.

| Projeto com plano operacional | Entradas projeto | Saídas projeto | Entradas CRM | Saídas CRM | Baseline contratual |
|---|---:|---:|---:|---:|---|
| 0410B Telheiras Obra | 18 | 0 | 18 | 0 | Não |
| 2502 Uralchem IV | 2 | 0 | 0 | 0 | Não |
| 2608 Alcanena | 7 | 0 | 7 | 0 | Sim |
| 2609 Mastercard | 51 | 30 | 51 | 30 | Sim |
| 2663 Alteração de loteamento - Ericeira | 4 | 0 | 4 | 0 | Sim |
| Bolshaya | 3 | 0 | 0 | 0 | Não; sem proposta ligada |
| Clinica Mint II | 8 | 0 | 8 | 0 | Sim |
| **Total** | **93** | **30** | **88** | **30** | **4 projetos** |

**Sem plano operacional (14):** 0434 Sérgio Varanda; 2025 Clinica Mulher; 2028 CTR Capital Towers Restaurant; 2101 Colares; 2128 Sandycove Road Dental Clinic; 2506 Apartamento Tiago Carreiras; 2521 Escritórios BCG; 2522 Escritórios Banco CTT - Atrium 2; 2600 Quelhas; Consultoria Greg Freeman; DLMC Oral Surgery; Escritório Sakur Dubai; Projeto histórico Museu Zer0 / ILC; Projeto histórico N10GLED. Os quatro projetos `finance_only` mantêm-se fora do planeamento operacional.

Todos os 123 pagamentos operacionais têm estado armazenado `planned`, apesar de vários projetos já terem documentos financeiros. Isto exige reconciliar apresentação do estado com as ligações fiscais reais; **não marcar pagamentos como emitidos/pagos em massa**, nem inferir correspondência pelo nome/montante apenas. A tabela antiga `pm_invoices` tem zero registos nos 21 projetos; não a usar para criar um segundo livro de faturação.

### Para onde vai o plano na conversão

`pm_convert_relative_quote` copia `quote_payment_schedule_items` para **`pm_payment_schedule_items`**, remapeando fases para `pm_stages` e guardando `source_quote_payment_item_id`. Copia ambas as direções, fornecedor, IVA, condições, ligações entre pagamentos e grupos de faturação; remapeia também os grupos e pagamentos ligados. Calcula datas reais pelo calendário operacional e assinala condições de pagamento ilegíveis, sem inventar prazo.

Guarda a referência contratada em `pm_project_contract_baseline` e respetivas fases/pagamentos. Mantém o CRM aceite e a operação separados: os futuros movimentos/valores do Gantt não devem reescrever a proposta ou baseline.

O caminho idempotente devolve o projeto já existente **sem voltar a copiar pagamentos**. Portanto, reabrir/reconverter um projeto antigo não preenche automaticamente planos ausentes.

### Funcionalidades já aproveitáveis

- **Datas Incoming:** `pm_project_incoming_timing` / `pm_incoming_resolve` usam fases vivas, início/fim, meses de avença, calendário útil, exceções manuais e congelamento fiscal. Dados sem ligação comprovada são assinalados, não adivinhados.
- **Valores:** `pm_gantt_change_value` e `pm_gantt_reconcile_value` atualizam pagamentos não protegidos e registam responsabilidade/motivo/histórico. Preservam montantes fiscais, repartem o restante com arredondamento e rejeitam valor inferior ao já protegido. Mistura de tipos de montante exige revisão.
- **Agrupamento atual:** há agrupamento automático por proximidade de datas/condições/IVA, `invoice_group_id` e `pm_invoice_regroup`; **não é a seleção manual de duas ou mais linhas nem um desfazer individual**. Alterações de valores podem voltar a agrupar: o novo agrupamento manual terá de ficar protegido dessa recomposição.
- **Finance → Faturas a emitir:** existe fila global e avisos de atraso/próximos 14 dias, confirmação auditada pelo gestor e registo manual de número/data.
- **Lacuna fiscal:** `fin_mark_incoming_issued` marca o pagamento e guarda número/data em `pm_invoice_readiness`, mas não cria o documento fiscal canónico nem as suas linhas. O registo de documento/PDF existente usa outra ação, `fin_register_issued_document`. Precisam de convergir numa única operação sem duplicados.
- **Saídas atuais:** o separador Outgoing ainda lê a proposta CRM, não o plano operativo. Mastercard tem 30 saídas vivas, incluindo **Nulty e Mais Energia**. A identidade existe em `supplier_id`/`pm_suppliers`, mesmo quando `supplier_label`/`supplier_company_id` estão vazios: resolver por ligação comprovada, não fabricar fornecedor.
- **InvoiceXpress:** `financial_documents` já possui `invoicexpress_id`, `invoicexpress_type` e `invoicexpress_status`. Preservar estes campos; não implementar a ligação agora.

## 3. Plano proposto

### A. Faturação com duas listas operacionais

**Entradas / faturas a clientes:** apresentar o plano mesmo sem qualquer documento emitido. Cada linha mostra fase numerada, gatilho/regra, data prevista de emissão, data prevista de recebimento, base, IVA, total, descrição editável e estado. Separar a descrição destinada à fatura dos rótulos internos e da proposta aceite.

**Saídas / pagamentos a fornecedores:** ler os pagamentos operacionais e os fornecedores comprovados, mostrando base/IVA/total, vencimento e estado; ligar depois às obrigações/documentos e pagamentos reconciliados já existentes, sem criar custo adicional em `pm_materials`/`pm_expenses`.

Preservar documentos emitidos, recebimentos e totais existentes como histórico no mesmo separador. Filtros claros por estado e comparação previsto/emitido/recebido, sem misturar montantes líquidos e brutos.

### B. Regras e atualização pelo Gantt

Reutilizar pagamentos já existentes e regras da revisão aceite: por exemplo, 50% no início + 50% no fim, ou meses de avença. Alterações de fase recalculam só o restante não emitido, mantendo percentagens e histórico; adiantamentos inclusivos não se somam ao honorário.

Para fases sem regras, apresentar **Plano por definir** e uma pré-visualização de regras propostas. Não adotar silenciosamente 50/50 nem substituir linhas manuais. Projetos antigos sem plano requerem revisão das linhas exatas por Luis antes de qualquer preenchimento real. Nunca criar propostas de substituição.

Datas seguem o Gantt vivo; exceções manuais auditadas prevalecem até serem removidas. Usar o calendário útil existente e o primeiro dia útil de cada mês de avença. Sem fase/prazo comprovado, mostrar Por confirmar. O plano contratado continua apenas leitura.

### C. Junção manual reversível

Selecionar **duas ou mais linhas de entrada do mesmo projeto**, não emitidas/pagas, e confirmar uma única fatura prevista com descrição combinada editável. Conservar cada marco/valor/regra por baixo do grupo, sem apagar linhas.

Proposta de data inicial do grupo: **a mais tardia das datas dos marcos selecionados**, exibida na pré-visualização e editável. Mantém-se o detalhe de IVA por linha; nunca fazer média de taxas nem misturar entidades/clientes/moedas/condições incompatíveis. Uma só linha visível na fila Finance, sem duplicar os membros nos totais.

Desfazer antes da emissão repõe os marcos e descrições originais, mantendo os valores/datas vivos entretanto recalculados. Junções manuais não são desfeitas pelo agrupador automático. Qualquer alteração relevante invalida confirmação anterior, sem apagar auditoria. Depois de emitida, não há desfazer nem reatribuição fiscal automática.

### D. Estados e registo de emissão

**Planeada → Pronta a emitir → Emitida → Paga.** Atingir a data ou concluir a fase sinaliza elegibilidade; os próximos 14 dias continuam como aviso, não como emissão.

**Luis confirmou nesta investigação: manter a confirmação auditada do gestor antes de registar a emissão**, conforme D25. A fila distingue elegível/por confirmar e confirmação atual; mudanças em valor, datas, descrição ou grupo invalidam essa confirmação.

Finance regista número/série, data e PDF opcional através do livro fiscal existente, numa transação que liga todas as linhas/marcos do grupo, congela valores/IVA/texto/datas e atualiza a prontidão. Mesmo sem PDF, o documento canónico fica registado. Importação/PDF/SAF-T encontra a mesma fatura em vez de duplicar.

**Paga** deriva exclusivamente da confirmação da conciliação bancária em Finance e respetivas afetações, não de botão no projeto. Mostrar recebido parcial sem promover prematuramente a Paga. Anulação, notas de crédito e correções usam os procedimentos fiscais existentes e auditoria; nenhum desbloqueio comum de linha emitida/paga.

### E. Permissões — proposta, não atribuição

| Ação | Permissão proposta |
|---|---|
| Ver entradas e documentos do projeto | Financials do projeto |
| Editar descrição/data e juntar/desfazer linhas não emitidas | Financials do projeto, por ação auditada |
| Ver saídas e valores de fornecedor | Honorários de fornecedores do projeto; não ampliar através de Financials |
| Registar emissão, conciliar recebimento, procedimentos fiscais | Finance fiscal; Luis e Tatiana, sujeito à confirmação de Luis |
| Confirmação pré-emissão | Gestor autorizado pelo modelo existente, preservando D25 |

Não codificar nomes/emails como autorização. Antes de restringir atos fiscais a Luis/Tatiana, entregar a lista atual pessoa × ação × projeto/entidade e diferenças: esta proposta **não autoriza retirar direitos de outras contas**. Usar ações protegidas que funcionem com B1 OFF, sem ativar B1 ou depender apenas de esconder botões.

### F. Finance e preparação InvoiceXpress

A fila global reutiliza a mesma projeção de Faturação: grupos, valores atuais, descrição, prontidão e avisos iguais nos dois ecrãs. Preservar isolamento por projeto/entidade e previsão de recebimento distinta da data de emissão.

Reservar no modelo a ligação do grupo ao documento, linhas detalhadas, revisão confirmada, origem e campos externos existentes. Acrescentar apenas o que faltar para idempotência, estado externo e evidência de envio (data/destinatário/resultado/erro). **Emitida não significa enviada**: são factos separados. Uma futura ação InvoiceXpress poderá emitir e enviar com esses dados; nenhuma credencial, chamada, botão funcional, emissão ou email será construída agora.

## 4. Detalhes técnicos e execução após aprovação

1. Projeção de leitura do plano independente da existência de documentos; leitura operacional das saídas com calendário e fornecedores comprovados. Reutilizar `pm_payment_schedule_items`, `financial_documents`, `financial_document_lines`, pagamentos e prontidão existentes.
2. Alterações aditivas mínimas para descrição, regra/fracionamento e grupos manuais com membros/histórico; ações atómicas com controlo de revisão e permissões. Guardas fiscais incluem documentos ligados, não só o estado do pagamento.
3. Unificar emissão manual/PDF com o registo fiscal e afetação de todos os marcos do grupo. Auditar qualquer diferença histórica antes de propor correção real.
4. Atualizar Faturação e fila Finance; PT-PT/EN na apresentação, preservando texto de fatura e idioma do documento.
5. SQL aplicado e ficheiros idênticos nas duas pastas de migrações, GRANT/RLS e revogação explícita de TRUNCATE em novas tabelas públicas. Nenhuma alteração às três políticas de armazenamento pendentes.

## 5. Validação proposta — só após OK, em cópias descartáveis

- Conversão com entradas/saídas/IVA e regra 50/50; começo/fim de fase, feriados/fechos, avenças e datas manuais.
- Alteração 10 000 → 12 000: duas parcelas não emitidas de 5 000 passam a 6 000; se 5 000 já emitidos, conservar 5 000 e ajustar o restante a 7 000, com auditoria. Nenhuma mutação da proposta/baseline.
- Junção/desfazer, conservação de linhas/totais/IVA, datas atualizadas, confirmação invalidada, concorrência e proteção do grupo manual contra regroup.
- Emissão com/sem PDF, série/número duplicados, SAF-T posterior, pagamentos parciais e conciliação; proteção de linhas fiscais.
- Sem documentos: plano visível. Sem plano: aviso fiel, sem proposta criada. Saídas Nulty com identidade comprovada e sem custo duplicado.
- Financials permitido/negado, supplier-fees separado, Finance fiscal e acesso entre projetos/entidades; B1 OFF.
- Paridade Faturação/Finance e preservação de timesheets, snapshots de custos, contratos e documentos. Limpeza das cópias com leitura independente a zero.

**Conclusão:** a causa do vazio e o inventário foram confirmados por leitura de código e dados; nenhum fluxo de escrita foi testado ou alterado. Aprovação deste plano autoriza implementação/validação descartável, não preenchimento de planos reais, alteração de permissões por pessoa, políticas de ficheiros ou ativação B1. Aguardar OK de Luis; nenhum novo registo em DECISIONS.md nesta investigação.
