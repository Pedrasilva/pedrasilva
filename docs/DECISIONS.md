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
- **Exceção de âmbito:** D50 limita referência/proteções contratadas à assinatura ou conversão; propostas em elaboração não têm comparação contratual.
- **Decisão:** Cada fase conserva o valor contratado como referência imutável e um valor atual independente. Criar subfases/divisões e alocar pessoas livremente dentro da fase; a soma dos valores das subfases pode ser inferior, mas nunca superior ao valor atual da fase. Mostrar «Alocado / Restante». Custos de pessoas/horas superiores ao valor da fase geram aviso âmbar/vermelho de margem, nunca bloqueio. Uma referência contratual ausente em projetos antigos, incluindo Mastercard, mostra «Referência por confirmar», nunca 0 €.
- **Motivo:** Manter visível o acordo original, evitando duplicação de honorários e permitindo planeamento com riscos explícitos.
- **Relatórios:** [Fase 1](project-proposal-gantt-phase1-report.md), [Fase 2](project-proposal-gantt-phase2-report.md).

### D05 — Alterações de valor sem aprovação, com responsabilidade
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / honorários / faturação.
- **Estado:** Em vigor; substitui D10 e o modelo pesado de D11 neste âmbito.
- **Exceção de âmbito:** D50 exclui Draft/Sent/Approved sem assinatura/conversão destes diálogos e motivos.
- **Decisão:** Alterar o valor atual de uma fase exige um diálogo que identifique a diferença face ao contratado, confirmação explícita de responsabilidade e motivo curto. Não existe circuito de aprovação. Ao confirmar, atualizar imediatamente o valor da fase e o plano de faturação/pagamentos, sem modificar montantes já emitidos ou pagamentos confirmados. Mostrar «≠ Contrato», contratado, atual e diferença na fase; totais do projeto mostram «Contratado vs Atual».
- **Motivo:** Manter agilidade e responsabilização, sem esconder divergências face ao que o cliente acordou.
- **Relatórios:** [Plano substituído e investigação](project-proposal-gantt-investigation-2026-11-11.md), [Fase 2](project-proposal-gantt-phase2-report.md).

### D06 — Histórico comercial apenas por acréscimo
- **Data:** 11/11/2026; Fase 2 aprovada às 15:05 UTC.
- **Área:** Gantt Fase 2 / auditoria.
- **Estado:** Em vigor.
- **Exceção de âmbito:** D50 exclui alterações pré-contrato de novos registos de histórico comercial; históricos existentes permanecem intocados.
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
- **Exceção de âmbito:** D50 reserva acordo do cliente/responsabilidade/motivo/histórico a avenças após assinatura ou conversão.
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

### D33 — Capa, carta e conteúdo de propostas
- **Data:** 11/11/2026.
- **Área:** Propostas / Master page / carta.
- **Estado:** Aprovado; implementação sujeita às verificações descritas no relatório.
- **Decisão:** Três layouts próprios: Capa sem cabeçalho/rodapé; Carta com papel timbrado e assinatura de Luis, sem número; Conteúdo com numeração 1/n e índice contando apenas conteúdo. Manter prática por administrador, substituição por proposta e propostas existentes intocadas. Novas propostas começam com Capa e Carta editáveis/removíveis antes do índice. Modelo PT-PT/EN e assinatura configurados uma vez; tokens usam dados vivos. IA produz apenas rascunho revisto, sem envio, sem substituir texto editado sem confirmação e sem inventar números; mostrar os valores usados. Paridade e testes apenas numa cópia descartável de Hotel Chiado; B1 OFF.
- **Motivo:** Apresentação editorial consistente sem modificar documentos existentes nem valores comerciais.
- **Relatórios:** [Capa e carta — implementação e validação](proposal-cover-letter-report.md).

### D34 — Tatiana é Backoffice, sem preço próprio de recurso de projeto
- **Data:** 11/11/2026, decisão de Luis às 21:08 UTC.
- **Área:** HR / custos / Backoffice / recursos de projeto.
- **Estado:** Em vigor. Registo documental; nenhuma alteração de código ou dados autorizada neste pedido.
- **Decisão:** Tatiana Shchenina é Backoffice. Não tem custo horário nem preço de venda próprios enquanto recurso de projeto e não deve aparecer como recurso de projeto com preço. O seu custo integra o overhead de Backoffice, distribuído pelos FTE do departamento Projecto e incluído no custo horário de cada pessoa de projeto, nunca acrescentado uma segunda vez como custo próprio de Tatiana no projeto.
- **Motivo:** Manter a distribuição de custos de estrutura sem duplicação nem preços fictícios de produção para Backoffice.
- **Verificação:** O cálculo HR atual de Projetos devolve 11 pessoas com preços e exclui Tatiana; a quota Backoffice é distribuída por FTE. O caminho de preços de propostas, possíveis overrides e a análise interna histórica de Backoffice são ressalvas separadas no relatório, não corrigidas nem apagadas por este registo.
- **Relatórios:** [Verificação Tatiana/Backoffice](tatiana-backoffice-costing-verification-2026-11-11.md), [11 preços de projeto já verificados](project-financials-approved-fix-report.md).

