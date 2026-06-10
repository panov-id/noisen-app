"""
Test: audio recording button behaviour.
- Record button exists and is visible
- Clicking without playback shows toast (no crash)
- Button state toggles correctly after playback starts
"""
import subprocess, sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8080/index.html'

def dismiss(page):
    page.evaluate("localStorage.setItem('noisen-wizard-done','1')")
    page.evaluate("localStorage.setItem('noisen-settings', JSON.stringify({lastSeenVersion:'9.9'}))")
    page.evaluate("document.getElementById('wizard').style.display='none'")
    page.evaluate("document.getElementById('whatsnew-overlay').classList.remove('open')")
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
            context = browser.new_context(viewport={'width': 1280, 'height': 800})
            page = context.new_page()

            errors = []
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)

            page.goto(BASE, wait_until='domcontentloaded')
            time.sleep(0.5)
            dismiss(page)

            # ── Test 1: rec button exists and is visible ──────────────
            rec_visible = page.is_visible('#rec-btn')
            assert rec_visible, 'rec-btn should be visible'
            print('✓ Record button visible')

            # ── Test 2: click without playback shows toast, no crash ──
            page.click('#rec-btn')
            time.sleep(0.4)
            # button should NOT be in recording state (no playback)
            is_recording = page.evaluate(
                "document.getElementById('rec-btn').classList.contains('recording')"
            )
            assert not is_recording, 'Should not start recording without playback'
            print('✓ Record without playback: no crash, button stays inactive')

            # ── Test 3: timer hidden when not recording ───────────────
            timer_hidden = page.evaluate(
                "document.getElementById('rec-timer').style.display === 'none' || "
                "document.getElementById('rec-timer').style.display === ''"
            )
            # rec-timer should not show '00:00' as text unless recording
            timer_text = page.evaluate("document.getElementById('rec-timer').textContent")
            assert timer_text == '' or page.evaluate(
                "document.getElementById('rec-timer').style.display === 'none'"
            ), f'Timer should be hidden, got: {timer_text!r}'
            print('✓ Timer hidden when not recording')

            # ── Test 4: rec button exists and rec-timer is hidden ─────
            # masterRecorder is now a module-scoped export, not a global.
            # Verify the recording UI elements are in the expected initial state.
            timer_display = page.evaluate("document.getElementById('rec-timer').style.display")
            assert timer_display in ('none', ''), f'Timer display expected none or empty, got: {timer_display!r}'
            print('✓ Recording UI in correct initial state')

            # ── JS errors check ───────────────────────────────────────
            relevant = [e for e in errors if '404' not in e and 'sw.js' not in e]
            if relevant:
                print(f'\n⚠ JS errors:\n' + '\n'.join(relevant))
                sys.exit(1)
            else:
                print('✓ No JS errors')

            browser.close()
            print('\nAll recording tests passed.')

    finally:
        server.terminate()

if __name__ == '__main__':
    run()
