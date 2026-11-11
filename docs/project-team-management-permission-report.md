# Gestão de equipas de projeto — 11 novembro 2026

## Decisão e diagnóstico
Não existia uma permissão atribuível: `ProjectTeamCard`, `pm_preview_project_access`, `pm_change_project_access`, `pm_change_project_team` e `pm_team_admin_guard` exigiam administrador. Acesso financeiro não concedia gestão de equipas.

Nova capacidade individual `projects.manage_teams`, âmbito `all`, em **Definições → Permissões → Por conta → escolher pessoa → Acrescentar exceção → Projetos → Gerir equipas de projeto → Tudo → Conceder**. Não foi atribuída a Ricardo, Irene ou qualquer conta real. A atribuição e revogação continuam exclusivas de administradores.

## Implementação
- Ações auditadas existentes reconhecem a nova capacidade no servidor, independentemente de B1; mantêm motivos, revisão, conflitos de gestor, valores por defeito e proteção do histórico.
- Catálogo de permissões e diálogo partilham essa autorização; a lista de pessoas devolve apenas identidade/apresentação, sem salários ou preços.
- Cada um dos quatro interruptores tem ajuda em EN e PT-PT; Financeiro explica também edição do Gantt e preços horários derivados.
- Registo de decisão: [D32](DECISIONS.md#d32--gestão-de-equipas-delegável-sem-administração-geral).

## Verificação
- **Servidor:** teste numa transação integralmente desfeita, com identidade aleatória sem alteração a contas existentes: capacidade concedida → diretório, adição, quatro acessos e remoção permitidos; auditado com a identidade do delegado. Autoconcessão e escrita direta sem ação auditada recusadas. Depois da revogação: diretório, pré-visualização, equipa e alterações de acessos recusados. Script repetível em `scripts/test-project-team-management.sql`.
- **Interface autenticada como Luis:** projeto descartável, adição de pessoa, quatro acessos ON, recarregamento com os quatro valores guardados, ajuda PT-PT/EN e remoção; seis linhas de auditoria. Ecrã de permissões mostra a nova opção com âmbito Tudo; não foi carregado Conceder. A preferência de idioma foi simulada só no navegador, sem alterar a preferência real de Luis.
- **Limite da verificação:** delegação exercitada nas ações reais do servidor com identidade sintética na transação; não foi criada nem iniciada sessão numa nova conta de autenticação delegada. A interface de equipa foi testada com a sessão de administrador existente.
- **Testes:** 7 testes Vitest passaram; paridade EN/PT e auditoria sem novas cadeias não traduzidas passaram; aplicação sem erros de compilação.
- **Leitura independente final:** 0 projetos e 0 recursos com o prefixo desta tarefa; 0 atribuições de `projects.manage_teams`; B1 OFF, revisão 10. Nenhuma equipa, permissão de conta real ou dado financeiro real alterado.
- **Capturas:** [Equipa PT-PT](project-team-management/team-pt.png), [Equipa EN](project-team-management/team-en.png), [Permissão individual, sem concessão](project-team-management/permissions-en.png).

## Ficheiros
- `drizzle/migrations/0279_project_team_management_capability.sql` e espelho `supabase/migrations/20261111163500_project_team_management_capability.sql`.
- `src/lib/permissions-v2.ts`, `src/lib/projects/use-project-access.ts`.
- `src/components/projects/project-team-card.tsx`, `src/routes/_app.admin.permissions.tsx`.
- `src/i18n/locales/en/projects.json`, `src/i18n/locales/pt-PT/projects.json`.
- `scripts/test-project-team-management.test.ts`, `scripts/test-project-team-management.sql`.
- `src/lib/projects/AGENTS.md`, `docs/DECISIONS.md`, `roadmap.md` e este relatório. A regra estrutural foi guardada no AGENTS do módulo; o AGENTS raiz já está no limite e não foi alterado.