# Item 5 — Fase A preparada, corte NÃO aplicado

3 novembro 2026. Após limpeza e item 2. Tabelas de acesso e auditoria, ações admin/defaults e equipa com quatro switches propostos implementados. Não atribuí Rita/Mint; nenhuma linha real de equipa/acesso foi alterada.

## Ponto de aprovação
`pm_project_access_cutover_active()` = **false**. Switches dizem explicitamente “Acesso proposto”; políticas financeiras anteriores permanecem efetivas. Fechado já o caminho de autoatribuição: team_write removido; alterações de equipa exigem ação auditada e admin. Esta segurança administrativa não ativa o corte financeiro.

A matriz completa está em [access-matrix.csv](project-access-phase-a/access-matrix.csv): **14 contas × 21 projetos × 4 áreas = 1 176 linhas**. Expõe predicado atual de faturas, predicado financeiro global legado, resultado proposto e perda potencial. Não trata SELECT demasiado amplo como autorização legítima nem aplica automaticamente grants legacy.

### Resumo das perdas potenciais
| Pessoa | Projetos com acesso atual a faturas | Projetos com Financeiro proposto | Combinações área/projeto potencialmente perdidas |
|---|---:|---:|---:|
| Adalberto Duarte | 0 | 0 | 0 |
| Bernardo Nadais | 4 | 1 | 3 |
| Francisco Oliveira | 0 | 0 | 0 |
| Irene Cunha | 21 | 0 | 84 |
| João Almeida | 0 | 1 | 0 |
| Luis Pedra Silva | 21 | 21 | 0 |
| Mariana Oliveira | 0 | 0 | 0 |
| Patricia Reis | 3 | 0 | 3 |
| Ricardo Cabrita | 0 | 0 | 0 |
| Ricardo Conceição | 21 | 1 | 20 |
| Rita Saragoça | 0 | 0 | 0 |
| Tatiana Shchenina | 21 | 21 | 0 |
| luispedrasilva@gmail.com | 0 | 0 | 0 |
| teresa@pedrarioja.com | 0 | 0 | 63 |

**Atenção:** linha Teresa mede a exposição do helper legado, não acesso autorizado ao projeto PSA. A matriz é uma prévia de predicados; avaliação de políticas dependentes do seletor de entidade, despesas próprias/aprovações e identidade ambígua exige validação final por superfície antes de autorizar o corte. Não aprovar perdas em bloco sem escolher preservações/exceções. Luis e Tatiana mantêm tudo por permissões protegidas; sem nomes/IDs no código de autorização. Nenhum conflito de múltiplos gestores encontrado (lista vazia).

## Preparado
- `pm_project_person_access`: quatro flags, proveniência/revisão, autor/motivo. `pm_project_access_audit` append-only. Grants/RLS/revoke TRUNCATE explícitos.
- Defaults novos: gestor Financial ON, outros OFF; membro/apoio/coordenador/coautor todos OFF. Gestores históricos sem linha têm somente prévia Financeiro ON; sem backfill nem escolha automática.
- Gestor nomeado e flags apenas ações admin auditadas, revisão otimista em flags; papel manager conflituante rejeitado.
- Helper central datas preparado para Finance OR gestor próprio com Financial ON quando gate estiver ativo.
- Políticas restrictivas **inativas por gate** em pm_invoices, itens, pm_payment_schedule_items, baseline e filhos, pm_expenses e pm_stage_supplier_costs. UI dos switches disponível ao admin; ocultação de tabs por área ainda **não ativada**.

## Não ativar ainda / pendências antes do corte
A implementação não constitui cobertura financeira completa: projeção item 2 ainda precisa cortar leitores legados no momento aprovado; completar demais filhos/anexos/fornecedores/saídas e RPCs SECURITY DEFINER antes de efetivar isolamento; novos grants por área precisam substituir políticas permissivas antigas para conceder a um PM sem permissões globais. Ativar apenas o gate agora não basta. Navegação e deep links continuam regras anteriores até essa conclusão/aprovação.

