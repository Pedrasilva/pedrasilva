"""Authenticated disposable-fixture regression. Run before deleting the test fixture.
Never mint a session or create data here: use an explicitly authorized disposable fixture.
"""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    own = os.environ["HR_TEST_COLLABORATOR_ID"]
    expected_pay = float(os.environ["HR_TEST_PAY"])
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        await page.goto("http://localhost:8080")
        minted = json.loads(Path.home().joinpath(".cache/lovable-auth/session.json").read_text())
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [minted["storage_key"], json.dumps(minted["session"])])
        await page.goto("http://localhost:8080")
        result = await page.evaluate("""async own => {
          const {supabase:s}=await import('/src/integrations/supabase/client.ts');
          const read=async t=>{const r=await s.from(t).select('*');if(r.error)throw Error(r.error.message);return r.data;};
          const [costs,pay,leaves,calendar,working]=await Promise.all(['bo_settings','salary_snapshots','vacation_requests','hr_team_leave_calendar','hr_working_day_settings'].map(read));
          return {costs:costs.length,pay:pay.filter(x=>x.collaborator_id===own).map(x=>x.valor_base),otherPay:pay.filter(x=>x.collaborator_id!==own).length,otherLeave:leaves.filter(x=>x.collaborator_id!==own).length,calendar:calendar.length,fields:[...new Set(calendar.flatMap(Object.keys))].sort(),generic:calendar.every(x=>x.tipo==='absent'),working:working.length};
        }""", own)
        assert result["costs"] == 0, "Backoffice costs leaked"
        assert result["otherPay"] == 0, "Another collaborator's pay leaked"
        assert expected_pay in result["pay"], "Own pay missing"
        assert result["otherLeave"] == 0, "Another collaborator's leave details leaked"
        assert result["calendar"] > 0 and result["generic"], "Shared generic calendar missing"
        assert result["fields"] == ["collaborator_id", "data_fim", "data_inicio", "nome", "tipo"], "Calendar exposes additional fields"
        assert result["working"] == 1, "Working-day projection missing"
        print("HR read boundaries PASS")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())