### D35 — HR completo limitado a Luis, Irene e Tatiana
- **Data:** 11/11/2026, confirmado por Luis às 21:20 UTC.
- **Área:** HR / privacidade / permissões.
- **Estado:** Regra confirmada; execução condicionada à confirmação da lista exata de perdas por conta. B1 permanece OFF.
- **Decisão:** HR completo — fichas de todos os colaboradores, salários/compensação, benefícios, custos de Backoffice e saldos de férias — fica limitado a Luis Pedra Silva, Irene Cunha e Tatiana Shchenina. Todas as outras pessoas, incluindo Ricardo Conceição, veem apenas a sua própria ficha HR, remuneração e férias. Preservar acesso próprio, timesheets, projetos e pedidos de férias. Os custos/preços horários derivados que sejam autorizados pelo acesso financeiro a um projeto mantêm-se independentes; esta regra não altera D09 nem os valores calculados.
- **Condição de execução:** Luis autoriza a remoção dos direitos HR das restantes pessoas, mas antes exige lista exata por conta, papel, exceção e concessão antiga, com direitos perdidos e preservados; aplicar só depois de confirmar essa lista. Nenhuma outra alteração de papel/permissão sem aprovação explícita por pessoa. Primeiro entregar o retrato pessoa × ação × âmbito × origem e parar; em paralelo investigar leituras diretas com uma conta PSA descartável sem HR/Finance, eliminá-la e propor regras mínimas sem as aplicar. As fases posteriores da consolidação não estão autorizadas por esta aprovação da direção.
- **Motivo:** Proteger os dados pessoais HR sem retirar autonomia de trabalho nem os custos derivados autorizados de projetos.
- **Relatórios:** [Investigação inicial de permissões](../.lovable/plan.md); retrato detalhado e investigação de exposição serão entregues para revisão, não são decisões adicionais.

### D36 — Exceção HR temporária e execução limitada da etapa 1
- **Data:** 11/11/2026, confirmado por Luis às 21:36 UTC.
- **Área:** HR / permissões.
- **Estado:** Em vigor; exceção temporária a D35 exclusivamente para Ricardo Conceição.
- **Decisão:** Ricardo Conceição mantém exatamente o papel HR e as dez concessões antigas, sem alterações, até revisão na consolidação de permissões. Bernardo Nadais e Patricia Reis perdem apenas o direito efetivo hr.collaborators.view/team, conservando Project Lead e todos os outros direitos. Retirar apenas a conta de teste luispedrasilva@gmail.com e os seus papéis/concessões. B1 permanece OFF.
- **Motivo:** Aplicar apenas as perdas individuais confirmadas, preservando uma exceção deliberada e as funções operacionais.
- **Relatórios:** Lista PSA-permissions-step1-2026-11-11 entregue para confirmação; verificação desta execução será entregue separadamente.

### D37 — Calendário de ausências sem detalhes HR e isolamento de Backoffice
- **Data:** 11/11/2026, confirmado por Luis às 21:36 UTC.
- **Área:** HR / calendário / privacidade.
- **Estado:** Em vigor; complementa D35 com a exceção D36.
- **Decisão:** Todo o pessoal PSA pode ver quem está ausente e quando: nome, datas e tipo genérico ausente, sem motivos, notas, anexos, saldos ou detalhes de aprovação. Fora de Luis, Irene, Tatiana e da exceção Ricardo, impedir leitura de custos Backoffice e detalhes de férias de terceiros. Separar dias úteis/calendário da leitura de custos autorizada por hr.dias-uteis; preservar dados próprios, remuneração, férias, pedidos e todos os fluxos de escrita/intake, timesheets e projetos.
- **Motivo:** Disponibilidade partilhada não deve revelar dados pessoais ou custos de estrutura.
- **Relatórios:** Investigação PSA-hr-direct-exposure-2026-11-11; validação posterior apenas com conta descartável.

## Acrescentar novas decisões

Usar um identificador novo e os campos acima. Se a decisão substituir outra, manter o texto anterior e acrescentar estado/sucessora na entrada anterior. Não promover propostas, recomendações ou testes bem-sucedidos a decisões sem acordo de Luis. Não atualizar datas históricas com a data de uma implementação posterior.

### D38 — Faturação operacional por projeto
- **Data:** 11/11/2026, plano aprovado nesta conversa; confirmação do gestor reafirmada por Luis.
- **Clarificação histórica (22:19 UTC):** A autorização explícita para construir sob condição foi recebida às 22:19 UTC e consta de D39; a indicação anterior de aprovação não comprova autorização prévia. D39 substitui o âmbito de permissões descrito nesta entrada.
- **Área:** Projetos / Finance / faturação.
- **Estado:** Plano aprovado; preenchimento de dados reais e alterações de direitos por pessoa continuam sujeitos a revisão separada.
- **Decisão:** Faturação mostra o plano vivo de entradas e saídas, independente de haver documentos emitidos. Reutilizar pagamentos operacionais copiados do CRM e fases vivas; proposta aceite e baseline imutáveis. Descrições editáveis e junções reversíveis de linhas não emitidas, com IVA por linha, histórico e confirmação do gestor antes do registo fiscal. Emissão manual usa o livro fiscal existente; pagos derivam da conciliação Finance, sem botão de pagamento no projeto. Finance partilha a fila/projeção; preparar identidade externa/envio futuro sem construir InvoiceXpress. Financials permite planeamento, fornecedores mantêm a sua área, atos fiscais mantêm Finance. Não retirar direitos por pessoa sem lista/OK, não preencher planos antigos sem revisão exata, não criar propostas artificiais; B1 OFF e políticas de ficheiros intactas.
- **Motivo:** Separar previsão de documentos fiscais e eliminar o vazio causado por consultar apenas faturas registadas.
- **Relatórios:** [Plano aprovado](../.lovable/plan/faturação-do-projeto-investigação-e-plano-para-aprovação-2026-11-11.md), [Implementação e limites](project-billing-implementation-2026-11-11.md).

