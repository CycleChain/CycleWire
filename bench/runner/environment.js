/**
 * What results record about the machine, so a reader can tell a laptop run
 * from a CI run, and how fast its CPU was.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';

const require = createRequire(import.meta.url);

function commit() {
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return null;
    }
}

function runner() {
    if (!process.env.GITHUB_ACTIONS) return 'local';
    return process.env.RUNNER_ENVIRONMENT === 'self-hosted' ? 'self-hosted' : 'github-hosted';
}

/** @param {import('playwright').Browser} browser */
export function environment(browser) {
    const playwright = JSON.parse(readFileSync(require.resolve('playwright/package.json'), 'utf8')).version;
    const cpus = os.cpus();
    return {
        runner: runner(),
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        cpu: cpus[0]?.model?.trim() ?? null,
        cores: cpus.length,
        memoryGB: Math.round(os.totalmem() / 2 ** 30),
        loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
        node: process.version,
        browser: `Chrome ${browser.version()}`,
        playwright,
        commit: commit(),
    };
}

/**
 * A CPU speed index: how many times a fixed string-building loop runs per
 * second in a blank page, the idea behind Lighthouse's benchmarkIndex. Higher
 * is faster. The median of three.
 * @param {import('playwright').Browser} browser
 */
export async function cpuIndex(browser) {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        const runs = [];
        for (let i = 0; i < 3; i++) {
            runs.push(await page.evaluate(() => {
                const start = performance.now();
                let iterations = 0;
                while (performance.now() - start < 500) {
                    let text = '';
                    for (let j = 0; j < 10000; j++) text += 'a';
                    if (text.length !== 10000) throw new Error('unreachable');
                    iterations++;
                }
                return Math.round(iterations / ((performance.now() - start) / 1000));
            }));
        }
        return runs.sort((a, b) => a - b)[1];
    } finally {
        await context.close();
    }
}
