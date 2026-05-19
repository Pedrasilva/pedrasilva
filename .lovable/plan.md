## Causa do problema

Três fatores compostos:

1. **Permissões pouco granulares.** Hoje só existem `hr.colaboradores` (lista + ficha + valores tudo num só), `hr.resumo` (tabela inteira com valores) e `hr.minha-ficha`. Não há separação entre "ver ficha" vs. "ver compensação". Quem recebe `hr.colaboradores` recebe automaticamente acesso financeiro — ou nada.

2. **RLS é binária admin-only nas tabelas sensíveis.** `salary_snapshots` e `bo_settings` só permitem leitura a `admin` ou ao próprio colaborador. Um utilizador não-admin com `hr.colaboradores` marcado na grelha passa o `PermissionGate` (UI), mas a query devolve 0 linhas → valores aparecem a "—" / 0,00 €. A UI mostra acesso, a RLS bloqueia. Foi exatamente o sintoma da Irene em `/projects/resources` e é o mesmo padrão aqui.

3. **`isAdmin` no client mistura real admin e view-as.** `useAuth` expõe `isAdmin` (efetivo, considera view-as) e `isRealAdmin`. Várias queries assumem `isAdmin = bypass RLS`, mas RLS no servidor vê sempre o utilizador autenticado real. Em view-as, a UI relaxa, a RLS não.

## Permissões atuais (HR namespace)

```
hr.minha-ficha           própria ficha
hr.dias-uteis            calendário/feriados
hr.beneficios.own        próprias despesas benefícios
hr.beneficios.approve    aprovar benefícios de outros
hr.ferias.own            próprias férias
hr.colaboradores         lista + ficha + valores (tudo)
hr.resumo                resumo comparativo (com valores)
hr.subsidio-alimentacao  config SA
hr.valor-bo              config valor BO/hora
```

## Permissões novas (aditivas)

```
hr.colaborador.view                 abrir ficha de outros (sem valores)
hr.colaborador.compensation.view    salário, benefícios, liquidez, custos na ficha
hr.colaborador.edit                 editar ficha
hr.resumo.compensation.view         valores no resumo comparativo
hr.admin                            gerir permissões HR (alias para has_role admin)
```

`hr.colaboradores` mantém-se = ver lista. `hr.resumo` mantém-se = ver tabela sem valores. As keys antigas continuam a funcionar (compatibilidade), mas perdem o significado "tudo incluído".

### Compatibilidade

Migração aditiva: quem hoje tem `hr.colaboradores` recebe também `hr.colaborador.view` + `hr.colaborador.compensation.view`. Quem tem `hr.resumo` recebe `hr.resumo.compensation.view`. Resultado funcional = status quo, mas a partir daí o admin pode revogar só a parte de compensação.

## Camadas a alterar

### 1. Migration SQL (aditivo)

- Backfill `user_permissions` para os utilizadores existentes com as 5 novas keys conforme regra acima.
- Atualizar RLS:
  - `salary_snapshots SELECT`: admin OR own OR `has_permission(auth.uid(), 'hr.colaborador.compensation.view')` OR `has_permission(auth.uid(), 'hr.resumo.compensation.view')`.
  - `bo_settings SELECT`: admin OR `has_permission(... 'hr.colaborador.compensation.view')` OR `... 'hr.resumo.compensation.view')` OR `... 'hr.valor-bo')`.
  - `collaborators SELECT`: adicionar branch `has_permission(auth.uid(), 'hr.colaborador.view')` (sem expor salário — a tabela `collaborators` não tem salário, só perfil).
- `bo_settings INSERT` e `salary_snapshots INSERT` já têm `WITH CHECK` admin — manter.

### 2. `src/lib/permissions.ts`

- Adicionar as 5 keys ao `PermissionKey` union.
- Adicionar à grelha do admin com labels EN+PT e descrição clara da diferença "view ficha" vs "view valores".

### 3. UI gating (PT/EN parity)