### D39 — Permissões de Faturação e autorização condicionada
- **Data:** 11/11/2026, confirmação explícita de Luis às 22:19 UTC.
- **Área:** Projetos / Finance / Faturação.
- **Estado:** Regra confirmada; construção autorizada apenas se o plano a cumprir exatamente e sem alterar dados reais. Substitui o âmbito de permissões proposto em D38.
- **Decisão:** Acesso financeiro ao projeto permite ver o plano de faturação, editar descrições e datas previstas, juntar faturas previstas e desfazer antes da emissão. Apenas Finance — Luis Pedra Silva e Tatiana Shchenina — pode registar Emitida/Paga ou alterar linhas emitidas, com os procedimentos e proteções fiscais existentes. Não conceder atos fiscais através do acesso financeiro ao projeto. Pagamentos continuam ligados à conciliação Finance; nenhuma alteração fiscal silenciosa.
- **Limites:** Ler decisões primeiro; B1 OFF; testes só em cópias descartáveis. Nenhuma alteração a projetos, faturas ou pagamentos reais, incluindo preenchimento retroativo de planos de projetos convertidos. Qualquer desvio do plano/requisitos ou necessidade de alterar dados reais obriga a parar e perguntar antes. Entregar capturas, resultados e ficheiros alterados. Não construir a integração InvoiceXpress.
- **Motivo:** Separar planeamento autorizado por projeto dos atos fiscais de Luis/Tatiana, sem reescrever dados ou comprometer evidência.
- **Relatórios:** [Revisão de conformidade e bloqueios](project-billing-permissions-review-2026-11-11.md).
- **Clarificações confirmadas nesta revisão:** Luis escolheu manter a autorização separada para ver fornecedores e usar o editor fiscal existente para corrigir emitidas. As ações de planeamento continuam a bloquear emitidas; nenhuma nova ação de desbloqueio. Estes dois desvios estão resolvidos e a execução pode continuar dentro dos restantes limites.

### D40 — Templates importam a proposta completa
- **Data:** 11/11/2026, pedido confirmado por Luis às 22:41 UTC.
- **Área:** CRM / templates / propostas.
- **Estado:** Decisão confirmada; não substitui D14 nem decisões editoriais/fiscais existentes.
- **Decisão:** Importar no menu geral da proposta, em qualquer passo, com seleção de Planeamento/Gantt, Honorários, regras do Plano de pagamentos, Blocos e formato Capa/Carta/Conteúdo; todas as secções inicialmente selecionadas. Honorários têm opção independente de importar valores; desmarcada preserva estrutura e percentagens para recálculo. Guardar templates cobre estas mesmas áreas. Preservar hierarquia, durações relativas, dependências, aprovações e avenças; remapear identificadores das fases e referências editoriais. Nunca transportar cliente, contactos, nome/número/moradas da proposta nem datas operacionais. Carta reutiliza texto com tokens da proposta destinatária. Pagamentos importam apenas regras, percentagens e marcos, nunca faturas previstas, estados ou descrições fiscais do projeto. Aviso explícito identifica conteúdo a substituir; cópia automática permite desfazer sem sobrescrever edições posteriores ou desbloquear propostas protegidas. Templates antigos que não conservaram informação suficiente exigem nova gravação para paridade completa.
- **Limites:** B1 OFF; testes só em propostas descartáveis vazia/preenchida, nunca Travessa do Oleiro nem proposta real. Não corrigir dados reais nem regravar templates existentes automaticamente.
- **Motivo:** Blocos Gantt precisam do programa e honorários completos, não de uma cópia editorial desligada das fases.
- **Relatórios:** [Implementação, testes e limites](full-quote-templates-report.md).

### D41 — Calculadora cria fases de Arquitetura ligadas
- **Data:** 11/11/2026, pedido confirmado por Luis às 23:01 UTC.
- **Área:** CRM / calculadora / planeamento / pagamentos.
- **Estado:** Decisão confirmada; implementação e limites de validação no relatório, sem substituir decisões anteriores.
- **Decisão:** Aplicar honorários cria uma fase de Arquitetura por linha, com nome, ordem, valor percentual e um mês sequencial relativo. Valores em euros inteiros somam exatamente o honorário final, com resto na maior fase. Reaplicar mantém ligação, datas/durações editadas e não duplica fases; valores manuais exigem consentimento. Novas linhas acrescentam fases; linhas removidas perguntam pela fase ligada. Fases não criadas pela calculadora exigem Substituir/Adicionar/Cancelar; fornecedores e avenças nunca são tocados. Planeamento e financeiro usam as fases; novas fases recebem regra explícita de pagamentos do atelier ou mostram «Plano por definir», sem divisão silenciosa. Criação, aviso e desfazer/revisão automática partilhados com templates.
- **Limites:** B1 OFF, só cópias descartáveis; não alterar propostas reais. Confirmação de substituição não autoriza apagar fornecedores/avenças ou evidência fiscal ligados.
- **Motivo:** Eliminar honorários sem fases e preservar ajustes manuais e totais coerentes.
- **Relatórios:** [Implementação, resultados, SQL e limites](calculator-linked-stages-report.md).

### D42 — Avenças visíveis no Gantt partilhado
- **Data:** 11/11/2026, pedido confirmado por Luis às 23:19 UTC.
- **Área:** CRM / projetos / avenças / pagamentos.
- **Estado:** Decisão confirmada; não altera D08 nem outras decisões anteriores.
- **Exceção posterior:** D50 limita as proteções de valor à existência de contrato; estrutura, datas e proteções fiscais mantêm-se.
- **Decisão:** Desenhar cada avença numa linha própria, distinta, na Obra por defeito; manter cartões abaixo do Gantt. Início por dependência FS da última fase de Arquitetura, editável pelo painel e arrasto; duração e número de meses partilham o mesmo registo. Pagamentos mensais partilham datas com Inflow, Plano de pagamentos e Faturação; propostas relativas e projetos convertidos com datas reais. Acrescentar meses livremente; alterar valor mensal exige acordo do cliente, responsabilidade, motivo e histórico, preservando evidência fiscal. Bloquear criação enquanto guarda e selecionar a nova linha. Duplicados reais só são apagados após confirmação nominal de Luis.
- **Limites:** B1 OFF; sem alterações de dados reais. Validação parcial e casos não certificados no relatório. A implementação usa início efetivo como primeiro pagamento quando o início FS cai a meio do mês; meses seguintes usam primeiro dia útil do mês. Esta interpretação não substitui a decisão fiscal anterior e carece de confirmação para certificação.
- **Motivo:** Avenças devem participar no programa e previsões sem perder o editor mensal nem histórico.
- **Relatórios:** [Resultados, SQL, ficheiros e limites](retainer-gantt-report.md).