Fase B não construída: SELECTs mistos pm_projects/pm_stages/propostas/horas/recursos, overview/cabeçalho/budget/insights/avença/inspetor, global Gantt e home strips, forecast, reports, pesquisa, exports/PDFs, texto de documentos/notas e URLs. Estas superfícies podem revelar valores apesar das futuras flags; não afirmar isolamento total na Fase A.

## Testes e evidência
Fixture única eliminada: manager Financial ON, restantes OFF; alteração proposta de Expenses; revisão antiga negada; INSERT direto de papel negado mesmo para admin fora da ação; auditoria não editável. Admin UI PT/EN capturada na fixture; nenhum switch real alterado. Bernardo date-only helper testado na fixture (sem Finance global): override permitido, montante e team change negados e outra Mint negada.
Nove testes permanentes + parity/AST sem novos literais + build OK. Não houve teste simultâneo de concorrência nem corte simulado com contas reais. Leitura zero em 20:40:42 UTC: **projects/proposals/opportunities/allocations=0/0/0/0**, access rows=0, audit=0.

## Ficheiros e migrações
0225 staging, 0226 identidade matriz, 0227 gate financeiro; mirrors `supabase/migrations/2026110320{38,40,43}00_*.sql`; tipos regenerados. `src/lib/projects/use-project-access.ts`, `use-project-team.ts`, `src/components/projects/project-team-card.tsx`; traduções EN/PT projects, AGENTS, roadmap.

![Equipa PT](project-access-phase-a/team-access-pt-PT.png)
![Equipa EN](project-access-phase-a/team-access-en.png)

## Decisões de Luis — 3 novembro, 20:52 UTC

Esta secção substitui as preservações e a proibição Rita/Mint acima. **Corte continua OFF.** Não autoriza ainda o corte, nem a Fase B.

- Quatro capacidades globais explícitas guardadas pela ação admin `pm_change_global_financial_capability`: Luis Pedra Silva, Tatiana Shchenina, Irene Cunha e Ricardo Conceição (`ricardo@pedrasilva.com`, não Ricardo Cabrita). Quatro auditorias com autor e razão. Nenhum nome/ID na lógica de autorização; a atribuição é um registo protegido. Não concede administração nem escrita Finance.
- Patricia Reis e Bernardo Nadais seguem as regras por projeto; retirado do predicado proposto o fallback automático `finance.dashboard/all`.
- Rita Saragoça adicionada como manager de **Clinica Mint II**, quatro flags ON, pelas duas ações auditadas, motivo exato **Approved by Luis 2026-11-03**. Projeto/fases/prestações/faturas/despesas/custos de fornecedores/baseline comparados antes/depois: iguais. Não alterámos outro dado comercial ou de planeamento da Mint.
- **Sim, vários membros da equipa podem ter switches ON**, sem serem PM. Teste numa única fixture: dois membros `support`, defaults OFF, ambos Financials/Expenses ON por admin, auditoria e limpeza verificadas.

### Matriz atualizada
[CSV completo — 1 176 combinações](project-access-phase-a/access-matrix-decisions.csv). Financials usa o predicado atual de faturas; outras áreas usam o helper legado, explicitamente como risco de exposição e não como prova de autorização.

| Pessoa | Financeiro antes | Financeiro proposto | Perdas potenciais de predicado |
|---|---:|---:|---:|
| Adalberto Duarte | 0 | 0 | 0 |
| Bernardo Nadais | 4 | 1 | 3 |
| Francisco Oliveira | 0 | 0 | 0 |
| Irene Cunha | 21 | 21 | 0 |
| João Almeida | 0 | 1 | 0 |
| Luis Pedra Silva | 21 | 21 | 0 |
| Mariana Oliveira | 0 | 0 | 0 |
| Patricia Reis | 3 | 0 | 3 |
| Ricardo Cabrita | 0 | 0 | 0 |
| Ricardo Conceição | 21 | 21 | 0 |
| Rita Saragoça | 0 | 1 | 0 |
| Tatiana Shchenina | 21 | 21 | 0 |
| luispedrasilva@gmail.com | 0 | 0 | 0 |
| teresa@pedrarioja.com | 0 | 0 | 63 |

