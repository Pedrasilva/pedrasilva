## Contexto

O sistema já tem toda a infra-estrutura por baixo: a tabela `collaborators` tem `archived_at` / `archived_by` / `archive_reason`, o hook `useCollaboratorsList` aceita `status: "active" | "archived" | "all"`, a lista em `/hr/colaboradores` já tem o filtro e a ficha do colaborador já tem botões "Arquivar" / "Restaurar".

O pedido é essencialmente **de linguagem e visibilidade**: hoje chama-se "Arquivar / Arquivado" e o controlo na ficha é um botão escondido no canto. O utilizador quer ver isto como **"Activo / Não activo"**, com um controlo claro na ficha e um filtro óbvio na lista.

Proponho não mexer na base de dados (mantém-se `archived_at` como verdade) e fazer apenas alterações de UI + tradução.

## O que muda

### 1. Ficha do colaborador (`/hr/colaborador/:id`)
- Adicionar um **Switch "Activo / Não activo"** no cabeçalho da ficha, ao lado do nome, ligado ao estado actual (`archived_at == null` → activo).
- Mudar o switch para "Não activo" abre o mesmo diálogo de razão que já existe hoje (`ArchiveCollaboratorDialog`), com textos novos.
- Mudar para "Activo" chama `useRestoreCollaborator` (mantém-se a confirmação actual).
- Os botões antigos "Arquivar / Restaurar" no canto inferior são removidos para não duplicar.
- O badge "Arquivado" passa a ser **"Não activo"** (cinza).

### 2. Lista de colaboradores (`/hr/colaboradores`)
- O `Select` de filtro continua com 3 opções, mas re-etiquetadas:
  - `active` → **"Activos"**
  - `archived` → **"Não activos"**
  - `all` → **"Todos"**
- Default mantém-se "Activos".
- Coluna "Estado" mostra **"Activo"** (verde subtil) ou **"Não activo"** (cinza) em vez de "Arquivado".
- Acções da linha: o item de menu "Arquivar" passa a chamar-se **"Marcar como não activo"** e "Restaurar" passa a **"Marcar como activo"**.

### 3. Traduções (`src/i18n/locales/{en,pt-PT}/hr.json`)
- Substituir as strings de "arquivar / arquivado / restaurar" pelas novas:
  - PT: "Activo", "Não activo", "Marcar como não activo", "Marcar como activo", "Motivo (opcional)"
  - EN: "Active", "Inactive", "Mark as inactive", "Mark as active"
- Manter as chaves antigas onde for mais simples, só trocando o valor da string — paridade EN/PT obrigatória.

## Notas técnicas

- Nada muda na BD nem em RLS. Continua tudo a usar `archived_at`.
- `useArchiveCollaborator` / `useRestoreCollaborator` / `ArchiveCollaboratorDialog` são reaproveitados tal como estão — só mudam labels e o ponto de entrada (Switch em vez de botão).
- O diálogo de confirmação ao desactivar mantém o campo "motivo" opcional (útil como histórico). Posso esconder este campo se preferires uma desactivação em 1 clique — diz-me.

## Ficheiros afectados

- `src/routes/_app.hr.colaborador.$id.tsx` — Switch no header, remover botões antigos.
- `src/routes/_app.hr.colaboradores.tsx` — re-etiquetar Select e chip de estado.
- `src/components/hr/collaborators-table.tsx` — badge "Activo / Não activo" e labels do menu.
- `src/i18n/locales/pt-PT/hr.json` e `src/i18n/locales/en/hr.json` — strings novas.