### D43 — Primeiro mês da avença após Arquitetura
- **Data:** Confirmação de Luis na resposta às perguntas de D42.
- **Área:** Avenças / calendário / pagamentos.
- **Decisão:** Quando o fim de Arquitetura cai a meio do mês, a avença e a primeira mensalidade começam no primeiro dia útil do mês seguinte. As seguintes vencem no primeiro dia útil de cada mês. Luis confirmou que já eliminou o duplicado; não realizar qualquer eliminação adicional.
- **Estado:** Substitui apenas a interpretação provisória do primeiro mês descrita nos limites de D42; restante decisão preservada.
- **Motivo:** Cumprir vencimento mensal sem faturar antes do início da avença.
- **Relatórios:** [Resultados e limites](retainer-gantt-report.md).

### D44 — Horas previstas a partir de honorários
- **Data:** 12/11/2026, pedido de Luis às 00:01 UTC e clarificação posterior.
- **Área:** Projetos / HR / horas / permissões.
- **Estado:** Regra confirmada; investigação e plano apenas, implementação aguarda OK. Substitui somente a manutenção provisória do multiplicador 1,75 em Projetos de D09. Para estes indicadores de horas substitui os limiares anteriores; não altera avisos de margem/custo do Gantt.
- **Decisão:** Custo horário HR inclui quota Backoffice; venda por defeito custo × 1,5, preservando overrides explícitos. Backoffice não integra média de pessoas faturáveis. Horas da fase = honorário / média de venda da equipa; avenças por mensalidade, projeto soma sem duplicar pais/filhos, contrato quando não há fases. Alvo manual explícito prevalece; estimativa marcada «est.». Sem honorários mostrar «Fee not set», não zero. Horas usadas continuam registadas; restantes = previstas − usadas; âmbar desde 85%, vermelho só acima do previsto. Luis confirmou alocações separadas da estimativa, nunca tratadas como alvo manual.
- **Permissões:** Sem Financials por projeto devolver só horas, nunca valores monetários nem taxa média ao navegador. Com Financials permitir gasto/restante em euros e horas; manter proteção HR e B1 OFF.
- **Por decidir no plano:** Média simples da equipa versus ponderação; recomendar média simples e fallback de pessoas faturáveis ativas do atelier.
- **Motivo:** Orçamento de esforço útil sem confundir reservas de capacidade ou divulgar salários/taxas.
- **Relatórios:** [Investigação e cálculos atuais](stage-hours-investigation.md).


### D45 — Termos Gerais portugueses e páginas Gantt horizontais
- **Data:** 12/11/2026, pedido confirmado por Luis às 00:49 UTC.
- **Área:** Propostas / termos / impressão.
- **Decisão:** Usar literalmente o HTML português aprovado do bloco d4282d4d-c976-4c7c-a9fc-830d810f9b68 como padrão para propostas Português (Portugal), incluindo novos documentos/templates; preservar artigos H3, números em negrito e os estilos ingleses. Acrescentar ao padrão inglês a cláusula 11.6 Site Signage integral aprovada, depois de 11.5. Não substituir conteúdo editorial guardado nem alterar Oleiro. Cada Gantt fica numa página A4 horizontal nomeada, com cabeçalho/rodapé do master adaptados, meses e texto legível; separar Projeto/Obra se necessário. PDF exporta as mesmas páginas; rotação apenas como fallback.
- **Estado:** Confirmada; não substitui decisões anteriores. B1 OFF e testes só em cópias descartáveis.
- **Motivo:** Termos adequados ao idioma/jurisdição e programas legíveis sem fragmentação ou duplicação.
- **Relatório:** [Resultados e limites](proposal-terms-gantt-report-2026-11-12.md).

### D46 — Isolamento obrigatório dos testes ao nível da quote
- **Data:** 12/11/2026, confirmação explícita de Luis às 01:08 UTC.
- **Área:** CRM / propostas / testes / preservação de dados.
- **Estado:** Em vigor; clarifica e reforça D13 sem autorizar recuperação ou eliminações.
- **Decisão:** Testes descartáveis devem usar uma QUOTE copiada separada, com identificador próprio. Nunca criar documentos de proposta ou revisões de teste ligados a uma quote real, mesmo quando os blocos são cópias e a eliminação está prevista. B1 permanece OFF. No incidente Oleiro, investigar e apresentar inventário e proposta de recuperação; aguardar OK de Luis antes de restaurar ou apagar qualquer dado.
- **Motivo:** A seleção do documento mais recentemente atualizado permitiu que documentos de teste ligados à quote real fossem apresentados ao utilizador.
- **Relatório:** [Investigação Oleiro e proposta não executada](oleiro-test-document-incident-2026-11-12.md).

### D47 — Documento principal persistente por quote
- **Data:** 12/11/2026, aprovação de Luis às 01:23 UTC.
- **Área:** CRM / composer / workflow / versões / isolamento de testes.
- **Decisão:** A quote tem um documento principal explícito e persistente; composer, ações e versões usam esse identificador, nunca título ou recência de atualização. Oleiro d73deb33-a0f9-41bb-ad4d-637cd5d159b6 abre o original 84e54031-64db-41d8-aa30-b22d882a6017. Atualizar a seleção aberta, descartando caches antigos. Testes criam primeiro uma QUOTE copiada separada e abortam perante documentos/revisões ligados à quote real; não executar os scripts antigos.
- **Preservação:** Não apagar nem restaurar documentos, blocos ou snapshots; os 22 snapshots e o conteúdo atual do original permanecem exatamente como estão. B1 OFF.
- **Motivo:** Impedir que cópias ou revisões de teste substituam o original na interface.
- **Estado:** Confirmada, reforça D46 sem autorizar alterações editoriais.
- **Relatório:** [Correção, ficheiros e SQL](oleiro-main-document-fix-2026-11-12.md).

