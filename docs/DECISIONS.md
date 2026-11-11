# PSA Hub — Registo de decisões de produto

**Registo único das decisões acordadas. Atualizado em 11/11/2026.**

Ler antes de cada tarefa. Se um pedido contrariar uma decisão registada, parar e perguntar a Luis antes de avançar. Após cada decisão acordada, acrescentar uma entrada com data, área, decisão, motivo e relatórios relacionados. Nunca apagar decisões anteriores: assinalar **Substituída**, indicando a sucessora e o âmbito da substituição.

Este registo descreve acordos, não certifica implementações. Os relatórios conservam resultados, limitações e verificações pendentes. Quando não existe uma data comprovada do acordo original, indica-se a data de registo ou a data do relatório, sem inventar uma aprovação. Os relatórios anteriores são evidência histórica, não registos de decisão concorrentes.

## Projetos, Gantt e financeiro

### D01 — Um Gantt idêntico
- **Data:** 11/11/2026 (reafirmação e aprovação da Fase 1).
- **Área:** CRM / Projetos / vista global.
- **Estado:** Em vigor.
- **Decisão:** Um único Gantt, com o mesmo painel, ferramentas, campos, cores e apresentação de fornecedores nos três contextos. Fornecedores externos têm ícone e barra hachurada; Nulty não deve aparecer como Arquitetura interna. Novas conversões preservam a identidade do fornecedor da revisão aceite. Diferenças apenas quando necessárias ao projeto operacional: datas reais, horas registadas e progresso. Adaptadores de dados distintos não justificam painéis distintos.
- **Motivo:** Eliminar experiências divergentes sem sincronizar alterações operacionais de volta à proposta aceite.
- **Relatórios:** [Investigação](project-proposal-gantt-investigation-2026-11-11.md), [Fase 1](project-proposal-gantt-phase1-report.md).

### D02 — Direitos de edição por acesso financeiro ao projeto
- **Data:** 11/11/2026.
- **Área:** Permissões / Gantt Fase 1.
- **Estado:** Em vigor; substitui a exclusividade financeira de D10 no âmbito comercial do Gantt.
- **Decisão:** Quem tem acesso financeiro a um projeto pode editar o Gantt, valores, subfases, alocações e avenças desse projeto. Não depende de cargo, nome ou email. Luis, Tatiana e os atuais utilizadores com acesso financeiro global mantêm acesso a todos os projetos através das permissões existentes. Aplicar a autorização no servidor e impedir acesso cruzado entre projetos. Faturas emitidas e pagamentos confirmados continuam protegidos; editar o Gantt não concede permissão para emitir documentos fiscais.
- **Motivo:** Permitir que a equipa adapte os projetos que lhe estão autorizados, sem ampliar acesso a outros projetos ou aos atos fiscais.
- **Relatórios:** [Fase 1](project-proposal-gantt-phase1-report.md), [Fase 2](project-proposal-gantt-phase2-report.md).

### D03 — Datas livres
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / calendário / pagamentos.
- **Estado:** Em vigor.
- **Decisão:** Fases podem mover-se por atrasos do cliente, espera ou início tardio, sem aprovação, marcador de alteração contratual ou mudança do contrato. As datas previstas dos pagamentos seguem as fases operacionais. Datas de faturas emitidas e pagamentos confirmados mantêm proteção. Uma barra ténue do plano original é opcional, não requisito de entrega.
- **Motivo:** Separar adaptação operacional de alterações comerciais e preservar evidência fiscal.
- **Relatórios:** [Fase 2](project-proposal-gantt-phase2-report.md), [Datas operacionais](project-incoming-dates-report.md).

