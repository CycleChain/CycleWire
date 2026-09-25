import { defineConfig, devices } from '@playwright/test';

const port = 4173;
// PW_CHANNEL=chrome runs the Chromium project on your installed Chrome instead
// of Playwright's download.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
    testDir: 'test/e2e',
    // Builds examples/ for frameworks.spec.js and libraries.spec.js.
    globalSetup: './test/global-setup.js',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'retain-on-failure',
    },
    webServer: {
        command: `node scripts/serve.js --port ${port}`,
        url: `http://127.0.0.1:${port}/health`,
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], channel } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],
});