### D48 — Papéis dos Gantt na proposta e plano de pagamentos com avenças
- **Data:** 12/11/2026, pedido de Luis às 12:15 UTC.
- **Área:** Propostas / impressão / pagamentos.
- **Decisão:** Os blocos Gantt do corpo (Cronograma de Projeto/Obra/parcial) são resumos compactos dentro do texto vertical (uma linha por fase, meses como colunas, sem página própria). Só o Anexo — Programa do Projeto usa páginas A4 horizontais detalhadas, separando Projeto/Obra se necessário; o título lê «Anexo B – Título», sem número de secção. O plano de pagamentos lista as faturas guardadas por fase e gera as mensalidades das avenças com a mesma regra de datas do Gantt (primeiro dia útil de cada mês), substituindo linhas guardadas dessas avenças.
- **Estado:** Substitui apenas «cada Gantt numa página horizontal» de D45; resto de D45 mantém-se. Dados reais do Oleiro (plano guardado, faturação por subfases, papel de «Programa», dependência da avença) aguardam OK de Luis. B1 OFF.
- **Motivo:** Evitar duplicar o programa e manter datas/valores iguais entre Gantt, plano e faturação.
- **Relatório:** [Resultados e propostas de dados](proposal-gantt-roles-payments-2026-11-12.md).

### D49 — Correções autorizadas no Oleiro e movimentos de avenças
- **Data:** 12/11/2026, aprovação de Luis às 12:42 UTC.
- **Área:** CRM / Oleiro / Gantt / pagamentos.
- **Decisão:** Aplicar apenas faturação independente das subfases de Arquitectura, Programa como Arquitetura, e Avença fase de obra como segundo filho de Construção depois de Concurso de construção (apoio), com dependência FS do Projecto de Execução, início no primeiro dia útil do mês seguinte e 12 mensalidades de 3 000 €. Subir/descer e indentar/recuar funcionam também para avenças e atravessam grupos sem saltar para o topo. Preservar Monthly Assistance e restantes dados; apagar apenas a cópia 102948d5 autorizada. B1 OFF.
- **Estado:** Confirma as correções reais pendentes em D48; não autoriza alterações editoriais ou outros projetos.
- **Motivo:** Alinhar estrutura, vencimentos mensais e plano vivo, sem perder edições recentes de Luis.
- **Relatório:** [Resultado, numeração, pagamentos e SQL](oleiro-authorized-corrections-2026-11-12.md).

### D50 — Valores livres durante a elaboração da proposta
- **Data:** 12/11/2026, decisão explícita de Luis às 16:23 UTC.
- **Área:** Gantt Fase 2 / propostas / Estimate / avenças / histórico comercial.
- **Estado:** Plano aprovado por Luis; implementação aplicada, com limites de validação no relatório. Exceção de âmbito a D04–D08 e D42, não revogação das proteções pós-contrato.
- **Decisão:** Confirmação de responsabilidade, motivo, «≠ Contrato», Contratado vs Atual, histórico de valores apenas por acréscimo e pergunta de acordo do cliente para mensalidades só se aplicam após assinatura ou conversão da proposta em projeto. A referência contratada é fixada nessa fronteira. Enquanto Draft/Sent/Approved sem assinatura/conversão, valores de fases, meses e mensalidades alteram-se livremente no construtor de propostas e Estimate, sem esses avisos, motivos ou linhas de histórico comercial. Servidor e apresentação seguem a mesma regra.
- **Preservação:** Não apagar históricos existentes sem OK. Não alterar dados reais, permissões, provas de aceitação/envio, versões documentais, horas ou proteções fiscais. Testes apenas numa quote copiada separada (D46/D47). B1 OFF.
- **Motivo:** A elaboração de uma proposta não constitui uma alteração a um contrato existente.
- **Relatório/plano:** [Investigação e plano para aprovação](proposal-precontract-values-plan-2026-11-12.md).
- **Execução:** [Resultados e limites](proposal-precontract-values-result-2026-11-12.md). Histórico Draft Hotel Chiado c16cb84d-bc34-4842-89c9-05cbc9d3a287 criado durante a investigação, às 16:25:41 UTC, preservado; nenhuma limpeza autorizada.

### D51 — Carta de apresentação formal e Master Carta
- **Data:** 12/11/2026, pedido de Luis às 19:25 UTC.
- **Área:** Propostas / Carta / Master page / IA.
- **Estado:** Plano aprovado por Luis; implementação e validação parcial realizadas. Clarifica o layout Carta de D33; Capa e Conteúdo permanecem inalterados. PDF físico e restantes verificações pendentes no relatório.
- **Decisão:** Carta empresarial de uma página no idioma da proposta (PT-PT/EN), por esta ordem: destinatário no topo direito a partir da empresa/contacto CRM ligados à quote; remetente abaixo à esquerda a partir das definições da empresa; local/data editorial; assunto com projeto/número; saudação; corpo rico editável com agradecimento, resumo executivo baseado apenas na proposta e disponibilidade; despedida, imagem de assinatura quando carregada, Luís Pedra Silva, cargo editável e Pedra Silva Arquitectos. Campos ausentes são espaços reservados editáveis, nunca dados inventados. Regeneração por IA pede confirmação antes de substituir edições manuais e não altera os restantes campos.
- **Master Carta:** Logótipo PSA no topo esquerdo, destinatário em posição de janela de envelope, sem texto de cabeçalho corrente nem número de página; margens adequadas ao corpo e morada/contactos na linha de rodapé. A numeração começa no Conteúdo, depois da carta. Preservar snapshots existentes e overrides explícitos conforme D15/D33.
- **Preservação:** Sem edição de propostas reais nesta fase; testes apenas numa QUOTE copiada separada (D46/D47), sem documentos/revisões ligados ao original. B1 OFF. Nenhuma alteração de valores, Gantt, pagamentos, permissões, histórico ou exclusões documentais reais.
- **Motivo:** Transformar o bloco atual numa carta profissional editável, sem inventar identidade, valores ou compromissos e sem alterar a paginação do restante documento.
- **Plano/maquete:** [Plano aprovado](../.lovable/plan/carta-de-apresentação-e-master-carta-2026-11-12.md). [Implementação e limites](proposal-business-letter-result-2026-11-12.md).
- **Assinatura fornecida (12/11/2026, 21:11 UTC):** Luis enviou Assinatura.jpg para a carta. Imagem guardada como predefinição para novas cartas e adoção explícita do formato; não substituir snapshots nem editar propostas reais existentes.