### Teresa — verificação efetiva, só leitura
Sessão autenticada própria da conta Teresa: **zero linhas, sem erros** em `financial_documents`, `financial_document_lines`, `pm_invoices`, `pm_invoice_items`, `pm_payment_schedule_items`, baseline/filhos, `pm_expenses`, `pm_stage_supplier_costs`. `is_psa_staff=false`; projeção Mint `pm_project_incoming_timing` rejeitou com **Forbidden**.

Políticas: `Authorized read pm_invoices` e `Authorized read pm_payment_schedule_items` exigem PSA + entidade/permissão financeira (ou admin); baseline/filhos e fornecedores têm restrição `psa_staff_only`; despesas também `psa_staff_only`. O helper legado verdadeiro não ultrapassa essas restrições. Portanto **não ficou demonstrada leitura de linhas financeiras PSA hoje e não foi aplicada correção Teresa**.

Listagem limitada de oito ficheiros autorizados em `financial-documents`: cruzamento administrativo confirmou todos como **Pedra Rioja**, via `psa_staff_or_own_finance_files`/`fin_storage_visible`, não PSA. Não é uma auditoria exaustiva de cada URL, ficheiro órfão ou servidor privilegiado.

### Condições versus offset — nenhuma correção aplicada
[Todas as 96 divergências, com ID/termos/offset atual/proposto](project-access-phase-a/payment-terms-offset-review.csv): Alcanena **6**, Mastercard **80**, Ericeira **3**, Mint **7**. Todas propõem **0 → 30 dias de calendário**; sete Mint incluem FT02–08, não apenas FT02–04 da observação anterior. [Termos não interpretáveis](project-access-phase-a/payment-terms-uninterpreted.csv): **0** entre linhas com termos não vazios. Linhas sem termos não permitem inferir offset. Ambas as direções foram incluídas. A lista preserva estado fiscal; qualquer futura correção necessita aprovação e deve respeitar congelamentos.

### Proteção preparada nesta entrega (inativa até ao corte)
- Projeção item 2 corta o helper legado **apenas quando ON**. Finance/PM date-only permanece separado de montantes/IVA/termos/emitir/pagar.
- Grants SELECT por área e barreiras restritivas para invoices/itens, prestações, baseline/filhos, despesas, fornecedores, materiais, baselines comerciais e de fase. Os antigos SELECT permissivos ainda existem, mas a barreira ativa impede que ultrapassem as flags; não retirar políticas ALL que também protegem escrita.
- Filhos despesas: eventos, invoice/receipt/credit allocations; obrigações/reimbursement allocations e lotes exigem Expenses em todos os projetos incluídos para impedir totais indiretos.
- Ações `pe_action`, `pe_link_queue`, `pe_confirm_intake`, `pe_save_intake` recebem guarda gated sem substituir validação fiscal, claims, ownership ou autorização de escrita existente. Internos `pm_incoming_resolve`, `pe_event`, `pe_obligation_sync`, `pm_invoice_regroup`, `pm_invoice_apply_group` mantêm EXECUTE cliente revogado.
- Comprovativos já ligados a despesas herdam Expenses na leitura de Storage, incluindo ficheiros partilhados. Uploads sem vínculo e outros documentos mantêm as regras anteriores; não foi aplicado bloqueio global ao bucket.
- Navegação/deep links usam mapa partilhado e projeção viewer; conteúdo financeiro aguarda autorização e flags entram apenas quando ON. Overview/Gantt mistos continuam Fase B.

