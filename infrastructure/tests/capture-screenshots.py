"""
Capture UX screenshots: desktop and mobile, global panel and node panel with orbits.
Output goes to infrastructure/screenshots/.
"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright

BASE    = 'http://localhost:8282/index.html'
OUT_DIR = '/screenshots'

def dismiss(page):
    page.evaluate("localStorage.setItem('noisen-wizard-done','1')")
    page.evaluate("localStorage.setItem('noisen-settings', JSON.stringify({lastSeenVersion:'9.9'}))")
    page.reload(wait_until='domcontentloaded')
    time.sleep(0.8)
    # close any overlays that may have appeared
    for selector in ['#whatsnew-overlay', '#wizard']:
        try:
            el = page.locator(selector)
            if el.count() > 0:
                page.evaluate(f"document.getElementById('{selector[1:]}').style.display='none'")
        except Exception:
            pass
    time.sleep(0.2)

def add_node_with_orbit(page):
    canvas = page.locator('#main')
    box = canvas.bounding_box()
    mid_x = box['width'] / 2
    mid_y = box['height'] / 2 - 60
    # Click canvas to create a node
    page.mouse.click(box['x'] + mid_x, box['y'] + mid_y)
    time.sleep(0.4)
    # Click again to open node panel
    page.mouse.click(box['x'] + mid_x, box['y'] + mid_y)
    time.sleep(0.5)
    # Add an orbit via the + Add button
    add_btn = page.locator('.orbit-add-btn')
    if add_btn.count() > 0:
        add_btn.first.click()
        time.sleep(0.3)

def run():
    server = subprocess.Popen(
        ['python', '-m', 'http.server', '8282'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])

            # ── Desktop: global view ───────────────────────────────────
            ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = ctx.new_page()
            page.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.5)
            dismiss(page)
            page.screenshot(path=f'{OUT_DIR}/desktop.png')
            print('✓ desktop.png')

            # ── Desktop: node panel ────────────────────────────────────
            add_node_with_orbit(page)
            page.screenshot(path=f'{OUT_DIR}/desktop-node-panel.png')
            print('✓ desktop-node-panel.png')
            ctx.close()

            # ── Mobile: global view ────────────────────────────────────
            ctx2 = browser.new_context(
                viewport={'width': 390, 'height': 844},
                has_touch=True,
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
            )
            page2 = ctx2.new_page()
            page2.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.5)
            dismiss(page2)
            page2.screenshot(path=f'{OUT_DIR}/mobile.png')
            print('✓ mobile.png')

            # ── Mobile: node panel ─────────────────────────────────────
            add_node_with_orbit(page2)
            page2.screenshot(path=f'{OUT_DIR}/mobile-node-panel.png')
            print('✓ mobile-node-panel.png')
            ctx2.close()

            browser.close()

    finally:
        server.terminate()

    print('\nAll screenshots saved.')

if __name__ == '__main__':
    run()
