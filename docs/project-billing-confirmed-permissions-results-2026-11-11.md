# Faturação — permissões confirmadas e resultados

D39, 11/11/2026. B1 OFF, auditoria revisão 10. Luis resolveu as perguntas: manter autorização separada de fornecedores; correções emitidas no editor fiscal existente.

## Entrega desta revisão

- Financials do projeto permite plano, descrição, datas auditadas, juntar/desfazer previsões.
- Capacidade fiscal protegida atribuída exclusivamente a Luis/Tatiana; sem nomes/emails nas condições de autorização nem papéis gerais alterados.
- Guardas de documentos/linhas/pagamentos e estados operacionais impedem atos fiscais de outras contas mesmo com concessões Finance antigas. Leituras e documentos de compra permanecem separados.
- Editor fiscal existente preservado; emitidas continuam bloqueadas nas ações de planeamento.
- Políticas de ficheiros intactas. Sem preenchimento de planos reais ou integração InvoiceXpress.

## Testes atuais — só cópia e conta descartáveis

| Verificação | Resultado |
|---|---|
| Conta Financials: plano, descrição guardada, data prevista auditada | Passou |
| Fornecedores sem autorização adicional | Não devolvidos, passou |
| Juntar e desfazer duas parcelas 5 000 | Passou, releitura confirmada |
| Conta com concessão Finance antiga: emissão pelo RPC | Recusada, passou |
| Emissão por Luis sem PDF | Passou, documento único ligado a marco e releitura UI |
| Conta descartável tenta editar emitida | Nenhuma linha alterada, passou |
| Conta descartável tenta inserir pagamento | Recusado por guarda fiscal, passou |
| Editor fiscal para conta descartável | Recusado, passou |
| Atualização direta de estado pela conta descartável | Zero linhas alcançadas; guarda adicional instalada |
| Seis testes puros | 6/6 |
| i18n / compilação | Zero candidatos / OK |
| Cópia atual: projeto/documento/pagamentos/conta/ficha | Leitura independente zero após limpeza |
| Apenas dois titulares fiscais | Luis/Tatiana confirmados por leitura |
| B1 | OFF, revisão 10 |

## O que não está certificado

PDF opcional de grupo, emissão integral de grupo/concorrência, conciliação parcial/integral, avenças/conversão/calendário no novo ecrã e fluxos de intake completos não foram concluídos nesta revisão. Tatiana tem capacidade confirmada, mas não foi testada por impersonação de conta real. O teste de editor foi de recusa para a conta descartável, não de edição real por Tatiana.

Uma linha órfã protegida de histórico QA de uma sessão anterior permanece: nenhuma proteção imutável foi desativada. A cópia atual não criou histórico comercial órfão. Não declarar limpeza histórica completa nem segurança para publicação. Achados de segurança anteriores continuam pendentes de investigação/autorização.

## Ficheiros alterados nesta revisão

- docs/DECISIONS.md (D39, clarificação D38 e escolhas confirmadas)
- docs/project-billing-permissions-review-2026-11-11.md
- docs/project-billing-confirmed-permissions-results-2026-11-11.md
- roadmap.md
- src/lib/finance/AGENTS.md
- src/lib/finance/use-billing-plan.ts
- src/components/finance/project-billing-tab.tsx
- drizzle/migrations/0289_project_billing_confirmed_access.sql
- supabase/migrations/20261111222800_project_billing_confirmed_access.sql
- drizzle/migrations/0290_billing_schedule_fiscal_status_boundary.sql
- supabase/migrations/20261111224300_billing_schedule_fiscal_status_boundary.sql
- Tipos regenerados automaticamente e memória da decisão.

As duas migrações têm cópias byte-idênticas. Atribuição dos dois atores fiscais feita separadamente pela ferramenta de dados; nenhum projeto/fatura/pagamento real alterado.
