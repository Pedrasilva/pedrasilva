/**
 * Image proxy for email bodies. Fetches a remote image server-side so the
 * sender never sees the reader's IP — the mail-client tracking-pixel defence.
 *
 * Public prefix because <img> cannot send a bearer token; the request is
 * authorised by the HMAC signature minted when the body was sanitised, and it
 * can only ever return bytes from a public http(s) image URL.
 */
import { createFileRoute } from "@tanstack/react-router";

/** Refuse anything implausibly large for an inline email image. */
const MAX_BYTES = 8 * 1024 * 1024;

export const Route = createFileRoute("/api/public/inbox/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const raw = params.get("u");
        const exp = params.get("e");
        const sig = params.get("s");
        if (!raw || !exp || !sig) return new Response("Missing params", { status: 400 });

        const { verifyProxyUrl, isProxyableImageUrl, resolvesToPublicAddress } =
          await import("@/lib/inbox/image-proxy.server");
        const check = verifyProxyUrl(raw, exp, sig);
        if (!check.ok) return new Response(check.reason, { status: 403 });

        // Follow redirects by hand: `redirect: "follow"` would let a sender
        // bounce us to 169.254.169.254 or localhost, since the blocklist only
        // ever saw the original URL.
        let target = raw;
        let upstream: Response;
        for (let hop = 0; ; hop++) {
          if (hop > MAX_REDIRECTS) return new Response("Too many redirects", { status: 403 });
          if (!isProxyableImageUrl(target)) return new Response("Blocked URL", { status: 403 });
          if (!(await resolvesToPublicAddress(target))) {
            return new Response("Blocked address", { status: 403 });
          }
          try {
            upstream = await fetch(target, {
              redirect: "manual",
              headers: { Accept: "image/*" },
              signal: AbortSignal.timeout(10_000),
            });
          } catch {
            return new Response("Upstream fetch failed", { status: 502 });
          }
          if (upstream.status < 300 || upstream.status > 399) break;
          const location = upstream.headers.get("location");
          if (!location) return new Response("Upstream error", { status: 502 });
          try {
            target = new URL(location, target).toString();
          } catch {
            return new Response("Blocked URL", { status: 403 });
          }
        }
        if (!upstream.ok) return new Response("Upstream error", { status: 502 });


        const type = upstream.headers.get("content-type") ?? "";
        if (!type.startsWith("image/")) return new Response("Not an image", { status: 415 });
        const length = Number(upstream.headers.get("content-length") ?? 0);
        if (length > MAX_BYTES) return new Response("Image too large", { status: 413 });

        const bytes = await upstream.arrayBuffer();
        if (bytes.byteLength > MAX_BYTES) return new Response("Image too large", { status: 413 });

        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": type,
            "Cache-Control": "private, max-age=3600",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
