/**
 * Signed image-proxy URLs for email bodies.
 *
 * Remote <img> in an untrusted email is a tracking pixel: loading it directly
 * hands the sender our reader's IP, user-agent and the exact moment they opened
 * the message. We rewrite every remote image to a same-origin proxy URL so the
 * sender only ever sees our server.
 *
 * The <img> tag cannot carry a bearer token, so the URL itself is the
 * capability: an HMAC over (url, expiry) signed with a server-only secret and
 * valid for a short window. It grants nothing but "fetch this one public image".
 */
import { createHmac, timingSafeEqual } from "crypto";

/** Signed links outlive a read session but not much more. */
const TTL_SECONDS = 60 * 60 * 6;

function secret(): string {
  const value = process.env["INBOX_IMAGE_PROXY_SECRET"];
  if (!value) throw new Error("INBOX_IMAGE_PROXY_SECRET is not configured");
  return value;
}

function sign(url: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${url}\n${exp}`).digest("hex");
}

/** Hosts that must never be reachable through the proxy (SSRF guard). */
const BLOCKED_HOST = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.internal$/i,
  /\.local$/i,
];

/** True when `raw` is a public http(s) URL we are willing to fetch. */
export function isProxyableImageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return !BLOCKED_HOST.some((re) => re.test(url.hostname));
}

/** Same-origin proxy URL for a remote image, or null when not proxyable. */
export function buildProxyUrl(raw: string): string | null {
  if (!isProxyableImageUrl(raw)) return null;
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const params = new URLSearchParams({
    u: raw,
    e: String(exp),
    s: sign(raw, exp),
  });
  return `/api/public/inbox/image?${params.toString()}`;
}

export function verifyProxyUrl(
  raw: string,
  exp: string,
  signature: string,
): { ok: true } | { ok: false; reason: string } {
  const expiry = Number(exp);
  if (!Number.isFinite(expiry)) return { ok: false, reason: "Bad expiry" };
  if (expiry < Math.floor(Date.now() / 1000)) return { ok: false, reason: "Link expired" };
  if (!isProxyableImageUrl(raw)) return { ok: false, reason: "Blocked URL" };

  const expected = Buffer.from(sign(raw, expiry));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "Bad signature" };
  }
  return { ok: true };
}
