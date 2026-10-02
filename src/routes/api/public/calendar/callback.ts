import { createFileRoute } from "@tanstack/react-router";

/**
 * Google OAuth callback. Trust comes only from the HMAC-signed state minted for
 * the signed-in user (10-minute expiry). Refuses any account outside the
 * allowed domain and revokes its token straight away.
 */
export const Route = createFileRoute("/api/public/calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const s = await import("@/lib/projects/calendar.server");
        const url = new URL(request.url);
        const state = await s.verifyState(url.searchParams.get("state") ?? "").catch(() => null);
        if (!state) return new Response("This calendar link has expired. Go back to PSA Hub and try again.", { status: 400 });
        const back = (result: string) => {
          const to = new URL(state.o + state.r);
          to.searchParams.set("calendar", result);
          return Response.redirect(to.toString(), 302);
        };
        const code = url.searchParams.get("code");
        if (!code) return back("cancelled");
        try {
          const tok = await s.exchangeCode(code, state.o);
          if (!tok.scope?.split(" ").includes(s.CALENDAR_SCOPE)) {
            await s.revokeAtGoogle(tok.refresh_token ?? tok.access_token);
            return back("noscope");
          }
          const email = await s.primaryEmail(tok.access_token);
          if (!email || !email.endsWith("@" + s.ALLOWED_DOMAIN)) {
            await s.revokeAtGoogle(tok.refresh_token ?? tok.access_token);
            return back("domain");
          }
          if (!tok.refresh_token) return back("error");
          await s.saveConnection(state.u, email, tok.refresh_token);
          return back("connected");
        } catch (e) {
          console.error("calendar callback failed", (e as Error).message);
          return back("error");
        }
      },
    },
  },
});
