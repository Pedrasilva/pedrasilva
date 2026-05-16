## Problema

O `GlobalTopNav` (Tempo / Tarefas / Agenda / +) é renderizado em `_app.tsx` para todas as rotas. São atalhos do módulo **Projectos** que aparecem também em RH, CRM, Financeiro, etc. — confunde o utilizador e, no caso do "Modo colaborador" em `/hr/minha-ficha`, mostra ferramentas a que muitas vezes nem deveria ter acesso visual.

## Objectivo

Cada módulo passa a ter a sua própria barra de atalhos no topo, coerente com o que existe na sidebar desse módulo. O slot continua no mesmo sítio do header global — só muda o conteúdo conforme a rota activa.

## Abordagem

1. Renomear o componente actual para `ProjectsTopNav` (conteúdo igual ao actual: Tempo, Tarefas, Agenda, +).
2. Criar um novo `ModuleTopNav` em `src/components/ModuleTopNav.tsx` que:
   - Usa `useLocation()` para detectar o módulo activo a partir do primeiro segmento (`/projects`, `/crm`, `/finance`, `/hr`, `/admin`, restantes → home).
   - Renderiza o componente certo:
     - **projects / home / `/`** → `ProjectsTopNav` (mantém Tempo · Tarefas · Agenda · +).
     - **crm** → `CrmTopNav`: Oportunidades, Contas, Empresas, Contactos, +Oportunidade/+Empresa/+Contacto (respeita `can("crm.*")`).
     - **finance** → `FinanceTopNav`: Documentos, Despesas empresa, Bancos, +Despesa/+Material (respeita `can("finance.*")`).
     - **hr** → `HrTopNav`: Minha ficha, Férias, Benefícios (sempre); Colaboradores (só se `can("hr.colaboradores")`); botão "+" só para admin com `+Colaborador`. Em **Modo colaborador** segue as mesmas permissões que a sidebar já corrigida.
     - **admin** → apenas o botão "+" omitido; nenhum atalho.
3. Substituir em `src/routes/_app.tsx` o uso de `GlobalTopNav` por `ModuleTopNav`. O `LanguageSwitcher` e o menu de utilizador permanecem inalterados.
4. As acções de criação rápidas (`LogTimeDialog`, `TaskDialog`, `QuickExpenseDialog`, etc.) ficam locais ao top-nav do módulo que as oferece — sem regressões na sidebar nem nas páginas.

## i18n

- Adicionar chaves `topNav.*` em `common.json` (rótulos partilhados como `create`, `new`) e completar em `crm.json`, `finance.json`, `hr.json` para os atalhos novos (EN + PT-PT em paridade, conforme regra do projecto).
- Reaproveitar `glossary:*` para termos canónicos (Oportunidade, Despesa, Colaborador, Férias).

## Permissões

- Cada `*TopNav` usa `useAuth()` + `usePermissions()` para esconder itens a que o utilizador não tem acesso, alinhado com o que a sidebar do módulo já faz. Em "Modo colaborador" o `HrTopNav` mostra apenas Minha ficha / Férias / Benefícios.

## Fora do âmbito

- Não alterar conteúdo das páginas nem as sidebars.
- Não tocar nos diálogos de criação rápida (apenas mudam de "dono").
- Não alterar lógica de auth/permissões — só consumo.

## Ficheiros previstos

- editar: `src/routes/_app.tsx`
- novo: `src/components/ModuleTopNav.tsx`
- novo: `src/components/topnav/CrmTopNav.tsx`, `FinanceTopNav.tsx`, `HrTopNav.tsx`
- renomear/manter: `src/components/GlobalTopNav.tsx` → `src/components/topnav/ProjectsTopNav.tsx`
- editar: `src/i18n/locales/{en,pt-PT}/{common,crm,finance,hr}.json`