### Checklist final — NÃO dar go ainda
- [x] Quatro exceções auditadas, Rita/Mint autorizada, matriz revista e vários membros ON comprovados.
- [x] Teresa: contagens efetivas e políticas verificadas; zero PSA nas tabelas testadas; nenhuma correção aplicada.
- [x] 96 divergências listadas sem escrita de offsets/termos.
- [x] Item 2 read boundary, filhos principais, grants/barreiras, ações de despesas e leitura de comprovativos preparados.
- [x] Nove testes Vitest passaram; defaults/auditoria e dois grants não-PM verificados na fixture única; migrations mirrors idênticos; build OK.
- [ ] **Antes do go:** testar regras ON em ambiente isolado/transaction rollback (sem ativar gate real): matriz de utilizadores, parent/child/lotes, anexos e RPCs, PM com Financial ON e montante bloqueado. O gate real nunca foi ativado nem simulado sobre dados reais nesta entrega.
- [ ] **Antes do go:** verificar páginas completas PT/EN com carregamento terminado e fixtures, Finance issued-document/queue/attachment server paths e eventuais leitores privilegiados. A captura desta sessão ainda mostra pedidos em carregamento; não constitui prova visual final.
- [ ] **Antes do go:** revisão completa dos contextos de baseline (snapshot contém várias áreas), grants por Budget e Suppliers, e compatibilidade Finance invoice editor para leitores sem Finance global. Restrições de página por flags não concedem automaticamente acesso ao módulo Finance.
- [ ] Aprovação final explícita de Luis; só depois preparar ação de corte com comparações/rollback.

Fase B permanece: tabelas mistas/propostas/snapshots/horas/recursos, Overview/Gantt/home/insights/forecast/reports/search/exports/PDFs, documentos/notas/URLs e servidores privilegiados não inventariados integralmente. **Não afirmar isolamento completo nem prontidão final**; as verificações abertas não dependem de autorização de corte e ainda precisam ser concluídas.

### Ficheiros adicionais/evidência
Migrações **0229–0235**, mirrors `supabase/migrations/2026110321*.sql`; `project-area-tabs.ts`, `use-project-access.ts`, detalhe projeto, testes `test-project-area-tabs.test.ts` e `test-project-access-decisions-e2e.py`. Capacidades/auditoria global protegidas; cutover OFF. Teste repetido após última migração; nove testes e sete mirrors byte-identical passaram. Leitura final **21:34:34 UTC**: projects/quotes/opportunities/allocations/access descartáveis **0/0/0/0/0**; quatro capacidades e auditorias reais aprovadas preservadas, duas auditorias Mint preservadas. Build OK 21:34:26 UTC.

## Fecho da aprovação 21:41 UTC — corte real OFF
- **96 correções aprovadas aplicadas e auditadas**, só offset, sem outros campos/linhas alterados: [auditoria](project-access-phase-a/payment-offset-correction-audit.csv). Proposta convertida descartável verificou interpretação e aviso sem data quando ilegível; eliminada.
- [Matriz final — 1 176 combinações](project-access-phase-a/access-matrix-final.csv). As atribuições globais, Rita/Mint e perdas de Patricia/Bernardo não mudaram nesta entrega. A matriz continua prévia de predicados, não certificação das superfícies mistas da Fase B.
- Barreira para baseline bruto exige **Financials + Budget/custo + Suppliers**, pois a mesma linha contém as três áreas; filhos herdam a restrição do pai. A projeção de datas contratuais mantém acesso Financials separado, sem revelar custos de baseline.
- Completadas barreiras gated para documentos/linhas/queue ligados a projetos, respetivos anexos, settings de projeto, obrigações/lotes/filhos. Grants por área passam a permitir membros autorizados sem Finance global. Políticas permissivas antigas continuam para comportamento OFF/escritas; as restritivas ON impedem ultrapassar flags. Não foram removidas políticas ALL de escrita.
- Guardas dentro de `pe_match_purchase`, directory, aprovações legadas e confirmação queue; OCR de compras usa download autorizado, não serviço privilegiado; PDF de projeto/recibo exige área antes de OCR; destinos de confirmação de recebimento são lidos como o chamador antes de escrever. Financeiro legado também precisa Financials para editar datas quando ON.

