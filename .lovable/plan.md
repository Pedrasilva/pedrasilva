## Root cause

The session-replay matches the classic permission-loading race:

1. Land on `/` → "No modules available" flashes for one frame.
2. Click CRM → `/crm` mounts → bounces back to `/`.

In `src/hooks/use-auth.tsx`, `loading` is flipped to `false` as soon as `getSession()` resolves, but `fetchRole(user.id)` is fired *without* being awaited. So there is a window where:

- `loading = false`
- `isRealAdmin = false` (still fetching)
- `permissions = new Set()` (empty query result for an admin, because admins have no rows in `user_permissions`)

During that window:

- `_app.index.tsx` computes `visible = MODULES.filter(...permissions.has(k))` → `[]` → renders the "No modules available" empty state.
- `_app.crm.tsx`'s effect sees `loading=false`, `allowed = isAdmin || someCrmKey` → `false` → calls `navigate({ to: "/" })`.

Then `fetchRole` resolves, `isRealAdmin` flips to `true`, and the home page re-renders with all modules — but on CRM we have already navigated away, which is exactly what the user sees.

`useMyPermissions.loading` does not save us either: with `enabled: !!user && !authLoading`, the moment `authLoading` becomes `false` the query starts. For an admin the result set is empty and returns almost instantly, so `permsLoading` is briefly `false` while `isRealAdmin` is still `false`.

## Fix

Treat the role lookup as part of auth bootstrap so consumers never see a "logged in, role unknown" state.

### 1. `src/hooks/use-auth.tsx`

- Add a `roleLoading` piece of state (default `true` when there is a session, `false` when signed out).
- In the initial `getSession()` branch, only flip the top-level `loading` to `false` after `fetchRole` resolves (await it). Set `isRealAdmin` inside that same async flow.
- In `onAuthStateChange`, when a session appears, set `roleLoading = true` before kicking off `fetchRole`, and set it back to `false` in `fetchRole`'s `finally`. When the session is cleared, reset `isRealAdmin` and `roleLoading = false`.
- Export effective `loading = sessionLoading || roleLoading` from the context so every consumer (`_app`, `_app.index`, `_app.crm`, `useMyPermissions`, etc.) waits for the role too.
- Keep `fetchRole` resilient: wrap in try/finally so a failed role query still releases `roleLoading`.

### 2. `src/hooks/use-permissions.tsx`

No structural change needed — it already derives `loading` from `useAuth().loading`, which will now correctly cover the role fetch. Just double-check the export is still `authLoading || query.isLoading`.

### 3. `src/routes/_app.crm.tsx`

Defensive hardening so a future race cannot bounce the user again:

- Only run the redirect effect after `loading` is `false` *and* we have actually observed a stable `allowed=false` (already the case). Add an extra guard: if `loading` flips back to `true` (e.g. session refresh), reset the local `checked` flag so we do not redirect on a stale value.
- This is belt-and-braces; the real fix is in `use-auth.tsx`.

### 4. `src/routes/_app.index.tsx`

- Keep the existing `if (loading) return Loading...` gate; with the fix above, `loading` will stay `true` until role + permissions are known, so the "No modules available" empty state will only render for users who genuinely have no access.

## Files to change

- `src/hooks/use-auth.tsx` — await role fetch / track `roleLoading`, fold it into `loading`.
- `src/routes/_app.crm.tsx` — small guard so `checked` resets if `loading` flips back to `true`.

No DB or route-tree changes. No new dependencies.

## Verification

1. Hard reload `/` as an admin: header + modules render directly, no "No modules available" flash.
2. Click CRM: `/crm` stays on `/crm` (no bounce to `/`).
3. Click CRM as a user who genuinely lacks all `crm.*` permissions: still redirected to `/` (existing behaviour preserved).
4. Sign out: returns to `/login` without flashing protected UI.
