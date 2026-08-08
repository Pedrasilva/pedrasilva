/**
 * DocuSign eSignature — server-only client.
 *
 * Auth: JWT Grant (service-integration flow). The integration key is granted
 * `signature impersonation` consent once by a human, after which this module
 * can mint access tokens without any interactive step.
 *
 * Required server secrets (set once, by a human, before go-live):
 *   DOCUSIGN_INTEGRATION_KEY   — the app's Integration Key (client id)
 *   DOCUSIGN_USER_ID           — API Username (GUID) of the impersonated user
 *   DOCUSIGN_ACCOUNT_ID        — API Account ID (GUID)
 *   DOCUSIGN_PRIVATE_KEY       — RSA private key PEM for that app; either
 *                                PKCS#1 (`BEGIN RSA PRIVATE KEY`, DocuSign's
 *                                default download) or PKCS#8 (`BEGIN PRIVATE KEY`)
 *   DOCUSIGN_BASE_URI          — e.g. https://demo.docusign.net/restapi
 *                                or   https://eu.docusign.net/restapi
 *   DOCUSIGN_AUTH_BASE         — account-d.docusign.com (demo) or account.docusign.com
 *   DOCUSIGN_PSA_SIGNER_NAME   — authorised firm signatory (name)
 *   DOCUSIGN_PSA_SIGNER_EMAIL  — authorised firm signatory (email)
 *   DOCUSIGN_CONNECT_HMAC_KEY  — DocuSign Connect HMAC secret (webhook)
 */

export type DocusignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  baseUri: string;
  authBase: string;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function readDocusignConfig(): DocusignConfig {
  const missing: string[] = [];
  const get = (n: string, fallback?: string) => {
    const v = env(n) ?? fallback;
    if (!v) missing.push(n);
    return v ?? "";
  };
  const cfg: DocusignConfig = {
    integrationKey: get("DOCUSIGN_INTEGRATION_KEY"),
    userId: get("DOCUSIGN_USER_ID"),
    accountId: get("DOCUSIGN_ACCOUNT_ID"),
    privateKey: get("DOCUSIGN_PRIVATE_KEY"),
    baseUri: get("DOCUSIGN_BASE_URI", "https://demo.docusign.net/restapi"),
    authBase: get("DOCUSIGN_AUTH_BASE", "account-d.docusign.com"),
  };
  if (missing.length) {
    throw new Error(
      `DocuSign não está configurado — faltam as chaves: ${missing.join(", ")}.`,
    );
  }
  return cfg;
}

export function readPsaSigner(): { name: string; email: string } {
  const name = env("DOCUSIGN_PSA_SIGNER_NAME");
  const email = env("DOCUSIGN_PSA_SIGNER_EMAIL");
  if (!name || !email) {
    throw new Error(
      "Signatário da PSA não configurado — define DOCUSIGN_PSA_SIGNER_NAME e DOCUSIGN_PSA_SIGNER_EMAIL.",
    );
  }
  return { name, email };
}

/* ── JWT (RS256) via WebCrypto ─────────────────────────────────── */

function b64url(bytes: Uint8Array | string): string {
  const bin =
    typeof bytes === "string"
      ? bytes
      : Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeDerLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  const bytes: number[] = [];
  let l = len;
  while (l > 0) {
    bytes.unshift(l & 0xff);
    l = l >>> 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/**
 * Wraps a raw PKCS#1 RSAPrivateKey DER in the PKCS#8 PrivateKeyInfo
 * structure WebCrypto requires. DocuSign's "Generate RSA" download is
 * PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`), not PKCS#8, so this keeps
 * either format working without a manual openssl conversion step.
 */
function pkcs1ToPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  // rsaEncryption AlgorithmIdentifier (OID 1.2.840.113549.1.1.1) + NULL params.
  const algId = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
  const octetString = concatBytes(
    new Uint8Array([0x04]),
    encodeDerLength(pkcs1Der.length),
    pkcs1Der,
  );
  const bodyLen = version.length + algId.length + octetString.length;
  return concatBytes(new Uint8Array([0x30]), encodeDerLength(bodyLen), version, algId, octetString);
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const isPkcs1 = /-----BEGIN RSA PRIVATE KEY-----/.test(pem);
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  const der = isPkcs1 ? pkcs1ToPkcs8(buf) : buf;
  return der.buffer as ArrayBuffer;
}

async function signJwt(cfg: DocusignConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: cfg.integrationKey,
      sub: cfg.userId,
      aud: cfg.authBase,
      iat: now,
      exp: now + 3600,
      scope: "signature impersonation",
    }),
  );
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(cfg.privateKey.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

let cachedToken: { value: string; exp: number } | null = null;

export async function getAccessToken(cfg: DocusignConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedToken.exp - 60) return cachedToken.value;

  const assertion = await signJwt(cfg);
  const res = await fetch(`https://${cfg.authBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    // consent_required means a human must grant impersonation consent once.
    throw new Error(`DocuSign auth ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = JSON.parse(text) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    exp: now + (json.expires_in ?? 3600),
  };
  return json.access_token;
}

async function api(
  cfg: DocusignConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(cfg);
  return fetch(`${cfg.baseUri}/v2.1/accounts/${cfg.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/* ── Envelopes ─────────────────────────────────────────────────── */

export type EnvelopeSigner = { name: string; email: string };

export async function createAndSendEnvelope(args: {
  cfg: DocusignConfig;
  emailSubject: string;
  emailBlurb?: string;
  documentName: string;
  documentBase64: string;
  client: EnvelopeSigner;
  psa: EnvelopeSigner;
}): Promise<string> {
  const { cfg, client, psa } = args;
  const body = {
    emailSubject: args.emailSubject,
    emailBlurb: args.emailBlurb ?? "",
    status: "sent",
    documents: [
      {
        documentBase64: args.documentBase64,
        name: args.documentName,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: [
        {
          email: client.email,
          name: client.name,
          recipientId: "1",
          routingOrder: "1",
          tabs: {
            signHereTabs: [
              { anchorString: "/csig/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6" },
            ],
            dateSignedTabs: [
              { anchorString: "/cdate/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6" },
            ],
          },
        },
        {
          email: psa.email,
          name: psa.name,
          recipientId: "2",
          routingOrder: "2",
          tabs: {
            signHereTabs: [
              { anchorString: "/psig/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6" },
            ],
            dateSignedTabs: [
              { anchorString: "/pdate/", anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6" },
            ],
          },
        },
      ],
    },
  };

  const res = await api(cfg, "/envelopes", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DocuSign envelope ${res.status}: ${text.slice(0, 500)}`);
  const json = JSON.parse(text) as { envelopeId?: string };
  if (!json.envelopeId) throw new Error("DocuSign não devolveu envelopeId.");
  return json.envelopeId;
}

/** Downloads the fully-signed, combined PDF for a completed envelope. */
export async function fetchCompletedDocument(
  cfg: DocusignConfig,
  envelopeId: string,
): Promise<Uint8Array> {
  const token = await getAccessToken(cfg);
  const res = await fetch(
    `${cfg.baseUri}/v2.1/accounts/${cfg.accountId}/envelopes/${envelopeId}/documents/combined`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DocuSign document ${res.status}: ${t.slice(0, 300)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