### Teste isolado ON — passou 121 verificações
Uma única fixture de projeto de cada vez, em subtransação privilegiada. A definição ON só existiu dentro da transação e nunca ficou visível às outras sessões; exceção controlada reverteu **definição da função, projeto e todos os filhos/auditorias**. Sem alterar contas, roles, capacidades ou dados de projetos reais.

Seis modos (tudo OFF, cada área isolada, tudo ON), identidade de PM sem Finance global, exceção global e identidade não-PSA: parent/child de invoices, inflow/outflow, fornecedor, baseline multi-área, despesas/eventos, obrigações/lotes/alocações, documento/linha/queue, guards de ficheiros partilhados, projeção de datas, override permitido/montante negado, ações de despesa/matching negadas e parser. **121 verificações**, `rolledBack=true`, `gateOff=true`. Fonte permanente `scripts/test-project-cutover-on.sql`; instalador 0239 com adaptação 0240. Falhas iniciais de contexto de despesa/caminho de ficheiro foram integralmente revertidas e corrigidas antes do PASS.

**Limites que não são PASS:** guardas de anexos foram exercidas com caminho de teste, não download de bytes em Storage ON; nenhum lote com dois projetos foi criado (restrição uma fixture); capturas finais PT/EN são Mint só leitura/OFF, não uma sessão de PM com corte ON; concorrência fiscal/financeira e exportações/PDFs não foram exercidas integralmente. Compatibilidade completa do editor fiscal para todos os utilizadores sem Finance global e restantes leitores mistos continuam por comprovar. Não afirmar isolamento total nem dar go automático.

### Checklist para a decisão final
- [x] 96 offsets =30, auditoria/exata igualdade dos restantes campos.
- [x] Conversão com termos reconhecidos/ilegíveis, sem guesses; fixture apagada.
- [x] Quatro capacidades globais e Rita/Mint preservadas; vários membros ON; matriz final disponível.
- [x] Fronteiras puramente financeiras, filhos, baseline multi-área, RPCs identificados, queue/anexos/settings preparados e teste isolado ON de 121 regras passado.
- [x] Corte real OFF após rollback; zero lido em **21:55:08 UTC**: projetos/propostas/oportunidades/fases/prestações/despesas/queue **0/0/0/0/0/0/0**.
- [x] Páginas completas PT/EN de Recebimentos, sem loading; testes de regras/editor fiscal e traduções.
- [ ] Antes de certificar cobertura integral: download Storage ON, lote multi-projeto, PM UI ON/compatibilidade fiscal e concorrência; sem PASS inventado.
- [ ] **Go explícito de Luis ainda não recebido.** Não ativar gate. A ação de corte e rollback deve preservar estas comparações.

Fase B mantém todas as exposições mistas já listadas (home/Gantt/overview/horas/recursos/snapshots/forecast/report/search/export/PDF), incluindo antiga previsão de saídas baseada em propostas; não autorizada nesta entrega. O alcance validado é Fase A descrito acima, não privacidade financeira total da aplicação.

Ficheiros novos: `project-incoming-reader.ts`, testes do leitor, manifesto e conversão; alterações `recebimentos.server/functions`, `purchase-ocr.functions`, `issued-pdf.functions`, `project-expense-queue.functions`, `use-provisional-invoicing`, leitores de entradas Finance; traduções EN/PT e regras locais. Migrações **0236–0244**, mirrors idênticos. Capturas [PT](project-access-phase-a/final-incoming-pt-PT.png)/[EN](project-access-phase-a/final-incoming-en.png).

Leitura final **21:58:51 UTC**: projetos/propostas/oportunidades/fases/prestações/despesas/queue descartáveis **0/0/0/0/0/0/0**; **96 auditorias** confirmam igualdade integral antes/depois removendo somente `payment_offset_days`. Último teste isolado: 121 verificações, rollback e gate OFF. **16 testes Vitest**, parity EN/PT e AST sem novos literais passaram; nove mirrors byte-identical; build OK **21:58:40 UTC**.
