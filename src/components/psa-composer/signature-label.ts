import i18n from "@/i18n/index";
import type { ProposalSignature } from "@/lib/psa-proposal/use-proposal-signatures";
/** Editor-only display; never used in a signed document or provider request. */
export function signatureLabel(s: ProposalSignature): string {
 const key = "crm:composer.signature.";
 if (s.status === "completed") return i18n.t(key + "completed", { date: s.completed_at ? new Date(s.completed_at).toLocaleDateString(i18n.language, {day:"2-digit",month:"short",year:"numeric"}) : "" });
 if (s.status === "declined" || s.status === "voided") return i18n.t(key + s.status) + (s.status_note ? ` — ${s.status_note}` : "");
 return i18n.t(key + (s.client_signed_at ? "awaitingPsa" : "awaitingClient"), {name: s.client_signed_at ? s.psa_signer_name ?? "PSA" : s.client_signer_name ?? i18n.t("glossary:relation.client")});
}