- `src/routes/_app.hr.colaborador.$id.tsx`: trocar `PermissionGate hr.colaboradores` por `hr.colaborador.view`; mascarar blocos de compensação (Salário, Benefícios, Liquidez, Custos, ResumoCompare) se não tiver `hr.colaborador.compensation.view`. Mascaramento = renderizar "—" e esconder donut/highlight cards de valores.
- `src/routes/_app.hr.resumo.tsx`: gate continua `hr.resumo`; colunas/células de valor escondidas/mascaradas se não tiver `hr.resumo.compensation.view`.
- `src/routes/_app.hr.colaboradores.tsx`: gate continua `hr.colaboradores` (lista).
- `src/routes/_app.hr.tsx` (nav): adicionar item "Ficha de colaborador" condicionado a `hr.colaborador.view`.

### 4. Hook helpers

- `useHasPermission`/`useMyPermissions` — nenhuma mudança lógica, mas adicionar helper `useCanViewCompensation(scope: 'card' | 'resumo')` para concentrar a decisão.

### 5. View-as

- Verificar que `useMyPermissions` durante `viewAsUser` lê as permissões do alvo (não do admin) — hoje já lê com `user.id` real do auth, mas em view-as o admin continua admin para RLS. Garantir que as queries usam `isAdmin` efetivo só para UI, não como bypass de dados sensíveis durante view-as. Adicionar nota: em view-as, mascarar compensação a menos que o alvo tivesse `hr.colaborador.compensation.view`.

## Validação por perfil

| Perfil | Lista | Abrir ficha | Salário/benefícios na ficha | Resumo | Valores no resumo |
|---|---|---|---|---|---|
| Admin real | ✓ | ✓ | ✓ | ✓ | ✓ |
| HR (todas keys novas) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Gestor (`hr.colaboradores` + `hr.colaborador.view`) | ✓ | ✓ | mascarado | – | – |
| Colaborador normal | – | só própria | só própria | – | – |
| Admin em view-as colaborador | – | só do alvo | só do alvo | – | – |

## Riscos de segurança identificados

1. **Leitura cruzada de `salary_snapshots`** se a nova policy for demasiado permissiva. Mitigação: ligar a `has_permission` (já testado em `has_role`) e nunca a `OR true`.
2. **View-as não simula RLS no servidor.** Documentar e mascarar UI. Se for crítico, mover queries sensíveis para server functions com `requireSupabaseAuth` e impor regra "se viewAs ativo, comparar permissões do alvo".
3. **Backfill pode promover utilizadores que tinham `hr.colaboradores` por engano.** Antes de aplicar, o admin deve rever a lista atual em `user_permissions`. A migração inclui um `SELECT ... FOR REVIEW` query que devolve quem ficaria com `hr.colaborador.compensation.view`.
4. **PII em `collaborators`** (morada, NIF, IBAN — se existirem). Adicionar branch `hr.colaborador.view` expõe estes campos. Mitigação: criar view `collaborators_basic` sem PII sensível e usá-la quando a chamada não tem `hr.colaborador.compensation.view`. (Marca para fase 2 se hoje a tabela só tem dados de perfil.)

## Ficheiros previstos

- `supabase/migrations/<ts>_hr_granular_permissions.sql` (novo)
- `src/lib/permissions.ts`
- `src/routes/_app.hr.colaborador.$id.tsx`
- `src/routes/_app.hr.resumo.tsx`
- `src/routes/_app.hr.tsx`
- `src/components/ResumoCompare.tsx` (mascaramento condicional)
- `src/components/snapshot/SalaryDonut.tsx` + `HighlightCard.tsx` (mascaramento de valores)
- `src/i18n/locales/{en,pt-PT}/hr.json` (labels novas + "Valor oculto")
- `src/hooks/use-permissions.tsx` (helper `useCanViewHrCompensation`)

## Não tocar

Férias, benefícios (próprios/aprovação), folha salarial, dashboard HR, importadores, IRS, BO settings dos cálculos de pricing, dias úteis.

## Próximo passo

Aprova o plano para eu emitir a migração SQL primeiro (com o `SELECT` de revisão do backfill), depois aplicar as alterações UI/permissions.ts numa segunda passagem.
