
# Salary update → Project cost propagation

Permite que uma actualização salarial seja reflectida nos projectos a partir de uma data escolhida (independente da `effective_from` do payroll), sem corromper meses já fechados.

## Estado actual

- `salary_snapshots.effective_from` rege HR/payroll.
- `pm_resources.cost_rate` é o número usado pelo P&L do projecto. Existe histórico em `pm_resource_rates(effective_from, cost_rate, sale_rate)`, **mas `use-stage-budget-control.ts` ignora-o** — usa sempre o `cost_rate` "vivo" do recurso.
- Não há ligação automática snapshot → resource rate.

## O que vamos construir

### 1. Schema (migration)

- `salary_snapshots`: + `project_cost_effective_from DATE NULL` (quando NULL = mesma data do `effective_from`).
- `pm_resource_rates`: + `source TEXT` (`'manual' | 'salary_snapshot'`) + `source_snapshot_id UUID NULL` (idempotência e rastreio).

### 2. Engine de derivação — `src/lib/finance/derive-project-cost-rate.ts`

Função pura:
```
monthly_company_cost = computeMonthlyCompanyCost(snapshot).monthlyAverage
                       × resource_split.project_fte_equivalent
monthly_hours        = weekly_hours × 52 / 12
project_cost_rate    = monthly_company_cost / monthly_hours
```
Híbridos respeitam `project_pct` (Step 2). BO puro → `cost_rate = 0`.

### 3. Propagação — `src/lib/finance/propagate-salary-to-projects.functions.ts`

Server fn chamada após gravar snapshot:
1. Calcula `newRate`.
2. Para cada `pm_resources` activo do colaborador com `hourly_rate_is_override = false`:
   - Fecha a linha aberta de `pm_resource_rates`: `effective_to = projectCostEffectiveFrom - 1`.
   - Insere nova linha (`effective_from`, `cost_rate = newRate`, `source = 'salary_snapshot'`, `source_snapshot_id`).
3. Actualiza `pm_resources.cost_rate` (espelho do rate corrente, para leitores antigos).

Recursos com override manual são ignorados e listados no toast.

### 4. Leitura por data — `src/lib/projects/resource-rate-lookup.ts`

Helper `costRateAt(resourceId, date)` que escolhe da história em `pm_resource_rates`. Fallback para `pm_resources.cost_rate`.

Refactor em `use-stage-budget-control.ts`:
- Pré-carrega histórico dos recursos envolvidos.
- Substitui `p.cost` (constante) por rate **por data da entry** no cálculo de `cost`.
- Futuro continua a usar o rate corrente.

### 5. UI no SnapshotForm

Novo campo (Datepicker shadcn) abaixo de `effective_from`:
- **Reflectir nos projectos a partir de** *(opcional)*
- Default visível = data de hoje (conservador), pode ser igual à `effective_from` para propagação total.
- Hint: "Salário acima desta data não afecta margens de projecto já fechadas."

Após gravar: toast "X taxas actualizadas, Y ignoradas (override)".

### 6. Visibilidade na ficha do colaborador

No card "Resource classification":
- Mostrar "Project cost rate derivado: XX,XX €/h desde DD/MM/AAAA".
- Link "Ver histórico" → drawer com últimas linhas de `pm_resource_rates`.

### 7. i18n

Novas chaves em `hr.json` + `projects.json` (EN + PT), partilhadas via `glossary` quando aplicável (`projectCostEffectiveFrom`, `costRateHistory`, `derivedCostRate`).

## Invariantes (NÃO mexer)

- Timesheet entries não são reescritas — só o rate aplicado por data muda.
- `effective_from` do payroll mantém-se separado da data de projecto.
- Recursos com `hourly_rate_is_override = true` ficam intactos.
- `sale_rate` não é tocado.

## Ficheiros tocados

**Migration**: `salary_snapshots`, `pm_resource_rates`.

**Novos**:
- `src/lib/finance/derive-project-cost-rate.ts`
- `src/lib/finance/propagate-salary-to-projects.functions.ts`
- `src/lib/projects/resource-rate-lookup.ts`

**Editados**:
- `src/components/SnapshotForm.tsx`
- caller do save de snapshot (invoca propagação)
- `src/lib/projects/use-stage-budget-control.ts`
- `src/routes/_app.hr.colaborador.$id.tsx`
- `src/i18n/locales/{en,pt-PT}/{hr,projects,glossary}.json`

## Riscos & mitigação

| Risco | Mitigação |
|---|---|
| Recalcular margens históricas surpreende | Default = hoje. Retroactivo é opt-in via Datepicker. |
| Performance no rollup | Pré-carregar histórico 1× por recurso, lookup O(log n). |
| Re-propagação dupla | `source_snapshot_id` garante idempotência. |
| Híbridos sem `weekly_hours` | Engine devolve `null`, log + skip, warning na UI. |

## Roll-out

1. Migration + GRANTs.
2. Engine + lookup (sem mudar comportamento).
3. Refactor `use-stage-budget-control` para usar lookup.
4. UI snapshot + propagação ligada.
5. Backfill admin opcional (idempotente).
