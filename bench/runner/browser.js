/**
 * Launches Chromium for measuring. The proxy's certificate is trusted by its
 * public key (see proxy/cert.js). Headless runs use Chromium's new headless
 * mode, which is the full browser, unless a channel such as `chrome` is given.
 */
import { chromium } from 'playwright';

/**
 * @param {{ spki: string, channel?: string, headed?: boolean }} options
 */
export function launch({ spki, channel, headed = false }) {
    return chromium.launch({
        channel: channel || 'chromium',
        headless: !headed,
        args: [
            `--ignore-certificate-errors-spki-list=${spki}`,
            // Keep background work from competing with the page being measured.
            '--disable-background-networking',
            '--disable-component-update',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-renderer-backgrounding',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--no-first-run',
        ],
    });
}
