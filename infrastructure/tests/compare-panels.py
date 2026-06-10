"""Screenshot synth node panel vs drum node panel from dist/ build."""
import subprocess, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:19900'

def dismiss(page):
    page.evaluate("localStorage.setItem('noisen-wizard-done','1')")
    page.evaluate("localStorage.setItem('noisen-settings', JSON.stringify({lastSeenVersion:'3.0'}))")
    page.evaluate("document.getElementById('wizard').style.display='none'")
    page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")
    time.sleep(0.4)
    page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")

def click_canvas(page, x, y):
    page.evaluate(f"""() => {{
        const c = document.getElementById('main');
        c.dispatchEvent(new PointerEvent('pointerdown', {{clientX:{x},clientY:{y},bubbles:true,isPrimary:true}}));
        c.dispatchEvent(new PointerEvent('pointerup',   {{clientX:{x},clientY:{y},bubbles:true,isPrimary:true}}));
    }}""")
    time.sleep(0.5)

def run():
    server = subprocess.Popen(
        ['python3', '-m', 'http.server', '19900', '--directory', '/dist'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])
            viewport = {'width': 390, 'height': 844}

            # synth node panel
            ctx = browser.new_context(viewport=viewport)
            page = ctx.new_page()
            page.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.3)
            dismiss(page)
            click_canvas(page, 195, 380)  # create node
            click_canvas(page, 195, 380)  # select node (open panel)
            page.screenshot(path='/screenshots/panel-synth.png')
            print('panel-synth.png saved')
            ctx.close()

            # drum node panel
            ctx2 = browser.new_context(viewport=viewport)
            page2 = ctx2.new_page()
            page2.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.3)
            dismiss(page2)
            page2.click('#beat-mode-btn')
            time.sleep(0.3)
            click_canvas(page2, 195, 380)  # create drum node (panel opens immediately)
            page2.screenshot(path='/screenshots/panel-drum.png')
            print('panel-drum.png saved')

            # drum steps tab
            page2.click('.node-tab[data-tab="envelope"]')
            time.sleep(0.3)
            page2.screenshot(path='/screenshots/panel-drum-steps.png')
            print('panel-drum-steps.png saved')

            # drum orbits tab
            page2.click('.node-tab[data-tab="orbits"]')
            time.sleep(0.3)
            page2.screenshot(path='/screenshots/panel-drum-orbits.png')
            print('panel-drum-orbits.png saved')

            ctx2.close()

            browser.close()
    finally:
        server.terminate()

if __name__ == '__main__':
    run()
