## Problema

Quando entra em **Modo colaborador** (impersonação), o sidebar do HR continua a mostrar itens só de admin — *Resumo geral*, *Subsídio alimentação*, *Dias úteis*, *Valor BO/hora*, *Permissões*. Confunde o teste de UX porque o admin vê coisas que o colaborador real nunca veria.

## Causa

Em `src/routes/_app.hr.tsx`, cinco itens fazem `show: isRealAdmin || can(...)`. O `isRealAdmin` ignora o estado de impersonação e dá sempre acesso. O `useAuth` já distingue:

- `isRealAdmin` — admin verdadeiro (sempre true para um admin)
- `isAdmin` — `isRealAdmin && !viewAsUser` (cai para `false` em Modo colaborador)

O `can()` interno já usa `isAdmin`, portanto é o que respeita a impersonação.

## Plano (mudança pequena, sem novos componentes)

Em `src/routes/_app.hr.tsx`, substituir `isRealAdmin || can(...)` por apenas `can(...)` nos cinco itens afectados:

- *Resumo geral* (`/hr/resumo`)
- *Subsídio alimentação* (`/hr/subsidio-alimentacao`)
- *Dias úteis* (`/hr/dias-uteis`)
- *Valor BO/hora* (`/hr/valor-bo`)
- *Permissões* (`/hr/admin`) — este pode ficar `isRealAdmin && !viewAsUser` (= `isAdmin`) já que não tem chave `can`

Comportamento resultante:

| Estado | Itens visíveis no sidebar HR |
|---|---|
| Admin (normal) | Tudo (via `isAdmin` em `can()`) |
| Admin em *Modo colaborador* | Só itens com permissão real do colaborador (Minha ficha, Férias, Benefícios) |
| Colaborador normal | Igual ao anterior |

Tira horizontal mobile reutiliza `visibleGroups`, portanto fica corrigida automaticamente.

## Notas

- Não toca em `use-auth`, `use-permissions`, nem em routes — só na definição dos `show` flags.
- Routes que ficam escondidos continuam acessíveis por URL directo para um admin não impersonado (não estamos a alterar guards de rota, só a navegação). Se quiser também bloquear acesso por URL em modo colaborador, é outra alteração (maior) e podemos fazer depois.