"""
Test: font sizes scale correctly with large-text mode.
Verifies that key UI elements in modals and overlays use CSS custom
properties and respond to the data-large attribute on <html>.
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8080/index.html'

LARGE_FS    = 18   # --fs in large mode
LARGE_FS_SM = 15   # --fs-sm
LARGE_FS_XS = 13   # --fs-xs

SMALL_FS    = 14   # --fs in small mode
SMALL_FS_SM = 12   # --fs-sm
SMALL_FS_XS = 10   # --fs-xs

def computed_fs(page, selector):
    return page.evaluate(
        f"parseFloat(getComputedStyle(document.querySelector({selector!r})).fontSize)"
    )

def dismiss_wizard(page):
    page.evaluate("localStorage.setItem('noisen-wizard-done','1')")
    page.evaluate("localStorage.setItem('noisen-settings', JSON.stringify({lastSeenVersion:'9.9'}))")
    page.evaluate("document.getElementById('wizard').style.display='none'")
    page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")
    time.sleep(0.5)

def run():
    server = subprocess.Popen(
        ['python', '-m', 'http.server', '8080'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(1)

    failures = []

    def check(label, actual, expected, tol=1.5):
        if abs(actual - expected) > tol:
            failures.append(f'FAIL {label}: got {actual}px, expected {expected}px')
            print(f'✗ {label}: {actual}px (expected {expected}px)')
        else:
            print(f'✓ {label}: {actual}px')

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = context.new_page()

            errors = []
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

            page.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.8)
            dismiss_wizard(page)

            # ── Verify data-large="1" is set (default) ────────────────
            large_val = page.evaluate("document.documentElement.dataset.large")
            assert large_val == '1', f'Expected data-large="1", got "{large_val}"'
            print('✓ data-large="1" is set by default')

            # ── Topbar elements ────────────────────────────────────────
            check('version-btn', computed_fs(page, '#version-btn'), LARGE_FS_XS)
            check('help-btn',    computed_fs(page, '#help-btn'),    LARGE_FS_SM)

            # ── What's new overlay ─────────────────────────────────────
            page.evaluate("document.getElementById('whatsnew-overlay').classList.add('open')")
            time.sleep(0.2)
            check('whatsnew-title',         computed_fs(page, '#whatsnew-title'),         LARGE_FS_XS)
            check('whatsnew-version-badge', computed_fs(page, '#whatsnew-version-badge'), LARGE_FS_XS)
            check('whatsnew-body text',     computed_fs(page, '#whatsnew-body'),           LARGE_FS_SM)
            page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")

            # ── Nodes overview overlay ─────────────────────────────────
            page.evaluate("document.getElementById('nodes-overlay').classList.add('open')")
            time.sleep(0.2)
            check('nodes-sheet-title', computed_fs(page, '.nodes-sheet-title'), LARGE_FS_XS)
            page.evaluate("document.getElementById('nodes-overlay').classList.remove('open')")

            # ── Presets overlay ────────────────────────────────────────
            page.evaluate("document.getElementById('presets-overlay').classList.add('open')")
            time.sleep(0.2)
            check('presets-header-title', computed_fs(page, '.presets-header-title'), LARGE_FS_XS)
            check('preset-action-btn',    computed_fs(page, '.preset-action-btn'),    LARGE_FS_XS)
            page.evaluate("document.getElementById('presets-overlay').classList.remove('open')")

            # ── Wizard ─────────────────────────────────────────────────
            page.evaluate("document.getElementById('wizard').style.display=''")
            time.sleep(0.2)
            check('wiz-body', computed_fs(page, '.wiz-body'), LARGE_FS_SM)
            check('wiz-next', computed_fs(page, '.wiz-next'), LARGE_FS_XS)
            check('wiz-skip', computed_fs(page, '.wiz-skip'), LARGE_FS_XS)
            page.evaluate("document.getElementById('wizard').style.display='none'")

            # ── Switch to small mode, re-check one overlay ─────────────
            page.evaluate("document.documentElement.dataset.large = '0'")
            time.sleep(0.1)
            page.evaluate("document.getElementById('whatsnew-overlay').classList.add('open')")
            time.sleep(0.1)
            check('whatsnew-title [small mode]', computed_fs(page, '#whatsnew-title'), SMALL_FS_XS)
            check('whatsnew-body [small mode]',  computed_fs(page, '#whatsnew-body'),  SMALL_FS_SM)
            page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")

            # ── JS errors ─────────────────────────────────────────────
            relevant = [e for e in errors if '404' not in e and 'sw.js' not in e]
            if relevant:
                print(f'\n⚠ JS errors:\n' + '\n'.join(relevant))
                failures.append('JS errors present')
            else:
                print('✓ No JS errors')

            browser.close()

    finally:
        server.terminate()

    if failures:
        print(f'\n{len(failures)} test(s) failed:')
        for f in failures:
            print(f'  {f}')
        sys.exit(1)
    else:
        print('\nAll font-size tests passed.')

if __name__ == '__main__':
    run()