### D04 — Referência contratada e divisão do valor da fase
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / valores / recursos.
- **Estado:** Em vigor.
- **Decisão:** Cada fase conserva o valor contratado como referência imutável e um valor atual independente. Criar subfases/divisões e alocar pessoas livremente dentro da fase; a soma dos valores das subfases pode ser inferior, mas nunca superior ao valor atual da fase. Mostrar «Alocado / Restante». Custos de pessoas/horas superiores ao valor da fase geram aviso âmbar/vermelho de margem, nunca bloqueio. Uma referência contratual ausente em projetos antigos, incluindo Mastercard, mostra «Referência por confirmar», nunca 0 €.
- **Motivo:** Manter visível o acordo original, evitando duplicação de honorários e permitindo planeamento com riscos explícitos.
- **Relatórios:** [Fase 1](project-proposal-gantt-phase1-report.md), [Fase 2](project-proposal-gantt-phase2-report.md).

### D05 — Alterações de valor sem aprovação, com responsabilidade
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / honorários / faturação.
- **Estado:** Em vigor; substitui D10 e o modelo pesado de D11 neste âmbito.
- **Decisão:** Alterar o valor atual de uma fase exige um diálogo que identifique a diferença face ao contratado, confirmação explícita de responsabilidade e motivo curto. Não existe circuito de aprovação. Ao confirmar, atualizar imediatamente o valor da fase e o plano de faturação/pagamentos, sem modificar montantes já emitidos ou pagamentos confirmados. Mostrar «≠ Contrato», contratado, atual e diferença na fase; totais do projeto mostram «Contratado vs Atual».
- **Motivo:** Manter agilidade e responsabilização, sem esconder divergências face ao que o cliente acordou.
- **Relatórios:** [Plano substituído e investigação](project-proposal-gantt-investigation-2026-11-11.md), [Fase 2](project-proposal-gantt-phase2-report.md).

### D06 — Histórico comercial apenas por acréscimo
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / auditoria.
- **Estado:** Em vigor.
- **Decisão:** Registar cada alteração de valores de fases, avenças e criação de novas fases: utilizador real, momento, projeto, fase, valor anterior, valor novo e motivo. Histórico imutável, apenas por acréscimo, visível na fase e numa lista do projeto. Não substituir a identidade do autor por uma identidade técnica ou por quem consulta o histórico.
- **Motivo:** Permitir responder ao cliente sobre quem alterou um valor, quando e porquê.
- **Relatórios:** [Fase 2 e limites de verificação](project-proposal-gantt-phase2-report.md).

### D07 — Novas fases fora do contrato
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / âmbito.
- **Estado:** Em vigor.
- **Decisão:** Permitir novas fases não incluídas no contrato, marcadas «Fora do contrato», com histórico. Não inventar uma referência aceite nem alterar o contrato original.
- **Motivo:** Acomodar trabalho adicional, distinguindo-o do âmbito contratado.
- **Relatórios:** [Fase 2](project-proposal-gantt-phase2-report.md).

### D08 — Avenças extensíveis e alterações futuras
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / avenças.
- **Estado:** Em vigor.
- **Decisão:** Acrescentar meses livremente quando a obra se prolonga. Mudar o valor mensal exige a pergunta «O cliente concordou com o novo valor da avença?», confirmação de responsabilidade e motivo. Aplicar o novo valor daqui para a frente, atualizar faturação/pagamentos protegendo histórico fiscal e registar a alteração. Não exigir aprovação adicional.
- **Motivo:** Acompanhar a duração real da obra sem reescrever meses passados ou evidência fiscal.
- **Relatórios:** [Fase 2](project-proposal-gantt-phase2-report.md). O relatório identifica testes de avenças ainda pendentes; o acordo não equivale a validação completa.

