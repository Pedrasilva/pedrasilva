/** Server-only helpers for post approvals: who has Marketing access, and the approval emails. */
import { admin, userName, NUDGE_APP_URL } from "./nudges.server";

export type MarketingPerson = { userId: string; name: string };

/** Active staff (pm_resources matched to sign-in accounts) who hold marketing.view at scope all. */
export async function marketingPeople(): Promise<MarketingPerson[]> {
  const db = await admin();
  const { data: res } = await db.from("pm_resources").select("name, email, active").not("email", "is", null);
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; page < 10; page++) {
    const { data: u } = await db.auth.admin.listUsers({ page, perPage: 200 });
    users.push(...(u?.users ?? []));
    if (!u || u.users.length < 200) break;
  }
  const byEmail = new Map(users.filter((u) => u.email).map((u) => [u.email!.trim().toLowerCase(), u.id]));
  const out = new Map<string, MarketingPerson>();
  for (const r of (res ?? []) as { name: string; email: string; active: boolean | null }[]) {
    const uid = byEmail.get(r.email.trim().toLowerCase());
    if (!uid || r.active === false || out.has(uid)) continue;
    out.set(uid, { userId: uid, name: r.name });
  }
  const checked = await Promise.all([...out.values()].map(async (p) => {
    const { data } = await db.rpc("has_module_permission", { _user_id: p.userId, _key: "marketing.view", _required_scope: "all" });
    return data === true ? p : null;
  }));
  return checked.filter((p): p is MarketingPerson => !!p).sort((a, b) => a.name.localeCompare(b.name));
}

/** One email to one recipient about one approval event. Failures are reported, never thrown. */
export async function sendApprovalEmail(kind: "request" | "approved" | "changes_requested", approvalId: string, toUserId: string, fromUserId: string, draftId: string, excerpt: string, comment: string | null) {
  try {
    const to = await userName(toUserId);
    if (!to.email) return { sent: false };
    const from = await userName(fromUserId);
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const r = await sendTemplateEmail("marketing-post-approval", to.email, {
      idempotencyKey: `marketing-post-approval-${kind}-${approvalId}`,
      templateData: { kind, senderName: from.name, excerpt: excerpt.slice(0, 400), comment: comment ?? "", draftUrl: `${NUDGE_APP_URL}/marketing/posts?draft=${draftId}` },
    });
    return { sent: r.sent };
  } catch (e) {
    console.error("marketing-post-approval email failed", e instanceof Error ? e.message : "unknown");
    return { sent: false };
  }
}
