
## Objectivo

Na ficha do colaborador (`/hr/minha-ficha`), adicionar acesso rápido a **Férias** e **Benefícios** (que já existem), garantir que estão visíveis ao colaborador (incluindo no Modo colaborador do admin), e introduzir aprovação de despesas de benefícios por um colaborador designado — em vez de apenas pelo admin.

## O que já existe (não recriar)

- `/hr/ferias` — pedido de férias e ausências, dias úteis, calendário, estados pendente/aprovada/rejeitada (`vacation_requests`).
- `/hr/beneficios` — vista do colaborador com saldo por categoria, submissão de factura (upload de foto), histórico e estado (`benefit_expenses` com `foto_path`, `estado`, `aprovado_por`, `aprovado_em`).
- Permissões legacy `hr.ferias.own` e `hr.beneficios.own` já existem e já estão a controlar a sidebar / topnav.

## Mudanças propostas

### 1. Atalhos a partir da Minha Ficha

Em `src/routes/_app.hr.minha-ficha.tsx`, no topo da página adicionar dois cartões/botões grandes:

- **As minhas férias** → `/hr/ferias` (com contador de dias gozados/disponíveis no ano, vindo da query já existente)
- **Os meus benefícios** → `/hr/beneficios` (com saldo total disponível do ano)

Cada cartão mostra um KPI rápido + CTA "Abrir". Visíveis sempre que o utilizador tem `hr.ferias.own` / `hr.beneficios.own` (já é o caso para colaboradores reais).

### 2. Garantir visibilidade no Modo colaborador

No Modo colaborador (admin a ver como), `useMyPermissions` carrega as permissões do admin (não do colaborador impersonado) e o admin não tem entradas em `user_permissions`. Resultado: férias/benefícios desaparecem da sidebar nesse modo.

Correcção: nas verificações usadas para a sidebar HR e topnav (`hr.ferias.own`, `hr.beneficios.own`, `hr.minha-ficha`), considerar **também** `isRealAdmin && viewAsUser` como se fosse permissão concedida — assim o admin em Modo colaborador vê o que um colaborador veria. Permissões admin-only (gestão, valor-bo, etc.) continuam ocultas, como já configurámos antes.

### 3. Aprovação de despesas de benefícios por colaborador designado

Hoje só o admin aprova (vista `AdminView` em `_app.hr.beneficios.tsx`). Vamos introduzir o papel de **aprovador de benefícios** atribuível a qualquer colaborador.

**Base de dados (migração):**

- Nova permissão legacy `hr.beneficios.approve` no catálogo (`src/lib/permissions.ts`).
- Política RLS em `benefit_expenses`: permitir `UPDATE` (apenas das colunas `estado`, `notas_aprovacao`, `aprovado_por`, `aprovado_em`, `pago_em`) a utilizadores com permissão `hr.beneficios.approve` em `user_permissions` — através de função `security definer` `public.can_approve_benefits(uid)`. Continuar a permitir UPDATE total para admins. Manter as políticas existentes do colaborador (criar/editar/apagar enquanto pendente).

**UI:**

- Em `/hr/beneficios`, quando o utilizador não é admin mas tem `hr.beneficios.approve`, mostrar um separador adicional **"Aprovações"** dentro da vista do colaborador (tabs: "Os meus benefícios" / "Aprovações pendentes"). A vista de aprovações reutiliza a tabela existente do `AdminView` (lista de pedidos pendentes, abrir foto, aprovar/rejeitar com nota). Sem acesso à configuração de orçamentos / créditos (continua admin-only).
- Em `/hr/admin` (gestão de permissões), permitir atribuir a nova chave `hr.beneficios.approve` a colaboradores específicos (usa o UI já existente de toggles de permissão).

### 4. i18n

Adicionar chaves PT/EN para os atalhos da Minha Ficha (`myCard.vacation`, `myCard.benefits`, sub-labels com saldos) e para o separador "Aprovações" (`benefits.approvals.tab`, `benefits.approvals.empty`, etc.), seguindo as regras de namespace e paridade.

## Detalhes técnicos

**Ficheiros afectados:**

- `src/routes/_app.hr.minha-ficha.tsx` — secção nova com os dois cartões + queries de contagem (já há helper `countWeekdays` e `balanceByCategory`).
- `src/routes/_app.hr.tsx` — flags `show` para `/hr/ferias`, `/hr/beneficios`, `/hr/minha-ficha`: `(isRealAdmin && viewAsUser) || can(...)`.
- `src/components/ModuleTopNav.tsx` — mesma regra nos `NavBtn` correspondentes.
- `src/lib/permissions.ts` — adicionar `hr.beneficios.approve` ao tipo e ao catálogo.
- `src/routes/_app.hr.beneficios.tsx` — `BeneficiosPage` passa a decidir: admin → `AdminView`; senão → `CollaboratorView` com Tabs (sempre "Os meus benefícios"; se `can("hr.beneficios.approve")`, adicionar tab "Aprovações"). Extrair a tabela de aprovações pendentes do `AdminView` para componente partilhado `BenefitApprovalsTable`.
- Migração SQL: função `can_approve_benefits` + política UPDATE em `benefit_expenses`.
- `src/i18n/locales/{en,pt-PT}/hr.json` e `common.json` conforme necessário.

**Sem alterações ao fluxo de Férias** além do atalho — a aprovação de férias mantém-se como está. Se mais tarde quisermos `hr.ferias.approve` análogo, fica para iteração futura (avisar e perguntar antes de avançar).
