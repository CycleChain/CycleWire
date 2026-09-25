/**
 * Input the way a person gives it, through CDP rather than Playwright's
 * actionability checks, so nothing waits for the page before pressing:
 * a touch that rests on the screen for the profile's hold time, or a mouse
 * that arrives on the target, rests, then presses and releases.
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').CDPSession} cdp
 * @param {{ kind: 'touch' | 'mouse', holdMs: number, hoverMs: number }} input
 * @param {{ x: number, y: number }} point viewport coordinates
 */
export async function press(page, cdp, input, { x, y }) {
    if (input.kind === 'touch') {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await sleep(input.holdMs);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        return;
    }
    await page.mouse.move(x, y);
    await sleep(input.hoverMs);
    await page.mouse.down();
    await sleep(input.holdMs);
    await page.mouse.up();
}

/** Types text into the focused element, one key at a time. */
export async function type(page, text, delay) {
    for (const key of text) {
        await page.keyboard.press(key);
        await sleep(delay);
    }
}
