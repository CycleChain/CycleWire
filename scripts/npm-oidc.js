#!/usr/bin/env node
/**
 * Checks npm trusted publishing from a GitHub Actions job the way
 * `npm publish` uses it: asks GitHub for an OIDC token meant for npm and trades
 * it for a short-lived publish token. When that exchange fails, npm only gives
 * the reason in its verbose log, falls back to whatever token .npmrc holds and
 * fails the publish with a misleading E404. This prints the registry's reason
 * instead, with the claims npm compares against the package's trusted
 * publisher settings. The publish token it receives is never printed or used.
 *
 * Needs `permissions: id-token: write`. Exits 1 when the exchange fails.
 *
 *   node scripts/npm-oidc.js                 the library
 *   node scripts/npm-oidc.js <package-dir>   another package, such as packages/create-cyclewire
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/';

/**
 * The registry endpoint that trades an OIDC token for a publish token.
 * @param {string} name
 * @param {string} [registry]
 */
export const exchangeUrl = (name, registry = REGISTRY) =>
    new URL(`-/npm/v1/oidc/token/exchange/package/${name.replace('/', '%2f')}`, registry).href;

/**
 * The payload of a JWT. Not verified: it is only shown.
 * @param {string} jwt
 * @returns {Record<string, any>}
 */
export const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'));

/**
 * @param {{ name: string, env?: Record<string, string | undefined>, fetch?: typeof fetch, registry?: string }} options
 * @returns {Promise<{ ok: boolean, details: string[], message: string }>}
 */
export async function check({ name, env = process.env, fetch = globalThis.fetch, registry = REGISTRY }) {
    const { ACTIONS_ID_TOKEN_REQUEST_URL: requestUrl, ACTIONS_ID_TOKEN_REQUEST_TOKEN: requestToken } = env;
    if (!requestUrl || !requestToken) {
        return { ok: false, details: [], message: 'No OIDC token is available: run this in GitHub Actions, in a job with `permissions: id-token: write`.' };
    }

    const url = new URL(requestUrl);
    url.searchParams.set('audience', `npm:${new URL(registry).hostname}`);
    const issued = await fetch(url, { headers: { accept: 'application/json', authorization: `Bearer ${requestToken}` }, signal: AbortSignal.timeout(30_000) });
    if (!issued.ok) return { ok: false, details: [], message: `GitHub did not issue an OIDC token (HTTP ${issued.status}).` };
    const { value: idToken } = await issued.json();

    const claimed = claims(idToken);
    const details = [
        `repository:  ${claimed.repository}`,
        `workflow:    ${claimed.workflow_ref}`,
        `environment: ${claimed.environment ?? '(none)'}`,
    ];

    const response = await fetch(exchangeUrl(name, registry), {
        method: 'POST',
        headers: { accept: 'application/json', authorization: `Bearer ${idToken}` },
        signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && typeof body.token === 'string') {
        return { ok: true, details, message: `npm accepts trusted publishing of ${name} from this workflow.` };
    }
    const reason = body.message ?? body.error ?? 'no reason given';
    return {
        ok: false,
        details,
        message: `npm refused trusted publishing of ${name} (HTTP ${response.status}): ${reason}. `
            + 'The repository, workflow file and environment above must match the trusted publisher in the package settings on npmjs.com exactly.',
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    // The package in the given directory (packages/create-cyclewire, say), or the library.
    const manifest = process.argv[2] ? pathToFileURL(`${process.argv[2].replace(/\/$/, '')}/package.json`) : new URL('../package.json', import.meta.url);
    const { name } = JSON.parse(await readFile(manifest, 'utf8'));
    const { ok, details, message } = await check({ name });
    for (const line of details) console.log(line);
    console.log(ok ? message : `::error title=Trusted publishing::${message}`);
    if (!ok) process.exit(1);
}
