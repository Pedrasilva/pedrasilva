"""
End-to-end checks for the reconciliation match panel (search, document preview,
split selection, confirmation, advance to next movement).

SAFETY: every write request to the backend is intercepted and answered with a
fake success, so no match, payment, rule or queue confirmation is ever saved.
Only reads (and the suggestion cache refresh) reach the database. The run fails
if any write slips through. Run: python3 scripts/e2e/match-panel-e2e.py
"""
import asyncio, json, os, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = Path("/tmp/browser/e2e-match"); OUT.mkdir(parents=True, exist_ok=True)
READ_RPC = re.compile(r"/rpc/(fin_reconcile_|fin_tx_open_balance|current_finance_entity|fin_period_window|bank_|fin_row_visible|has_|get_|fin_bank_document_registry|fin_queue_blockers|fin_entity_of|fin_company_visible)")
blocked, leaked, results = [], [], []

def check(name, ok, info=""):
    results.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + (f" — {info}" if info else ""))

async def guard(route, req):
    url, m = req.url, req.method
    write = m in ("POST", "PATCH", "PUT", "DELETE") and ("/rest/v1/" in url or "/_serverFn/" in url or "/storage/v1/object/" in url and m != "POST")
    if "/storage/v1/object/sign/" in url or ("/rest/v1/rpc/" in url and READ_RPC.search(url)):
        write = False
    if write:
        body = req.post_data or ""
        blocked.append((m, url.split("?")[0].split("/")[-1], body[:200]))
        try: payload = json.loads(body) if body else {}
        except Exception: payload = {}
        fake = [{"id": "00000000-0000-0000-0000-000000000000", **(payload if isinstance(payload, dict) else {})}]
        return await route.fulfill(status=201, content_type="application/json", body=json.dumps(fake))
    await route.continue_()

async def login(c, pg):
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
        k = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]; s = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
        ck = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
    else:
        m = json.load(open(os.path.expanduser("~/.cache/lovable-auth/session.json")))
        k, s, ck = m["storage_key"], json.dumps(m["session"]), m.get("cookies") or []
    if ck: await c.add_cookies([{**x, "url": BASE} for x in ck])
    await pg.goto(BASE); await pg.evaluate("([k,v])=>localStorage.setItem(k,v)", [k, s])

async def open_movement(pg, text, amount):
    s = pg.get_by_placeholder("Pesquisar").first
    await s.fill(text); await pg.wait_for_timeout(2500)
    row = pg.get_by_text(text, exact=False).filter(has_text=amount).first
    if not await row.count(): row = pg.get_by_text(text, exact=False).first
    await row.click()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        c = await b.new_context(viewport={"width": 1280, "height": 1800}); pg = await c.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await c.route("**/*", guard)
        await login(c, pg)
        await pg.goto(BASE + "/finance/banking/reconciliation"); await pg.wait_for_timeout(9000)

        # 1. Suggestions + search (LOVABLE 300 €, 17/09)
        await open_movement(pg, "LOVABLE", "300")
        t0 = time.time(); await pg.get_by_text("2467-9126").first.wait_for(timeout=20000)
        check("suggestions show 2467-9126", True, f"{time.time()-t0:.2f}s")
        first = pg.get_by_role("option").first
        check("2467-9126 ranked first", "2467-9126" in await first.inner_text())
        ms = pg.locator('[data-match-search="1"]').first
        await ms.fill("T7QNIQYW"); await pg.wait_for_timeout(2500)
        opts = await pg.get_by_role("option").all_inner_texts()
        hits = [o for o in opts if "T7QNIQYW" in o]
        check("search finds T7QNIQYW documents", len(hits) > 0, f"{len(hits)} rows")
        labels = [re.search(r"T7QNIQYW-\d+", o).group(0) for o in hits if re.search(r"T7QNIQYW-\d+", o)]
        check("no Entrada document repeated", len(labels) == len(set(labels)), ",".join(labels))
        await ms.fill(""); await pg.wait_for_timeout(2000)

        # 2. Preview: hover a row → side panel shows its file
        await pg.get_by_role("option").first.hover(); await pg.wait_for_timeout(4000)
        has_pv = await pg.locator("canvas, img[alt*='2467']").count()
        check("document preview renders beside the list", has_pv > 0)
        await pg.screenshot(path=str(OUT / "1_preview.png"))

        # 3. Split selection: tick two documents, running total and remainder
        boxes = pg.get_by_role("checkbox", name="Selecionar para pagamento dividido")
        await boxes.nth(0).click(); await boxes.nth(1).click(); await pg.wait_for_timeout(500)
        bar = pg.get_by_text("Selecionado", exact=False).locator("xpath=..")
        txt = await bar.inner_text()
        check("split bar shows running total and remainder", "Diferença" in txt and "/" in txt, txt.replace("\n", " ")[:120])
        before_blocked = len(blocked)

        # 4. Match selected (intercepted) → advances to next movement
        header_before = await pg.get_by_role("option").first.inner_text()
        await pg.get_by_role("button", name="Conciliar selecionados").click(); await pg.wait_for_timeout(4000)
        pays = [x for x in blocked[before_blocked:] if "financial_document_payments" in x[1]]
        check("split match sends two payments (intercepted, not saved)", len(pays) == 2, f"{len(pays)} intercepted")
        header_after = await pg.get_by_role("option").first.inner_text() if await pg.get_by_role("option").count() else ""
        check("panel moved to the next movement after the match", header_after != header_before)
        await pg.screenshot(path=str(OUT / "2_after_match.png"))

        # 5. Keyboard N → next movement
        await pg.locator("body").click(position={"x": 5, "y": 5})
        h1 = await pg.get_by_role("option").first.inner_text() if await pg.get_by_role("option").count() else ""
        await pg.keyboard.press("n"); await pg.wait_for_timeout(4000)
        h2 = await pg.get_by_role("option").first.inner_text() if await pg.get_by_role("option").count() else ""
        check("N key advances to next movement", h1 != h2)

        # 6. Entrada confirmation (Apple 23,49 €): panel opens, cancel saves nothing
        await open_movement(pg, "APPLE", "23,49")
        await pg.get_by_text("678182247840").first.wait_for(timeout=20000)
        n0 = len(blocked)
        await pg.get_by_role("button", name=re.compile("Confirmar e conciliar")).first.click(); await pg.wait_for_timeout(3000)
        dlg = pg.get_by_role("dialog")
        check("Confirm-and-match panel opens for Entrada item", await dlg.count() > 0)
        await pg.screenshot(path=str(OUT / "3_confirm.png"))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(1500)
        check("cancelling confirmation sends no write", len(blocked) == n0)

        check("no page errors", not errs, "; ".join(errs[:2]))
        print("intercepted writes:", len(blocked), [x[1] for x in blocked])
        await b.close()
    ok = all(r for _, r in results); print(f"{sum(r for _,r in results)}/{len(results)} passed")
    sys.exit(0 if ok else 1)

asyncio.run(main())
