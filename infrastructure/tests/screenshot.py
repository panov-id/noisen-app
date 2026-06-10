"""Take screenshots of the app at desktop and mobile sizes."""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8080/concept.html'

def dismiss(page):
    # set localStorage immediately after load (before 600ms setTimeout fires)
    page.evaluate("localStorage.setItem('noisen-wizard-done','1')")
    page.evaluate("localStorage.setItem('noisen-settings', JSON.stringify({lastSeenVersion:'1.4'}))")
    page.evaluate("document.getElementById('wizard').style.display='none'")
    page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")
    # wait past the 600ms timeout and close overlay again if it re-opened
    time.sleep(0.7)
    page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")

def run():
    server = subprocess.Popen(
        ['python', '-m', 'http.server', '8080'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])

            # desktop
            ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = ctx.new_page()
            page.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.2)
            dismiss(page)
            page.screenshot(path='/screenshots/desktop.png', full_page=False)
            print('desktop.png saved')

            # mobile portrait (iPhone-like)
            ctx2 = browser.new_context(viewport={'width': 390, 'height': 844})
            page2 = ctx2.new_page()
            page2.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.2)
            dismiss(page2)
            page2.screenshot(path='/screenshots/mobile.png', full_page=False)
            print('mobile.png saved')

            # mobile with node selected — click node that was just created
            # first click creates a node, second click on the node selects it
            page2.evaluate("""() => {
                const canvas = document.getElementById('main');
                const rect = canvas.getBoundingClientRect();
                const cx = rect.width / 2, cy = rect.height * 0.35;
                canvas.dispatchEvent(new PointerEvent('pointerdown', {clientX: cx, clientY: cy, bubbles: true, isPrimary: true}));
                canvas.dispatchEvent(new PointerEvent('pointerup',   {clientX: cx, clientY: cy, bubbles: true, isPrimary: true}));
            }""")
            time.sleep(0.4)
            # click again to select the node
            page2.evaluate("""() => {
                const canvas = document.getElementById('main');
                const rect = canvas.getBoundingClientRect();
                const cx = rect.width / 2, cy = rect.height * 0.35;
                canvas.dispatchEvent(new PointerEvent('pointerdown', {clientX: cx, clientY: cy, bubbles: true, isPrimary: true}));
                canvas.dispatchEvent(new PointerEvent('pointerup',   {clientX: cx, clientY: cy, bubbles: true, isPrimary: true}));
            }""")
            time.sleep(0.4)
            page2.screenshot(path='/screenshots/mobile-node.png', full_page=False)
            print('mobile-node.png saved')

            # topbar close-up on mobile
            page2.screenshot(path='/screenshots/mobile-topbar.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 50})
            print('mobile-topbar.png saved')

            # bottom panel close-up
            page2.screenshot(path='/screenshots/mobile-panel.png', clip={'x': 0, 'y': 600, 'width': 390, 'height': 244})
            print('mobile-panel.png saved')

            browser.close()
    finally:
        server.terminate()

if __name__ == '__main__':
    run()
