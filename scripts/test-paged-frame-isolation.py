"""Regression: real Paged.js transforms print rules only inside its own realm.
Run with python3 scripts/test-paged-frame-isolation.py.
No app authentication or database access.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

async def main():
    runtime = Path('node_modules/pagedjs/dist/paged.js').read_text()
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 1800})
        await page.set_content('<nav id="chrome">PSA</nav><iframe id="pages"></iframe>')
        result = await page.evaluate('''async (runtime) => {
            const frame = document.querySelector('iframe');
            const doc = frame.contentDocument;
            doc.open(); doc.write('<html><head></head><body><main></main></body></html>'); doc.close();
            const script = doc.createElement('script'); script.textContent = runtime; doc.head.append(script);
            const source = doc.createElement('div'); source.innerHTML = '<article data-proposal-block-id="one">Hotel</article><article style="break-before:page" data-proposal-block-id="two">Chiado</article>';
            const engine = new frame.contentWindow.Paged.Previewer();
            const result = await engine.preview(source, [{'test.css':'@page {size:A4; margin:20mm} @media print {nav{display:none!important}}'}], doc.querySelector('main'));
            engine.chunker.pages.forEach(p=>p.removeListeners());
            return {total:result.total, first:Array.from(doc.querySelectorAll('.pagedjs_page')).map(p=>p.querySelector('[data-proposal-block-id]').dataset.proposalBlockId), parentStyles:document.querySelectorAll('[data-pagedjs-inserted-styles]').length, chrome:getComputedStyle(document.querySelector('nav')).display};
        }''', runtime)
        assert result['total'] == 2, result
        assert result['first'] == ['one', 'two'], result
        assert result['parentStyles'] == 0, result
        assert result['chrome'] != 'none', result
        await page.get_by_role('navigation').wait_for(state='visible')
        print('PASS: iframe realm, two pages, first-block parity, no parent styles, app chrome visible')
        await browser.close()

asyncio.run(main())