import { expect, test } from '@playwright/test';

// examples/dist/ as the live demos serve it: an index page linking to every
// example, each with a way back.
const EXAMPLES = ['react', 'vue', 'svelte', 'libraries'];

test('the examples index links to every example', async ({ page }) => {
    await page.goto('/examples/');
    const links = await page.locator('main h2 a').evaluateAll((anchors) => anchors.map((anchor) => new URL(anchor.href).pathname));
    expect(links).toEqual(EXAMPLES.map((name) => `/examples/${name}/`));
});

for (const name of EXAMPLES) {
    test(`the ${name} example links back to the index`, async ({ page }) => {
        await page.goto(`/examples/${name}/`);
        await expect(page.locator('h1')).toContainText('CycleWire');
        await page.getByRole('link', { name: 'All examples' }).click();
        await expect(page).toHaveURL(/\/examples\/$/);
    });
}
