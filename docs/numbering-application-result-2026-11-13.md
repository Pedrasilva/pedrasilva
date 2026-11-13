# D53 — aplicação v4 + decisão Mint

13 novembro 2026. Autorização de Luis às 09:17 UTC.

## Resultado

| Tipo | Registos associados à nova identidade |
|---|---:|
| Leads | 30 |
| Quotes | 41 |
| Projetos | 21 |
| Documentos | 34 |
| Total | 126 |

64 identidades distintas: 38 comerciais e 26 PSA QA (QA-001–QA-026). Zero registos não aplicados, zero identidades com o mesmo número, zero registos sem identidade. Canónicos e aliases aprovados e reservas de pastas aplicados. As uniões são apenas de identidade: nenhum registo, histórico ou documento eliminado.

Mint: b37ab9e5 →2603, 37ebfc12 →2603A. Lead/projeto/documentos identificados como2603; documento ligado à segunda quote usa2603A. Oleiro26029, Chiado26030; Greg2530, retoma2530-26. Próximo número26031; contador da nova sequência30. O antigo contador não foi reescrito.

## Preservação

A aplicação ocorreu numa única transação, com bloqueio das quatro tabelas e before-images duráveis em `crm_work_mapping_backups`, lote `D53-v4-final-2026-11-13`. Alterou exclusivamente `work_version_id`, os ordinais vivos de quotes/documentos e timestamps automáticos. Os campos antigos `proposal_number` e `revision_number` permanecem evidência histórica: as novas apresentações resolvem a referência central, sem reescrever contratos, hashes ou snapshots. O backup guarda o mapa efetivamente executado e os valores originais.

A igualdade de todos os restantes campos nas quatro tabelas e hashes das restantes tabelas públicas foi confirmada **dentro da transação de aplicação**. Valores, meses, pagamentos, contratos, permissões, horas, textos, PDFs enviados/aceites e snapshots não foram alterados pela operação. Números errados2616 em Alqueva,2604 em Costa Vicentina e2600 em Quelhas ficam evidência, não aliases desses trabalhos. QA não conserva aliases comerciais.

## Ativação — OFF

A ação final voltou a conferir os126 registos e todas as referências; passou essa parte, mas recusou ativar quando a comparação global encontrou mudanças posteriores em `email_events`, `email_sync_state` e `intake_source_runs`. São registos de sincronização/intake, não campos renumerados; a causa exata das alterações posteriores não foi certificada. Não enfraquecer o controlo nem atualizar o backup para fazer passar a conferência. **Numeração continua OFF**, conforme a instrução «otherwise leave it OFF and report». **B1 continua OFF**, revisão10. Nenhum item de identidade permanece por decidir; fica apenas a ativação bloqueada pela conferência temporal global.

## Verificações

- 10 testes puros de referência e sequência passaram; 8 testes do mapa histórico v4 passaram (mapa v4 preservado como documento histórico, decisão Mint no mapa final JSON).
- Teste transacional de criação numa lead copiada separada atribuiu26031 e reverteu tudo: não consumiu número nem deixou fixture.
- Sessão autenticada na interface: quote descartável QA-016 apresentou a referência; pesquisa26117 devolveu a identidade26029 e os quatro registos associados. Nenhum formulário real foi editado no teste.
- Idiomas EN/PT em paridade, zero novos candidatos i18n; última compilação OK.
- Numeração única garantida por identidade/registro central; versões e ordinais de quotes únicos. Aliases antigos pesquisáveis com as permissões existentes do chamador.

## Reversão

A ação service-only `crm_work_rollback_d53(actor)` desliga a numeração e repõe os links/ordinais originais do backup, sem eliminar dados/identidades/reservas. Recusa se houver alterações posteriores às linhas ou números novos atribuídos: nesse caso requer revisão localizada para não sobrescrever trabalho posterior. Não foi executada. Backup service-only protegido por RLS, sem acesso anónimo/autenticado nem TRUNCATE.

## Ficheiros

Migrações idênticas em drizzle e supabase0316–0321; mapa final `numbering-approved-map-2026-11-13.json`; resolver de live-data e cinco pontos do composer; pesquisa `work-number-search.tsx` e CRM shell; mensagens EN/PT; testes numéricos; regras CRM; decisões e roadmap. Nenhum snapshot/PDF guardado reescrito. O mapa efetivamente aplicado também fica no backup durável.