### D09 — Custos e preços horários derivados de HR acessíveis por projeto
- **Data:** 11/11/2026.
- **Área:** Financeiro dos projetos / HR.
- **Estado:** Em vigor.
- **Decisão:** Qualquer pessoa com acesso financeiro a um projeto pode ver os recursos e os custos/preços horários derivados de HR nesse projeto, incluindo overheads. Autorizar no servidor nos ramos B1 OFF e ON, exclusivamente para o projeto autorizado. Salários e registos HR brutos continuam protegidos. Faturável/não faturável deriva diretamente da classificação das horas guardadas, nunca da disponibilidade de recursos/preços; dados indisponíveis mostram «—» com motivo. Não completar despesas sem EUR com câmbio inventado: listar para Tatiana completar com evidência. Manter custo × 1,75 em Projetos por agora; a futura uniformização do markup permanece uma decisão em aberto.
- **Motivo:** Acesso financeiro deve fornecer cálculos utilizáveis e iguais para PM e administrador, sem revelar salários brutos nem inventar totais.
- **Relatórios:** [Correção e despesa EUR pendente](project-financials-approved-fix-report.md).

### D10 — Regra anterior: PM altera datas, Finance altera montantes
- **Data:** 03/11/2026 (relatório da regra anterior); substituída em 11/11/2026.
- **Área:** Recebimentos / permissões comerciais.
- **Estado:** **Substituída parcialmente por D02–D08.**
- **Decisão anterior:** Gestor do próprio projeto podia alterar datas de pagamento por ações auditadas; alterações de montantes ficavam reservadas a Finance. Não conceder atos fiscais ao gestor só por poder alterar datas.
- **Motivo original:** Separar gestão operacional de alteração financeira e proteger faturas/pagamentos.
- **Sucessora:** Acesso financeiro ao projeto permite alterações de valores através do Gantt com confirmação, motivo, histórico e atualização imediata do plano. A exclusividade Finance para esses valores já não vigora; a proteção fiscal e os atos de emissão/recebimento continuam independentes.
- **Relatórios:** [Regra original e testes date-only](project-incoming-dates-report.md), [Fase 1](project-proposal-gantt-phase1-report.md), [Fase 2](project-proposal-gantt-phase2-report.md).

### D11 — Modelo anterior: alterações comerciais reservadas a Finance
- **Data:** 11/11/2026 (proposta de modelo anterior; substituída no mesmo dia).
- **Área:** Plano do Gantt.
- **Estado:** **Substituída por D02–D08; não é requisito vigente.**
- **Decisão/direção anterior:** Separar orçamento/horas internos editáveis pelo PM de honorários/pagamentos apenas para Finance, com indicação de adenda contratual necessária. A referência contratada e o histórico já eram pretendidos. Não tratar essa direção como autorização para implementar circuitos pesados de aprovação.
- **Motivo original:** Tornar explícita a diferença entre adaptação interna e acordo comercial.
- **Sucessora:** Luis escolheu o modelo ágil: sem aprovação nem exclusividade por cargo; confirmar responsabilidade, indicar diferenças e registar alterações segundo D02–D08.
- **Relatórios:** [Investigação e aviso de substituição](project-proposal-gantt-investigation-2026-11-11.md), [Fase 1](project-proposal-gantt-phase1-report.md).