### D52 — Limpeza limitada e assinatura da carta do Oleiro
- **Data:** 12/11/2026, autorização de Luis às 21:13 UTC.
- **Área:** Propostas / limpeza / Carta / pagamentos.
- **Decisão:** Eliminar exclusivamente a quote de teste 7d7accd8-706b-424d-8e91-14feae419d30 e os seus documentos; as restantes cópias não estão autorizadas para limpeza. Usar a assinatura enviada na Carta do Oleiro, sem alterar o texto nem snapshots. Preservar a alteração de Luis para 18 meses × 3.000 €.
- **Resultado:** Cópia/documento/blocos/snapshots eliminados; nenhuma ligação de quotes de teste a quotes/projetos reais encontrada, nem documentos de teste identificados sob quotes reais. Plano existente tem 18 linhas mensais de 3.000 € (54.000 €), 31 linhas totais, 221.300 € sem IVA + 50.899 € de IVA = 272.199 €. Meses e valores não foram alterados. Assinatura carregada e visível na Carta; B1 OFF confirmado.
- **Motivo:** Limpar apenas a cópia autorizada e confirmar os dados atuais sem regenerar ou sobrescrever as alterações de Luis.
- **Relatório:** [Housekeeping e assinatura](letter-housekeeping-2026-11-12.md).

### D53 — Identidade numérica desde a lead, revisões e retoma
- **Data:** 12/11/2026, pedido explícito de Luis às 21:29 UTC.
- **Área:** CRM / propostas / projetos / pastas / numeração.
- **Estado:** Regras confirmadas; plano e inventário apenas. Implementação, ponto inicial de 2026 e qualquer renumeração real aguardam aprovação de Luis sobre o mapa exato.
- **Decisão:** Cada lead recebe número ao criar; o mesmo segue para proposta e projeto, com pasta «P + número + nome». Formato novo: dois dígitos do ano original de criação + três da sequência anual (26001, 26002…). Números legados de quatro dígitos, incluindo P2601–P2618, permanecem até decisão explícita. Revisões mantêm número com letra (26019A, 26019B), nunca novo número nem rev1. Trabalho parado/retomado mantém identidade original e informação/histórico na mesma pasta, como nova versão. Números únicos e atribuição concorrente segura; edição manual apenas por administradores com validação no servidor.
- **Por aprovar:** Opção A continua a sequência de pastas em 26019; B conserva a contagem do Hub. Notação original + ano de retoma (22014-26 / 22014-26A) é sugestão, não decisão implementada. Identidades antigas discordantes, anos originais/importados e correspondência de revisões dependem de aprovação por registo. Esta regra substitui o formato anterior de sequência variável para novos trabalhos, sem autorizar renumeração ou reescrita documental histórica.
- **Preservação:** Nenhuma alteração a dados reais, pastas, PDFs enviados, snapshots, horas, custos ou permissões nesta fase; B1 OFF, revisão 10 confirmada. Testes futuros apenas em QUOTE copiada separada segundo D46/D47.
- **Motivo:** Conservar idade e continuidade de cada trabalho ao longo da captação, proposta, projeto e retomas, sem contadores ou pastas duplicadas.
- **Relatórios:** [Inventário integral e mapas A/B](numbering-investigation-2026-11-12.md), [CSV por registo](numbering-inventory-2026-11-12.csv), [Plano para aprovação](../.lovable/plan.md).
- **Aprovação de Luis, 22:13 UTC:** Opção A e implementação do esquema/código aprovadas. Bolshaya=2510; DLMC e Sandycove são o mesmo trabalho 2128; Greg novo é retoma 2530-26. Unir identidade das duas leads Oleiro preservando linhas/históricos. Canónicos: Mastercard2609, Alcanena2608, Alqueva2615, Premium2616, Uralchem2502, CTT2522, BCG2521, Tiago2506, CTR2028, Telheiras0410B; duplicados tornam-se aliases reservados. Mint tem pasta2603 mas relação2678/2680 continua pendente. Letras A…Z/AA e retomas original-ano, segunda retoma -02 confirmadas. Lista de pastas fornecida por Luis é referência para assinalar discrepâncias. Esta aprovação substitui as opções/notações pendentes acima, mas **não autoriza aplicar renumeração nem religações reais antes de apresentar o mapa final e receber novo OK**.
- **Preparação autorizada:** Esquema aditivo e controlos preparados, ativação independente vazia/OFF; nenhuma identidade real atribuída. Oito testes puros e sete verificações numa quote copiada separada com reversão total passaram; contador real129 e B1 OFF preservados. Mapa recalculado: Oleiro26028, Chiado26029, próximo26030, sujeito às colisões de pastas/aliases e Mint pendente. Não declarar implementação integral certificada: ativação/aplicação, concorrência multi-sessão e ciclo completo de interface aguardam os limites descritos no relatório.
- **Mapa final e resultado:** [Antigo → proposto por registo](numbering-final-mapping-2026-11-12.md), [CSV](numbering-final-mapping-2026-11-12.csv), [Preparação e limites](numbering-preparation-result-2026-11-12.md).

