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

/** True when a resolved IP literal sits in a private / link-local / loopback range. */
export function isBlockedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true; // unique-local
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true; // link-local
  if (v6.startsWith("::ffff:")) return isBlockedIp(v6.slice(7)); // v4-mapped
  return false;
}

/**
 * DNS-level SSRF guard: a public-looking hostname can still resolve to an
 * internal address, so we resolve it over DoH and check every answer.
 * There is no DNS API in the worker runtime, hence the HTTP resolver.
 * Residual limitation: resolution here and the later connect are separate
 * lookups, so a DNS-rebinding attacker with a ~1s TTL could still slip past;
 * closing that needs connect-time IP pinning, which the runtime does not expose.
 * We fail open when the resolver itself is unreachable so ordinary images keep
 * rendering; the hostname blocklist above still applies in that case.
 */
export async function resolvesToPublicAddress(raw: string): Promise<boolean> {
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  // Bare IP literals never need a lookup.
  if (/^\[?[0-9a-f:.]+\]?$/i.test(host) && /[:.]/.test(host)) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
      return !isBlockedIp(host);
    }
  }
  const query = async (type: "A" | "AAAA") => {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) throw new Error("DoH lookup failed");
    const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return (json.Answer ?? [])
      .filter((a) => a.type === 1 || a.type === 28)
      .map((a) => a.data);
  };
  try {
    const answers = (await Promise.all([query("A"), query("AAAA")])).flat();
    if (answers.length === 0) return true; // nothing to judge; connect will fail anyway
    return !answers.some(isBlockedIp);
  } catch {
    return true; // resolver unavailable — fall back to the hostname blocklist
  }
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
