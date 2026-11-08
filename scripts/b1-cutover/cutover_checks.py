"""B1 cutover live checks (read-only).

Reads figures only after the page has really finished loading:
  1. the page's own loading signal  [data-totals-ready="true"]  (set when every
     totals source has loaded and no data query is fetching),
  2. network idle: zero in-flight data requests (REST / RPC / server functions)
     for a quiet window, measured from request events,
  3. for people expected to see figures: no "—" placeholder left in the totals.
There are no fixed sleeps: every wait is event/condition based. A hard deadline
only turns a page that never settles into a FAIL (it never reads early).

Usage:
  python3 scripts/b1-cutover/cutover_checks.py --sessions /tmp/browser/b1p \
      --out docs/project-access-phase-b1/<run> [--preview] [--only rita,patricia]
Sessions are <who>.json files minted outside the project; never commit them.
--preview sends the caller's own x-psa-b1-preview marker (admin-only after 0267).
"""
import argparse, asyncio, json, re, time
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
MINT = "da46fd5d-309f-4f9f-b0d6-107cd61dc907"
URAL = "32810ca9-3c97-4eee-a6b7-a8385a19c972"
DATA_RE = re.compile(r"(supabase\.co/(rest|storage)/v1/|/_serverFn/)")
QUIET_MS = 1500          # network-idle definition (no in-flight data request)
DEADLINE_S = 180         # failure deadline only; values are never read before ready

# Expectations. "figures": Mint totals must equal Luis (Rita=Luis rule).
MINT_EXPECT = {"budget": "1812 € / 30 980 €", "profit": "1274 €", "margin": "41%",
               "revenue": "3086 €"}
RUNS = [
    ("rita", f"/projects/{MINT}", "rita-mint-overview", "figures"),
    ("rita", f"/projects/{MINT}?tab=insights", "rita-mint-insights", "figures"),
    ("rita", f"/projects/{URAL}", "rita-uralchem-overview", "none"),
    ("rita", "/projects/gantt", "rita-global-gantt", "gantt"),
    ("patricia", f"/projects/{MINT}", "patricia-mint-overview", "none"),
    ("patricia", f"/projects/{URAL}", "patricia-uralchem-overview", "none"),
    ("patricia", "/projects/gantt", "patricia-global-gantt", "none"),
    ("tatiana", f"/projects/{MINT}", "tatiana-mint-overview", "figures"),
    ("tatiana", f"/projects/{MINT}?tab=insights", "tatiana-mint-insights", "figures"),
    ("tatiana", f"/projects/{URAL}", "tatiana-uralchem-overview", "any-figures"),
    ("tatiana", "/projects/gantt", "tatiana-global-gantt", "gantt"),
]

# Placeholder test for allowed totals: the totals blocks must not contain "—".
TOTALS_JS = r"""
(kind) => {
  const root = document.querySelector('[data-totals-ready]');
  if (!root || root.getAttribute('data-totals-ready') !== 'true') return false;
  if (kind !== 'figures') return true;
  const t = document.body.innerText;
  const grab = (re) => { const m = t.match(re); return m ? m[1] : null; };
  const budget = grab(/(?:USO DO ORÇAMENTO|BUDGET USAGE)\s*\n([^\n]+)/i);
  const profit = grab(/\n(?:LUCRO|PROFIT)\s*\n([^\n]+\n[^\n]+)/i);
  if (!budget || !profit) return false;
  if (/—/.test(budget) || /—/.test(profit)) return false;
  if (location.search.includes('insights')) {
    const rev = grab(/(?:Receita real:|Actual Revenue:)\s*([^\n(]+)/i);
    const mar = grab(/(?:MARGEM ATUAL:|CURRENT MARGIN:)\s*\n([^\n]+\n[^\n]+)/i);
    if (!rev || !mar || /—/.test(rev) || /—/.test(mar)) return false;
  }
  return true;
}
"""


def norm(text: str) -> str:
    # Locale formatting uses no-break/narrow spaces; compare on plain spaces.
    return text.replace("\u00a0", " ").replace("\u202f", " ")


def parse(text: str) -> dict:
    text = norm(text)
    def g(rx, flags=re.I):
        m = re.search(rx, text, flags)
        return m.group(1).strip() if m else None
    profit = g(r"\n(?:LUCRO|PROFIT)\s*\n([^\n]+\n[^\n]+)")
    p, mg = (profit.split("\n") + [None])[:2] if profit else (None, None)
    return {
        "client": g(r"\n(?:CLIENTE|CLIENT)\n([^\n]+)", 0),
        "budget": g(r"(?:USO DO ORÇAMENTO|BUDGET USAGE)\s*\n([^\n]+)"),
        "profit": p and p.strip(), "margin": mg and mg.strip(),
        "revenue": g(r"(?:Receita real:|Actual Revenue:)\s*([^\n(]+)"),
        "current_margin": g(r"(?:MARGEM ATUAL:|CURRENT MARGIN:)\s*\n([^\n]+\n[^\n]+)"),
        "euro_count": text.count("€"),
        "zero_euro": len(re.findall(r"(?<![\d.,])0\s?€|€\s?0(?![\d.,])", text)),
    }