- 2026-11-12 D53 ronda 1: correções de Luis aplicadas só ao mapa (v2): 2616/2604 apenas evidência, testes em série QA, contador Hub e South Perth em 26019+ (26019–26033, próximo 26034). Nada aplicado a dados reais.
- 2026-11-12 D53 ronda 2: Quelhas 2520, Cabo Verde 2507, Clinica Mulher 2404, Greg 2530, N10GLED 2524, Sakur 2428, Museu Zer0 2315; lista de pastas reservada. Só mapa v3; nada aplicado.
- **2026-11-12, 23:40 UTC — D53 ronda 3, CRM/numeração/limpeza:** Aethos sem legado recebe 26019 (alias2601); Ericeira loteamento é Ruben y Alba2614 (alias2663), Lagoa separada; Longevity/Mirear Terrace partilha2613 com Miraflores, CBD Zona2 é SOUTH2618, mantendo todos os registos/histórias na futura união. Lead hoteleira já eliminada por Luis retirada do mapa, sem nova eliminação. Mint II2603 com aliases2678/2680, única decisão de identidade pendente: alternativas ou revisões. Oleiro antes de Chiado confirmado. Históricos importados resolvidos na ronda2, retirados das pendências. Dez documentos de teste sem quote propostos em PSA QA QA-017–QA-026, sem aliases, sem alteração real. Sequência v4 coincide exatamente com Luis: 26019–26030, Oleiro26029, Chiado26030, próximo26031. Motivo: identidade de pastas confirmada por Luis, separação de testes e preservação das provas históricas; substitui apenas pendências/cálculos anteriores, sem os apagar.
- **Limpeza específica executada:** Apenas documento Moradia XXL571a89f0-767b-4ea2-8b1b-98fe91f7f141 autorizado, sem quote; eliminação limitada pelo ID/título/ausência de ligação, com cascatas existentes de23 blocos e7 snapshots. Verificação: zero documento/blocos/snapshots desse ID;34 documentos,30 leads,41 quotes,21 projetos,10 documentos QA órfãos preservados, zero identidades reais atribuídas; B1 OFF revisão10. Nenhuma renumeração/religação real executada. SQL exato registado no relatório; a gravação nos diretórios de migrações foi recusada pelo ambiente por se tratar de operação de dados, sem contornar essa proteção.
- **Mapa atual para novo OK:** [v4 — 126 registos, antigo → novo](numbering-final-mapping-2026-11-12-v4.md), [CSV v4](numbering-final-mapping-2026-11-12-v4.csv), [validação e operação autorizada](numbering-round3-result-2026-11-12.md). A aplicação às identidades e à série QA continua por aprovar; limites de certificação da implementação anterior permanecem.
- **2026-11-13, 09:17 UTC — D53 aprovação final de Luis:** Aplicar v4 e resolver Mint identidade2603, quote b37ab9e5 primeira2603, quote37ebfc12 revisão2603A, aliases2678/2680; séries QA-001–026, uniões de identidade e reservas confirmadas. Nada por decidir nas identidades. Preservar todas as linhas/histórias, valores, meses, pagamentos, contratos, permissões, horas e PDFs/snapshots existentes; números anteriores pesquisáveis. Aplicação transacional reversível com backup; ativar numeração só se todas as verificações passarem, senão OFF; B1 OFF. Esta aprovação substitui o limite de aplicação pendente acima, sem apagar os mapas anteriores.
- **Execução e limite:**126 registos associados (30 leads,41 quotes,21 projetos,34 documentos),64 identidades incluindo26 QA, zero não aplicados/duplicados, próximo26031. Before-images e hashes duráveis; igualdade dos dados protegidos confirmada dentro da transação. Numeração **OFF**: a conferência posterior de ativação encontrou diferenças em email_events/email_sync_state/intake_source_runs; não alterar o backup nem enfraquecer o controlo. B1 OFF. [Relatório de aplicação e reversão](numbering-application-result-2026-11-13.md).
- **2026-11-13, 11:13 UTC — autorização de ativação e resultado:** Luis autoriza excluir exclusivamente email_events/email_sync_state/intake_source_runs após confirmar independência da numeração. Verificadas colunas, políticas, triggers, funções e consumidores: sem leitura/escrita de números, ordinais, versões ou aliases; 15 novos registos Gmail desde a salvaguarda, cursor de correio atualizado e 64 recolhas regulares bem-sucedidas (zero itens). O corpo do correio pode naturalmente conter referências, mas não há ligação estruturada ou resolução de numeração nesses processos. A conferência mantém as comparações originais dos126 registos e acrescenta conjuntos exatos de identidades/versões/aliases/reservas e auditoria, sem modificar o backup. **Ativação recusada:** além das três exclusões autorizadas, mudaram financial_documents, financial_document_payments, marketing_settings e marketing_ig_comments. Paragem sem novas exclusões, eliminação ou alteração desses dados; numeração OFF e B1 OFF. Reversão protegida continua disponível. Motivo: não transformar autorização limitada de sincronização numa dispensa de proteção financeira/editorial. [Relatório de aplicação e reversão](numbering-application-result-2026-11-13.md).


### D54 — Hotel Chiado: redação autorizada após retoma
- **Data:** 13/11/2026, aprovação de Luis às 14:22 UTC.
- **Área:** Proposta Hotel Chiado / texto documental.
- **Decisão:** Aplicar exclusivamente os itens A–I fornecidos por Luis nos nove blocos de texto da proposta principal: PSA autora/coordenadora, parceria com designer de interiores indicado pelo Cliente, sem referências ao antigo projeto entregue nem ao Rockwell; recuperar parágrafos/listas/rótulos da Descrição, preservando a redação nova. Texto da assistência: 3 500 €/mês × 12 = 42 000 €, sem escrever valores ou linhas financeiras.
- **Preservação:** Rev 00 Draft sem nova letra; nenhuma alteração a numeração, aliases, honorários guardados, meses, pagamentos, Gantt, permissões ou outra quote. B1 OFF. Comparações efetuadas dentro de uma única transação; nenhuma exclusão adicional no mecanismo D53, que permanece intocado.
- **Resultado:** 22 itens encontrados/aplicados; nove blocos alterados e 18 intactos; zero termos proibidos nos 27 blocos atuais. Histórico anterior preservado; gravação automática da sessão não constitui nova revisão.
- **Motivo:** Refletir o âmbito editorial aprovado para a retoma, preservando integralmente os dados comerciais e operacionais.
- **Relatório:** [Cada substituição e conferências](chiado-authorized-text-edits-2026-11-13.md).

