import type { TFunction } from "i18next";

/**
 * Map low-level Supabase / network errors to user-facing messages.
 * Keep messages short and actionable — never expose raw RLS or SQL text.
 */
export function humanizeMutationError(
  err: unknown,
  t: TFunction,
  fallbackKey = "hr:colaboradores.toast.error",
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const msg = raw.toLowerCase();

  if (!msg) return t(fallbackKey);

  // Permissions
  if (
    msg.includes("forbidden") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("rls") ||
    msg.includes("not authorized")
  ) {
    return t("hr:colaboradores.toast.errors.forbidden");
  }

  // Auth / session
  if (
    msg.includes("jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid token") ||
    msg.includes("expired")
  ) {
    return t("hr:colaboradores.toast.errors.session");
  }

  // Network
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("offline")
  ) {
    return t("hr:colaboradores.toast.errors.network");
  }

  // Conflict / constraint
  if (
    msg.includes("duplicate") ||
    msg.includes("conflict") ||
    msg.includes("unique") ||
    msg.includes("constraint")
  ) {
    return t("hr:colaboradores.toast.errors.conflict");
  }

  // Default: short generic message rather than raw backend text
  return t(fallbackKey);
}
