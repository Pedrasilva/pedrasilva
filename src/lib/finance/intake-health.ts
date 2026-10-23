/**
 * Wraps an intake hook handler (docs@, Drive, ideas@) so every authorised run is
 * recorded and checked for alerts. Unauthorised (401) calls are never recorded.
 * Recording never changes the hook's response; failures to record are logged only.
 */
export type IntakeSource = "docs" | "drive" | "ideas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (ctx: any) => Promise<Response>;

export function itemsFound(source: IntakeSource, body: Record<string, unknown>): number {
  const n = (k: string) => (typeof body[k] === "number" ? (body[k] as number) : 0);
  if (source === "docs") return n("queued") + n("mt940Imported");
  if (source === "drive") return n("queued");
  return n("created") + n("answered");
}

export function withIntakeHealth(source: IntakeSource, handler: Handler): Handler {
  return async (ctx) => {
    let res: Response;
    try {
      res = await handler(ctx);
    } catch (err) {
      await record(source, false, 0, err instanceof Error ? err.message : String(err));
      throw err;
    }
    if (res.status === 401) return res;
    let ok = res.ok;
    let items = 0;
    let error: string | null = null;
    try {
      const text = await res.clone().text();
      try {
        const body = JSON.parse(text) as Record<string, unknown>;
        if (body.ok === false) ok = false;
        items = itemsFound(source, body);
        if (!ok) error = String(body.error ?? `HTTP ${res.status}`);
      } catch {
        if (!ok) error = text.slice(0, 300) || `HTTP ${res.status}`;
      }
    } catch {
      /* unreadable body: keep status-based outcome */
    }
    await record(source, ok, items, error);
    return res;
  };
}

async function record(source: IntakeSource, ok: boolean, items: number, error: string | null) {
  try {
    const { recordIntakeRun } = await import("./intake-health.server");
    await recordIntakeRun(source, ok, items, error);
  } catch (e) {
    console.error(`[intake-health] could not record ${source} run`, e);
  }
}