def judge(kind: str, v: dict, text: str) -> list[str]:
    text = norm(text)
    fails = []
    if kind == "figures":
        for k in ("budget", "profit", "margin"):
            if v[k] != MINT_EXPECT[k]:
                fails.append(f"{k}={v[k]!r} expected {MINT_EXPECT[k]!r}")
        if v["revenue"] is not None and v["revenue"] != MINT_EXPECT["revenue"]:
            fails.append(f"revenue={v['revenue']!r} expected {MINT_EXPECT['revenue']!r}")
        if "NaN" in text:
            fails.append("NaN visible")
    elif kind == "none":
        if v["euro_count"]:
            fails.append(f"{v['euro_count']} currency values visible")
    elif kind == "any-figures":
        if not v["euro_count"]:
            fails.append("no figures visible for a global-capability user")
    elif kind == "gantt":
        if "NaN" in text:
            fails.append("NaN visible")
    return fails


async def one(pw, args, who, path, name, kind):
    S = json.load(open(Path(args.sessions) / f"{who}.json"))
    browser = await pw.chromium.launch(headless=True)
    ctx = await browser.new_context(viewport={"width": 1400, "height": 1800})
    page = await ctx.new_page()
    inflight: set = set()
    last_change = [time.monotonic()]

    def track(req, add):
        if DATA_RE.search(req.url):
            (inflight.add if add else inflight.discard)(req)
            last_change[0] = time.monotonic()
    page.on("request", lambda r: track(r, True))
    page.on("requestfinished", lambda r: track(r, False))
    page.on("requestfailed", lambda r: track(r, False))

    async def route(rt, req):
        hd = dict(req.headers)
        if args.preview:
            hd["x-psa-b1-preview"] = "on"
        await rt.continue_(headers=hd)
    await page.route(DATA_RE, route)

    await page.goto(BASE)
    await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [S["storage_key"], json.dumps(S["session"])])
    t0 = time.monotonic()
    await page.goto(BASE + path, wait_until="domcontentloaded")
    status, reason = "PASS", []
    try:
        # (1)+(3) page signal and no placeholders; (2) network quiet window.
        while True:
            remaining = DEADLINE_S - (time.monotonic() - t0)
            if remaining <= 0:
                raise TimeoutError("page never settled")
            await page.wait_for_function(TOTALS_JS, arg=kind, timeout=remaining * 1000)
            # network idle: wait for the next request event or the quiet window, whichever first
            while inflight or (time.monotonic() - last_change[0]) * 1000 < QUIET_MS:
                if time.monotonic() - t0 > DEADLINE_S:
                    raise TimeoutError("network never idle")
                quiet_left = QUIET_MS - (time.monotonic() - last_change[0]) * 1000
                try:
                    await page.wait_for_event("request", timeout=max(50, quiet_left) if not inflight else 1000)
                except Exception:
                    pass
            # re-confirm the page signal after the quiet window (nothing refetched)
            if await page.evaluate(TOTALS_JS, kind) and not inflight:
                break
    except Exception as e:  # noqa: BLE001
        status, reason = "FAIL", [f"not settled: {e}"]
    settled = round(time.monotonic() - t0, 1)
    text = await page.inner_text("body")
    gate = await page.evaluate("""async () => {
      try { const m = await import('/src/integrations/supabase/client.ts');
        const r = await m.supabase.rpc('pm_project_b1_gate_state'); return r.data ?? r.error?.message; }
      catch (e) { return String(e) } }""")
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(out / f"{name}.png"))
    (out / f"{name}.txt").write_text(text)
    values = parse(text)
    if status == "PASS":
        reason = judge(kind, values, text)
        status = "PASS" if not reason else "FAIL"
    await browser.close()
    return {"who": who, "page": name, "expect": kind, "status": status, "reasons": reason,
            "settled_s": settled, "gate_from_page_session": gate, "values": values,
            "preview_marker_sent": args.preview}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sessions", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    results = []
    async with async_playwright() as pw:
        for who, path, name, kind in RUNS:
            if only and who not in only:
                continue
            r = await one(pw, args, who, path, name, kind)
            results.append(r)
            print(f"{r['status']:4} {name:28} settled {r['settled_s']:>5}s  {json.dumps(r['values'], ensure_ascii=False)}  {r['reasons']}")
    Path(args.out, "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))


asyncio.run(main())