### D12 — Mastercard permanece convertido
- **Data:** 10/11/2026.
- **Área:** Projetos / proveniência.
- **Estado:** Em vigor; assunto encerrado.
- **Decisão:** 2609 Mastercard mantém exatamente a ligação à proposta, baseline contratual, origem e indicação de projeto convertido. Não reclassificar como projeto direto nem remover evidência. Uma referência contratual sem valores comprovados continua «Referência por confirmar».
- **Motivo:** Luis confirmou a manutenção da proveniência existente após investigação das linhas reais.
- **Relatórios:** [Decisão Mastercard encerrada](direct-project-origin-report.md#decision--mastercard-closed-10-november-2026), [Fase 1](project-proposal-gantt-phase1-report.md).

### D13 — B1 mantém-se OFF e dados reais protegidos
- **Data:** 11/11/2026 (reafirmação).
- **Área:** Acesso / entrega / testes.
- **Estado:** Em vigor.
- **Decisão:** Não ativar B1 por consequência de outra tarefa. Mantém-se OFF; a revisão 10 é o último estado verificado nos relatórios, não uma nova consulta deste registo. Testar apenas em cópias descartáveis, nunca em projetos, propostas ou drafts Marketing reais. Mostrar a Luis as linhas exatas e obter autorização antes de alterações em dados reais. Preservar horas, snapshots, contratos e evidência fiscal.
- **Motivo:** Evitar regressões de acesso e alterações involuntárias ao histórico de negócio.
- **Relatórios:** [B1 e tentativas históricas](project-access-phase-b1-report.md), [Financeiro](project-financials-approved-fix-report.md), [Gantt Fase 2](project-proposal-gantt-phase2-report.md).

## Propostas e documentos

### D14 — Propostas sem datas operacionais até conversão
- **Data:** 03/11/2026 (relatório de conversão); reafirmada no registo de 11/11/2026.
- **Área:** CRM / propostas / pagamentos.
- **Estado:** Em vigor.
- **Decisão:** Antes da conversão, programa e pagamentos apresentam semanas relativas e ordinais de meses de construção, não datas de calendário operacionais inventadas. A data editorial de um documento não é uma data de planeamento. Só a conversão, com início real escolhido e revisão aceite, gera datas de fases/pagamentos pelo calendário de trabalho. Depois da conversão, o Gantt mostra dados operacionais reais e grava apenas no projeto; proposta aceite e baseline ficam intactos.
- **Motivo:** Não apresentar previsões fictícias como compromisso de calendário nem reescrever o contrato durante execução.
- **Relatórios:** [Ciclo proposta → projeto](quote-lifecycle-report.md), [Calendário convertido](converted-project-schedule-report.md), [Datas de pagamentos](project-incoming-dates-report.md).

### D15 — Master page com predefinição do atelier e override por proposta
- **Data:** 09/11/2026 (relatório inicial); verificações adicionais em 10/11/2026.
- **Área:** Editor de propostas / master page.
- **Estado:** Em vigor.
- **Decisão:** Uma geometria A4 em mm para editor, páginas e PDF: margens, cabeçalho/rodapé, logótipo/contactos, alinhamento e arrasto com guias, com variante opcional da primeira página. Predefinição do atelier editável apenas por administradores; novas propostas recebem essa predefinição. Cada proposta pode ter override e reposição explícita da predefinição. Alterar a predefinição não muda propostas existentes: mantêm o aspeto até edição explícita ou reset.
- **Motivo:** Consistência documental sem alterações retroativas aos documentos preparados para clientes.
- **Relatórios:** [Master page e verificações finais](proposal-master-page-report.md).

### D16 — Páginas em tempo real e PDF do mesmo resultado
- **Data:** 08/11/2026 (relatórios).
- **Área:** Editor de propostas / paginação.
- **Estado:** Em vigor.
- **Decisão:** Editar / Split / Páginas partilham renderização, seleção e zoom. Paginar A4 após os dados vivos estarem carregados, com debounce de 300 ms, quebras e keep-with-next. Paged.js fica isolado em iframe: os seus estilos não podem alterar a aplicação. Imprimir as páginas concluídas, sem nova paginação, com margem de impressão zero. Cabeçalho, rodapé e números repetem nas caixas de margem; intervalos/cantos/sombras e etiquetas de página são só para o ecrã. Títulos H1/H2 entram na numeração/índice, H3 não; títulos internos são H3 ou menores e blocos existentes começam em H1.
- **Motivo:** Ecrã e PDF devem refletir a mesma versão do documento, sem destruir a navegação da aplicação.
- **Relatórios:** [Paginação](proposal-pagination-phase1-report.md), [Isolamento](proposal-chrome-regression-report.md), [Polimento](proposal-paged-polish-report.md), [Margens e títulos](proposal-paged-part2-report.md).

### D17 — Split equilibrado e painéis pessoais
- **Data:** 08/11/2026.
- **Área:** Editor de propostas.
- **Estado:** Em vigor.
- **Decisão:** Split com editor/páginas de igual largura. Biblioteca e definições são sobreposições alternáveis; lembrar abertura/fecho por pessoa no navegador, sem ocupar as colunas. Não alterar conteúdo real para testes de paginação; manter as duas cópias intencionais de Estudo Prévio no Hotel Chiado.
- **Motivo:** Tornar o editor utilizável sem sacrificar a largura das páginas nem apagar conteúdo editorial intencional.
- **Relatórios:** [Split](proposal-split-followups-report.md), [Blocos preservados](proposal-chrome-regression-report.md).

### D18 — Aceitação e conversão baseadas em evidência
- **Data:** 03/11/2026 (relatório).
- **Área:** CRM / contrato.
- **Estado:** Em vigor.
- **Decisão:** Um ciclo partilhado reconcilia envio, aceitação, assinatura e projeto. Aceitação refere uma revisão enviada real; conversão exige revisão aceite correspondente ao conteúdo comercial, empresa e Gantt. Uma proposta aceite mas não assinada pode converter com aviso explícito. Não inventar revisões enviadas nem reescrever PDFs/snapshots antigos. Alterações operacionais não se propagam à proposta convertida.
- **Motivo:** Preservar o acordo do cliente e evitar conversão com conteúdo comercial diferente do aceite.
- **Relatórios:** [Ciclo](quote-lifecycle-report.md), [Calendário convertido](converted-project-schedule-report.md).

### D19 — DocuSign go-live em espera
- **Data:** 11/11/2026 (decisão explícita de Luis neste pedido).
- **Área:** Assinatura / DocuSign.
- **Estado:** **Em espera.**
- **Decisão:** Não avançar com ativação em produção, promoção da chave ou submissão go-live sem novo OK de Luis. O ensaio demo de 08/11 teve 22 chamadas eSignature e 3 chamadas OAuth/userinfo bem-sucedidas, com documentos sintéticos, e envelope anulado; isso não equivale a aprovação de produção.
- **Motivo:** Luis colocou o go-live em espera; sucesso técnico em demo não autoriza lançamento.
- **Relatórios:** [Ensaio demo e fronteira go-live](docusign-go-live-2026-11-08-report.md).

## Férias, feriados e presença

### D20 — Calendário único de trabalho e fechos
- **Data:** 11/11/2026 (registo da decisão existente; data original não comprovada num relatório dedicado).
- **Área:** HR / calendário / planeamento.
- **Estado:** Em vigor.
- **Decisão:** Dias úteis = segunda a sexta menos feriados nacionais, feriado de Lisboa de 13 de junho e fechos do atelier. Usar o mesmo calendário no Gantt operacional, planeamento semanal, timesheets e banco de horas; propostas relativas ignoram-no até conversão. Feriados de 2027 estão confirmados, sem Carnaval. Luis deve confirmar anos futuros antes de guardar; Carnaval só por indicação explícita. Alterações do calendário nunca deslocam projetos reais silenciosamente: pré-visualizar e confirmar, mantendo duração útil, dependências, lags e intervalos.
- **Motivo:** Calendário coerente e adaptação operacional deliberada, sem remarcações invisíveis.
- **Relatórios/evidência:** [Calendário convertido e testes de feriados/fechos](converted-project-schedule-report.md), [Estado do calendário e confirmação de 2027](../roadmap.md#office-calendar-holidays--closures). Não foi localizado um relatório dedicado que date o acordo original.

### D21 — Fechos como férias obrigatórias, com exceções
- **Data:** 11/11/2026 (registo da decisão existente; data original não comprovada num relatório dedicado).
- **Área:** HR / férias.
- **Estado:** Em vigor.
- **Decisão:** Fechos geram férias obrigatórias para colaboradores ativos, após pré-visualização e confirmação. Dedução proporcional à carga contratual semanal, limitada a 1: `min(1, horas/dia × dias/semana ÷ 40)`. Não duplicar férias já marcadas nem descontar dias de baixa. Estagiários curriculares sem direito a férias recebem dias não úteis sem dedução de férias. Saldo insuficiente não bloqueia a criação: assinalar a Luis. Reduzir/remover um fecho restitui os dias correspondentes.
- **Motivo:** Aplicar fechos de forma uniforme e proporcional sem dupla dedução ou penalização indevida.
- **Relatórios/evidência:** [Estado das regras de fecho](../roadmap.md#office-calendar-holidays--closures), [Calendário operacional](converted-project-schedule-report.md). Sem relatório dedicado localizado; não confundir com o relatório de saldos bancários de junho.

### D22 — Saldos iniciais de férias e preservação de aprovações
- **Data:** 19/10/2026 (plano arquivado); reafirmada no registo de 11/11/2026.
- **Área:** HR / saldos / pedidos.
- **Estado:** Em vigor.
- **Decisão:** Referência inicial do portal em 01/06/2026. Guardar ajustes por pessoa/ano/data, nunca hardcoded. Totais 2026 aprovados: Bernardo Nadais 23; Francisco Oliveira 18; Irene Cunha 18; João Almeida 20,5; Luis Pedra Silva 15; Mariana Oliveira 22; Patricia Reis 23; Ricardo Conceição 16; Tatiana Shchenina 18 dias. Para estas pessoas, deduzir apenas férias aprovadas/pendentes que começam em ou após 01/06; anteriores permanecem visíveis mas já entram no saldo inicial. Não alterar saldos de Adalberto Duarte, Rita Saragoça ou Ricardo Cabrita. Carry-over de 2027 corresponde ao saldo calculado em 31/12/2026. Baixa, ausência não remunerada e trabalho remoto não descontam férias. Preservar aprovação e cálculo; motivo de rejeição obrigatório em pedidos/alterações de férias e ausências. Contadores de pedidos são distintos dos dias pendentes.
- **Motivo:** Reconciliação fiel ao início do portal e proteção de saldos, pedidos e regras existentes.
- **Relatórios/evidência:** [Plano arquivado](../.lovable/plan/saldo-inicial-de-férias-1-de-junho-de-2026-2026-10-19.md), [Aplicação e verificação](../roadmap.md#current-request--june-2026-vacation-opening-balances). O plano é evidência do acordo; não é um relatório de execução.

### D23 — Trabalho em dias não úteis não bloqueado
- **Data:** 11/11/2026 (registo da regra existente; data original não comprovada aqui).
- **Área:** HR / timesheets.
- **Estado:** Em vigor.
- **Decisão:** Trabalho em feriados, fins de semana e férias de dia inteiro é assinalado, não bloqueado; aprovar essas entradas individualmente, nunca em lote. Ausências não remuneradas representam horas em dívida, sem alteração automática do salário. Eliminações de horas solicitadas preservam cópia auditada com motivo/autor/momento.
- **Motivo:** Permitir registo verdadeiro com revisão explícita e rastreabilidade, sem alterações salariais implícitas.
- **Relatórios/evidência:** [Roadmap e verificações históricas](../roadmap.md). Não foi localizado um relatório dedicado; esta entrada regista a regra existente, não novos testes.

## Finanças e Marketing — decisões existentes documentadas

### D24 — Uma despesa, um custo e pagador independente
- **Data:** 02/11/2026 (relatório atualizado).
- **Área:** Despesas / reembolsos.
- **Estado:** Em vigor.
- **Decisão:** Despesas de projeto versão 2 usam uma entrada comum de comprovativos e um único registo de custo do projeto. Pagador e refaturação são independentes. Correspondência bancária exige o débito EUR integral comprovado; não criar segundo custo/documento duplicado. Aprovações, lotes e afetações mantêm ações protegidas e auditadas. Preservar histórico versão 1 e não inventar tratamento fiscal/IVA pendente.
- **Motivo:** Evitar dupla contabilização, câmbio presumido e mistura entre custo, reembolso e refaturação.
- **Relatórios:** [Fluxo e limites](project-expense-flow-report.md), [Correções](project-expense-bug-fixes-report.md), [Listas Finance](finance-expense-lists-report.md).

### D25 — Faturas a emitir não conferem atos fiscais ao PM
- **Data:** 04/11/2026 (relatórios).
- **Área:** Finance / faturação.
- **Estado:** Em vigor; não contradiz D02–D08.
- **Decisão:** Fila «Faturas a emitir» reservada a Finance e aos projetos Financials autorizados; usa datas operacionais protegidas, avisos até 14 dias e previsão mensal. Confirmação «Pronto a faturar» pelo gestor autorizado é auditada, não é emissão legal. Emissão manual exige permissão fiscal e número/data; não inventar documentos ou recebimentos pagos. Mudanças de datas/valor tornam a confirmação anterior desatualizada, sem apagar auditoria.
- **Motivo:** Separar previsão e prontidão da emissão e do recebimento reais.
- **Relatórios:** [Faturas a emitir](finance-invoices-to-issue-report.md), [Datas operacionais](project-incoming-dates-report.md).

### D26 — Identidade bancária por evidência, sem inclusão de contas pessoais
- **Data:** 23/10/2026.
- **Área:** Finance / bancos.
- **Estado:** Em vigor.
- **Decisão:** Registos/exportações da empresa não incluem contas pessoais de sócios nem de condomínios. Identificar por conta/IBAN e evidência, não só pelo banco emissor. Documentos externos/pessoais ficam preservados; contas/cartões ambíguos aguardam Luis. Correções não autorizam conciliação automática nem alteração indiscriminada de saldos/movimentos.
- **Motivo:** Preservar separação de entidades e evitar classificar como conta da empresa um documento externo.
- **Relatórios:** [Identidades oficiais](official-bank-identities-report.md), [Saldos bancários de junho e pendências](june-opening-balances-report.md).

### D27 — Portefólio Marketing independente e privado
- **Data:** 25/10/2026.
- **Área:** Marketing / portefólio.
- **Estado:** Em vigor.
- **Decisão:** Projetos históricos podem existir apenas no Marketing, sem pseudo-projetos operacionais. Identidade editorial imutável com ligação operacional opcional; ligar depois preserva conteúdo e histórico. Nomes/clientes internos protegidos não entram no contexto AI.
- **Motivo:** Manter património editorial sem contaminar planeamento ou expor informação interna.
- **Relatórios:** [Portefólio](marketing-portfolio-report.md), [Revisão](marketing-portfolio-review-report.md).

### D28 — Avisos editoriais, confirmação e proteção de publicação
- **Data:** 24/10/2026 (evidência do relatório).
- **Área:** Marketing / aprovação.
- **Estado:** Em vigor.
- **Decisão:** Readiness e clearance são avisos, não bloqueios automáticos de aprovação/agendamento. Menção de cliente confidencial exige confirmação explícita ligada ao conteúdo atual. Preservar permissões, hashes de aprovação e histórico; alterações de conteúdo invalidam aprovação pertinente. Respostas de publicação ambíguas não são reenviadas automaticamente.
- **Motivo:** Permitir julgamento editorial humano sem duplicar publicações ou ignorar confidencialidade.
- **Relatórios:** [Aprovação consultiva](marketing-advisory-copy-report.md), [Clearance](marketing-live-clearance-report.md).

### D29 — Idioma e melhores horários sem automatismos inventados
- **Data:** 24–25/10/2026 (relatórios).
- **Área:** Marketing / idioma / recomendações.
- **Estado:** Em vigor.
- **Decisão:** Idioma por projeto/plataforma: EN, PT-PT ou bilingue com PT primeiro. Tradução apenas por ação manual; não reescrever posts existentes automaticamente. Melhores horários usam evidência de atividade/desempenho em Lisboa, sem AI; poucos dados produzem indisponibilidade, não recomendações fictícias.
- **Motivo:** Preservar intenção editorial e distinguir dados reais de estimativas sem suporte.
- **Relatórios:** [Idioma](marketing-post-language-report.md), [Melhores horários](marketing-best-times-report.md).

### D30 — Reels privados e retenção limitada autorizada
- **Data:** 25/10/2026 (relatórios).
- **Área:** Marketing / vídeo.
- **Estado:** Em vigor.
- **Decisão:** Upload manual de reel terminado, privado e associado a um perfil de projeto, com validações partilhadas. Após publicação comprovada e 30 dias, remover apenas o vídeo original elegível; conservar capa, texto, aprovação, histórico, ligação Instagram e métricas. Nunca purgar drafts pendentes, publicação incerta ou ficheiros reutilizados sem proteção.
- **Motivo:** Reduzir armazenamento sem perder prova de publicação nem interferir com trabalho editorial.
- **Relatórios:** [Reels terminados](marketing-finished-reels-report.md), [Retenção](marketing-reel-retention-report.md).

### D31 — Idioma da interface não altera documentos ou cálculos
- **Data:** 11/11/2026 (registo das decisões de tradução existentes).
- **Área:** Toda a aplicação / i18n.
- **Estado:** Em vigor.
- **Decisão:** EN como fonte e PT-PT como tradução principal; frases completas e chaves partilhadas/glossário, com paridade EN/PT. Traduzir apresentação, não enums, preços, dados guardados ou idioma de documentos de clientes. Backoffice é o mesmo nome em EN/PT; Studio/Atelier é uma distinção intencional. Termos legais portugueses mantêm o termo canónico, sem novos acrónimos ingleses inventados. Não aceitar novas cadeias UI sem tradução através de atualização da baseline.
- **Motivo:** Consistência terminológica sem mutação de documentos, contratos ou cálculos.
- **Relatórios:** [Auditoria de tradução](i18n-batch0-report.md), [Terminologia confirmada](project-proposal-gantt-phase1-report.md).

### D32 — Gestão de equipas delegável, sem administração geral
- **Data:** 11/11/2026, 16:27 UTC.
- **Área:** Projetos / permissões / equipas.
- **Estado:** Em vigor; substitui a exclusividade de administradores para gerir equipas e os quatro acessos de projeto, não para atribuir permissões gerais.
- **Decisão:** Se não existir permissão atribuível, criar «Gerir equipas de projeto», concedida por conta no ecrã de permissões existente apenas por administradores. Permite acrescentar/remover pessoas e definir Financeiro, Orçamento e custo das horas, Despesas e Honorários de fornecedores em todos os projetos, através das ações auditadas com autorização no servidor. Não atribuir automaticamente a Ricardo Conceição, Irene Cunha ou qualquer outra pessoa: Luis fará a atribuição. Cada acesso tem uma ajuda curta em PT-PT e EN. Não concede acesso a salários brutos nem administração geral. B1 permanece OFF; testes apenas em dados descartáveis e nenhuma alteração a equipas reais.
- **Motivo:** Delegar a gestão de equipas sem atribuir o papel de administrador nem permitir alterações sem autorização e auditoria.
- **Relatórios:** [Gestão de equipas](project-team-management-permission-report.md).

## Acrescentar novas decisões

Usar um identificador novo e os campos acima. Se a decisão substituir outra, manter o texto anterior e acrescentar estado/sucessora na entrada anterior. Não promover propostas, recomendações ou testes bem-sucedidos a decisões sem acordo de Luis. Não atualizar datas históricas com a data de uma implementação posterior.