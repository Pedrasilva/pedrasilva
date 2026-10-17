/** Split a free-text full name into contacts.primeiro_nome / apelido. */
export function splitContactName(full: string): { primeiro_nome: string; apelido: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { primeiro_nome: "", apelido: null };
  return { primeiro_nome: parts[0], apelido: parts.length > 1 ? parts.slice(1).join(" ") : null };
}
