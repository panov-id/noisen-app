"""
Test: localStorage settings persistence and dark theme default.
Runs against http://localhost:8080/concept.html served from inside Docker.
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8080/concept.html'

def run():
    server = subprocess.Popen(
        ['python', '-m', 'http.server', '8080'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])
            context = browser.new_context()
            page = context.new_page()

            errors = []
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

            # ── Test 1: dark theme by default ────────────────────────────
            page.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.5)
            # dismiss wizard if open (it blocks all pointer events)
            page.evaluate("localStorage.setItem('noisen-wizard-done', '1')")
            page.evaluate("document.getElementById('wizard').style.display = 'none'")
            theme = page.evaluate("document.documentElement.dataset.theme")
            assert theme == 'dark', f"Expected dark theme by default, got: {theme}"
            print('✓ Dark theme by default')

            # ── Test 2: theme persists after reload ───────────────────────
            # switch to light
            page.click('#theme-toggle')
            time.sleep(0.2)
            theme_after_click = page.evaluate("document.documentElement.dataset.theme")
            assert theme_after_click == 'light', f"Expected light after click, got: {theme_after_click}"

            # reload and check
            page.reload(wait_until='domcontentloaded')
            time.sleep(0.5)
            page.evaluate("document.getElementById('wizard').style.display = 'none'")
            theme_after_reload = page.evaluate("document.documentElement.dataset.theme")
            assert theme_after_reload == 'light', f"Theme should persist after reload, got: {theme_after_reload}"
            print('✓ Theme persists after reload')

            # ── Test 3: volume slider persists ────────────────────────────
            page.evaluate("document.getElementById('vol').value = 30")
            page.dispatch_event('#vol', 'input')
            time.sleep(0.2)

            saved = page.evaluate("JSON.parse(localStorage.getItem('noisen-settings') || '{}')")
            assert saved.get('vol') == 30, f"Expected vol=30 in localStorage, got: {saved}"
            print(f'✓ Volume saved to localStorage: {saved}')

            page.reload(wait_until='domcontentloaded')
            time.sleep(0.5)
            page.evaluate("document.getElementById('wizard').style.display = 'none'")
            vol_after_reload = page.evaluate("document.getElementById('vol').valueAsNumber")
            assert vol_after_reload == 30, f"Volume should be 30 after reload, got: {vol_after_reload}"
            print('✓ Volume persists after reload')

            # ── JS errors check ───────────────────────────────────────────
            if errors:
                print(f'\n⚠ JS errors detected:\n' + '\n'.join(errors))
            else:
                print('✓ No JS errors')

            browser.close()
            print('\nAll tests passed.')

    finally:
        server.terminate()

if __name__ == '__main__':
    run()
