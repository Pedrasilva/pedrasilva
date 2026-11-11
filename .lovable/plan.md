# Faturação do projeto — investigação e plano para aprovação

**11/11/2026 · Apenas leitura e documentação. Nenhuma alteração de código, políticas, permissões ou dados. DECISIONS.md lido e intacto. B1 OFF: auditoria mais recente, revisão 10, after_active=false.**

## 1. Porque aparece vazio

Faturação consulta documentos registados e sai pelo estado vazio antes de mostrar marcos. Recebimentos consulta o plano. **Uralchem IV tem duas linhas previstas `gantt_value`, zero pagamentos CRM e zero documentos associados**: o vazio decorre desta separação de fontes, não prova perda na conversão.

Não chamar `ensure_project_has_quote`/`backfill_quote_from_project` nem criar propostas artificiais.

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

### Conversão e funcionalidades existentes

A conversão copia o plano CRM para `pm_payment_schedule_items`, remapeia fases/grupos/fornecedores e guarda datas reais e referência contratada. Reabrir um projeto existente não volta a copiar pagamentos. O CRM aceite fica intacto.

Já existem datas vivas/exceções auditadas, reconciliação de valores e histórico Gantt, agrupamento automático (não seleção manual), fila Finance/avisos/confirmacão do gestor. A emissão da fila só marca pagamento/número/data: deve convergir com o documento fiscal. Outgoing ainda lê CRM; Mastercard tem 30 saídas vivas, incluindo Nulty/Mais Energia. Campos InvoiceXpress já existem.

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

## 4. Detalhes técnicos e implementação após OK

Reutilizar `pm_payment_schedule_items`, a projeção operacional Incoming, `financial_documents`, linhas, pagamentos e prontidão; não abrir segundo livro em `pm_invoices`. Guardar descrição, regras e grupos manuais com membros/histórico por alterações aditivas mínimas e ações atómicas revisionadas. O agrupador automático não pode desfazer grupos manuais. Unificar registo de emissão/PDF/SAF-T e ligações de todos os marcos. PT-PT/EN apenas na apresentação; texto fiscal preservado. Migrações idênticas nas duas pastas, GRANT/RLS e revogação de TRUNCATE em novas tabelas. Políticas de ficheiros pendentes intactas.

## 5. Validação — só cópias descartáveis após OK

Conversão com regras 50/50, entradas/saídas/IVA, feriados/fechos, avenças, datas manuais; junção/desfazer e concorrência; grupos manuais preservados e confirmações invalidadas; emissão com/sem PDF, duplicados e SAF-T; conciliação parcial/integral e bloqueio fiscal; permissões por projeto/entidade e fornecedores, B1 OFF; paridade Projetos/Finance e ausência de custos duplicados.

Teste concreto: fase 10 000 → 12 000, parcelas 5 000+5 000 passam a 6 000+6 000; se 5 000 já emitidos, preservar e ajustar só o restante a 7 000. Histórico, proposta e baseline intactos. Plano aparece sem documentos; ausência de plano nunca cria proposta. Timesheets/snapshots/contratos intactos; limpeza e leitura independente a zero.

**Aguardar OK:** causa/inventário confirmados por leitura; nenhuma escrita de negócio testada ou aplicada. Aprovação do plano não aprova preenchimento real, mudanças de direitos por pessoa, políticas de armazenamento ou ativação B1. DECISIONS.md permanece intacto. Relatório completo disponibilizado separadamente.