### D55 — Chiado e Oleiro: CGI, medições e sequência documental
- **Data/área:** 13/11/2026, seguimento aprovado por Luis às 14:30 UTC; propostas/documentos.
- **Decisão:** Chiado inclui seis CGI de conceito no Estudo Prévio; excluem-se apenas imagens adicionais. Ambos incluem Medições/Mapa de Quantidades de arquitetura na Execução, com prevalência expressa sobre artigo2.5 dos Termos Gerais. Reordenar e usar capítulos autónomos conforme listas de Luis e referência Alqueva, sem importar secções alheias aos trabalhos. Chiado inclui abertura de Fase de Obra e concurso documental ligado à fase existente; PSA prepara documentos e apoia concurso. Adaptar informação de Execução/Assistência ao concurso aprovado, manter serviços adicionais e tabela como uma secção, suspensão20.1, separar validade/aceitação e anexos A pagamento/B programa/C termos.
- **Preservação/resultado:** 57 blocos existentes alterados exclusivamente em texto/título/posição/tipo documental; quatro novos blocos Chiado; zero eliminações. Ambos Rev00Draft. Totais semIVA Oleiro221300€/Chiado332050€ inalterados; quotes/documentos completos idênticos e conferência transacional dos dados protegidos aprovada. Nenhum valor, mês, linha de pagamento, Gantt, numeração, contrato, permissão, hora, snapshot ou outra quote alterado; B1OFF e ativaçãoD53 intocada.
- **Motivo:** Refletir o âmbito e a estrutura editorial expressamente aprovados sem alterar planeamento/comercial. Índices automáticos confirmados por leitura autenticada; seis testes existentes passaram. PDF/paginação final não certificados nesta tarefa.
- **Relatório:** [Índices lado a lado, alterações e preservação](chiado-oleiro-followup-2026-11-13.md); imagens antes/depois na migração0324 espelhada, para recuperação revista.

### D56 — Oleiro: seis CGI incluídos no conceito
- **Data/área:** 13/11/2026, autorização de Luis às 15:52 UTC; texto da proposta Oleiro.
- **Decisão/resultado:** Acrescentada «6 imagens 3D (CGI) ilustrativas do conceito de arquitetura.» aos entregáveis do Estudo Prévio; «Imagens 3D;» substituída por «Imagens 3D para além das 6 incluídas no Estudo prévio;» nas Exclusões (HTML e texto). Ambos encontrados e confirmados nas páginas pela sessão autenticada.
- **Preservação:** Referências PIP de Oleiro/Chiado e todos os outros blocos idênticos; comparação transacional de todos os dados protegidos aprovada, sem exclusões de tabelas adicionais nem alteração da ativação D53. Total 221 300 € sem IVA, Rev00Draft e B1OFF preservados; nenhum valor, pagamento, Gantt, número, snapshot ou outra quote alterado.
- **Motivo/evidência:** Alinhar exclusivamente o âmbito CGI com o aprovado por Luis; migração0325 espelhada contém imagens anteriores para recuperação revista.

### D57 — Hotel Chiado: descrição do edifício e quadro de áreas
- **Data/área:** 13/11/2026, autorização de Luis às 17:13 UTC; texto documental Hotel Chiado.
- **Decisão/resultado:** Substituído exclusivamente o parágrafo reservado da Descrição do Projeto pela redação fornecida, tabela de dois campos (480/1840/435/210 m², total2965 m² a negrito) e indicação de áreas aproximadas pelo promotor. Encontrado/aplicado; tabela confirmada nas Páginas com sessão autenticada e estilo partilhado do documento.
- **Preservação:** NOTA, listas e todo o HTML fora da substituição idênticos; restantes blocos e dados protegidos iguais dentro da transação. Apenas content_rich e updated_at automático do bloco alterados. Total332050€ semIVA, Rev00Draft, PIP, pagamentos, Gantt, numeração e outras quotes preservados; B1OFF. Primeira tentativa revertida integralmente pelo controlo de updated_at; segunda passou sem alargar exclusões de dados comerciais.
- **Motivo/evidência:** Completar apenas o espaço reservado autorizado; [relatório](chiado-building-areas-2026-11-13.md), migração0326 espelhada com imagem anterior para recuperação revista.


### D58 — Fluxo gráfico partilhado de propostas
- **Data/área:** 13/11/2026, aprovação de Luis às18:58UTC; apresentação/PDF.
- **Decisão:** Prosa sempre pelo topo; títulos com início do texto, frase introdutória com lista, viúvas/órfãs mínimas2; longos blocos/listas divisíveis e tabelas por linha com cabeçalhos repetidos. Título limitado à coluna, pt-PT/hifenização/última linha ao início, índice com colunas fixas. Mesmo conjunto paginado para Páginas/Preview/PDF.
- **Preservação:** Normalização só na apresentação, sem guardar propostas, texto, valores, pagamentos, Gantt, números ou ordem; Capa/Carta e quebras explícitas mantidas. B1 intocado/OFF.
- **Resultado/motivo:** Chiado36→36, Oleiro37→37, Alqueva32→32 no mesmo conteúdo capturado; contagens físicas PDF e paridade confirmadas. Eliminar conteúdo indevidamente deslocado ao fundo, sem concorrer com as edições de Luis. PDF histórico38 páginas não fornecido; não usado como base idêntica.
- **Relatório:** [Verificação e limites](proposal-layout-flow-report-2026-11-13.md).
