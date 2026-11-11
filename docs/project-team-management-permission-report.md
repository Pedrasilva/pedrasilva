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
Pendente de execução dos testes descartáveis e das verificações finais.

## Ficheiros
- `drizzle/migrations/0279_project_team_management_capability.sql` e espelho `supabase/migrations/20261111163500_project_team_management_capability.sql`.
- `src/lib/permissions-v2.ts`, `src/lib/projects/use-project-access.ts`.
- `src/components/projects/project-team-card.tsx`, `src/routes/_app.admin.permissions.tsx`.
- `src/i18n/locales/en/projects.json`, `src/i18n/locales/pt-PT/projects.json`.
- `scripts/test-project-team-management.test.ts`, `scripts/test-project-team-management.sql`.
- `AGENTS.md`, `src/lib/projects/AGENTS.md`, `docs/DECISIONS.md`, `roadmap.md` e este relatório.