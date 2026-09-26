/**
 * The signals suite, in Node. Every scenario runs for every library in a
 * process of its own (signals/child.js, with --expose-gc and
 * NODE_ENV=production), one after another, the libraries in a shuffled order
 * for each scenario. A process that throws, crashes or runs out of time
 * records a failure for that scenario and library, never a time.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarize } from '../../runner/stats.js';
import { prng, shuffle } from '../../scenario/random.js';

const CHILD = fileURLToPath(new URL('child.js', import.meta.url));

/**
 * @param {import('./adapters.js').Library} library @param {import('./scenarios.js').Scenario} scenario
 * @param {{ samples: number, warmup: number, timeoutMs: number }} options
 * @returns {Promise<{ status: 'ok' | 'failed', message?: string, samples?: number[], counts?: Record<string, number> }>}
 */
function runChild(library, scenario, { samples, warmup, timeoutMs }) {
    return new Promise((resolve) => {
        const child = fork(CHILD, [`--library=${library.id}`, `--scenario=${scenario.id}`, `--samples=${samples}`, `--warmup=${warmup}`], {
            execArgv: ['--expose-gc'],
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: ['ignore', 'inherit', 'pipe', 'ipc'],
        });
        /** @type {any} */
        let result = null;
        let stderr = '';
        child.stderr?.on('data', (chunk) => {
            stderr = (stderr + chunk).slice(-4000);
        });
        const timer = setTimeout(() => {
            result ??= { status: 'failed', message: `took longer than ${Math.round(timeoutMs / 1000)} s` };
            child.kill('SIGKILL');
        }, timeoutMs);
        child.on('message', (/** @type {any} */ message) => {
            if (message.type === 'result' || message.type === 'fatal') result ??= message.type === 'fatal' ? { status: 'failed', message: message.message } : message;
        });
        child.on('exit', (code, signal) => {
            clearTimeout(timer);
            const last = stderr.trim().split('\n').slice(-2).join(' ').slice(0, 300);
            resolve(result ?? { status: 'failed', message: `the process exited (${signal ?? `code ${code}`})${last ? `: ${last}` : ''}` });
        });
    });
}

/**
 * @param {object} options
 * @param {import('./adapters.js').Library[]} options.libraries
 * @param {import('./scenarios.js').Scenario[]} options.scenarios
 * @param {number} options.samples
 * @param {number} options.warmup
 * @param {number} options.seed
 * @param {(message: string) => void} options.log
 */
export async function runSignals({ libraries, scenarios, samples, warmup, seed, log }) {
    const random = prng(seed);
    // Generous: the slowest library's slowest scenario takes about a second a sample.
    const timeoutMs = 60_000 + (samples + warmup) * 15_000;
    const results = [];
    for (const scenario of scenarios) {
        const line = [];
        for (const library of shuffle(libraries, random)) {
            const outcome = await runChild(library, scenario, { samples, warmup, timeoutMs });
            const ok = outcome.status === 'ok';
            results.push({
                library: library.id,
                scenario: scenario.id,
                status: outcome.status,
                ...(ok ? {} : { message: outcome.message ?? 'failed' }),
                samples: ok ? (outcome.samples ?? []) : [],
                summary: ok ? summarize(outcome.samples ?? [], { seed }) : null,
                ...(outcome.counts ? { counts: outcome.counts } : {}),
            });
            line.push(`${library.id} ${ok ? `${summarize(outcome.samples ?? []).median} ms` : `FAILED (${outcome.message})`}`);
        }
        log(`signals: ${scenario.id}: ${line.join(', ')}`);
    }
    return results;
}
