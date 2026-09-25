import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check, claims, exchangeUrl } from '../../scripts/npm-oidc.js';

const jwt = (payload) => ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');
const ID_TOKEN = jwt({ repository: 'CycleChain/CycleWire', workflow_ref: 'CycleChain/CycleWire/.github/workflows/release.yml@refs/tags/v1.0.1' });
const ENV = { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example/request?api-version=2.0', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token' };

/** A fetch that answers the GitHub token request, then the npm exchange with `exchange`. */
function stub(exchange) {
    const calls = [];
    const fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        const [status, body] = calls.length === 1 ? [200, { value: ID_TOKEN }] : exchange;
        return new Response(JSON.stringify(body), { status });
    };
    return { calls, fetch: /** @type {typeof globalThis.fetch} */ (fetch) };
}

test('the exchange endpoint escapes scoped names', () => {
    assert.equal(exchangeUrl('cyclewire'), 'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/cyclewire');
    assert.equal(exchangeUrl('@cyclechain/wire'), 'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@cyclechain%2fwire');
});

test('reads the claims of a token', () => {
    assert.equal(claims(ID_TOKEN).repository, 'CycleChain/CycleWire');
});

test('asks GitHub for a token meant for npm and trades it without showing the result', async () => {
    const { calls, fetch } = stub([200, { token: 'npm_secret' }]);
    const result = await check({ name: 'cyclewire', env: ENV, fetch });
    assert.equal(result.ok, true);
    assert.equal(new URL(calls[0].url).searchParams.get('audience'), 'npm:registry.npmjs.org');
    assert.equal(calls[0].init.headers.authorization, 'Bearer request-token');
    assert.equal(calls[1].init.method, 'POST');
    assert.equal(calls[1].init.headers.authorization, `Bearer ${ID_TOKEN}`);
    assert.ok(result.details.some((line) => line.includes('CycleChain/CycleWire/.github/workflows/release.yml')));
    assert.ok(!JSON.stringify(result).includes('npm_secret'));
});

test('reports the reason npm gives for refusing', async () => {
    const { fetch } = stub([404, { message: 'no matching trusted publisher' }]);
    const result = await check({ name: 'cyclewire', env: ENV, fetch });
    assert.equal(result.ok, false);
    assert.match(result.message, /HTTP 404\): no matching trusted publisher/);
    assert.ok(result.details.includes('environment: (none)'));
});

test('explains a job without id-token permission', async () => {
    const result = await check({ name: 'cyclewire', env: {}, fetch: stub([200, {}]).fetch });
    assert.equal(result.ok, false);
    assert.match(result.message, /id-token: write/);
});
