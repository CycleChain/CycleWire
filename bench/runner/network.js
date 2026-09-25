/**
 * Records a page's requests from the Chrome DevTools Protocol: what was
 * fetched, how many bytes crossed the wire (encodedDataLength, headers
 * included) and how many came out after decompression, and whether it came
 * from the HTTP cache. It also counts requests in flight, for settling.
 */

/** CDP resource types, grouped the way results report them. */
export const CATEGORY = {
    Document: 'document', Script: 'script', Stylesheet: 'css', Image: 'image', Font: 'font',
    XHR: 'data', Fetch: 'data', EventSource: 'data',
};
export const CATEGORIES = ['document', 'script', 'css', 'image', 'font', 'data', 'other'];

/**
 * @typedef {object} Request
 * @property {string} id
 * @property {string} url
 * @property {string} method
 * @property {string} type CDP resource type
 * @property {number} sent wall clock ms
 * @property {number} sentAt CDP timestamp (s) when the request was sent
 * @property {number | null} responseAt CDP timestamp (s) when the response headers arrived
 * @property {number | null} status
 * @property {string | null} mime
 * @property {string | null} protocol
 * @property {boolean} cached
 * @property {number} transfer bytes on the wire
 * @property {number} decoded
 * @property {boolean} done
 * @property {boolean} failed
 */

/** @param {import('playwright').CDPSession} cdp */
export async function recordNetwork(cdp) {
    /** @type {Map<string, Request>} */
    const byId = new Map();
    /** @type {Request[]} */
    const requests = [];
    const log = { requests, inflight: 0, lastActivity: Date.now() };
    const touch = () => { log.lastActivity = Date.now(); };

    const open = (id, request, type, timestamp) => {
        const entry = { id, url: request.url, method: request.method, type: type ?? 'Other', sent: Date.now(), sentAt: timestamp, responseAt: null, status: null, mime: null, protocol: null, cached: false, transfer: 0, decoded: 0, done: false, failed: false };
        byId.set(id, entry);
        requests.push(entry);
        log.inflight++;
        touch();
        return entry;
    };
    const close = (entry) => {
        if (entry.done) return;
        entry.done = true;
        log.inflight--;
        touch();
    };

    cdp.on('Network.requestWillBeSent', (event) => {
        if (!/^https?:/.test(event.request.url)) return;
        const previous = byId.get(event.requestId);
        if (previous && event.redirectResponse) {
            // The same id continues after a redirect: close the hop.
            previous.status = event.redirectResponse.status;
            previous.protocol = event.redirectResponse.protocol ?? null;
            previous.transfer = event.redirectResponse.encodedDataLength ?? 0;
            close(previous);
        }
        open(event.requestId, event.request, event.type, event.timestamp);
    });
    cdp.on('Network.requestServedFromCache', (event) => {
        const entry = byId.get(event.requestId);
        if (entry) entry.cached = true;
    });
    cdp.on('Network.responseReceived', (event) => {
        const entry = byId.get(event.requestId);
        if (!entry) return;
        const { response } = event;
        entry.status = response.status;
        entry.responseAt = event.timestamp;
        entry.mime = response.mimeType ?? null;
        entry.protocol = response.protocol ?? null;
        entry.cached ||= Boolean(response.fromDiskCache || response.fromPrefetchCache || response.fromServiceWorker);
        entry.type = event.type ?? entry.type;
        touch();
    });
    cdp.on('Network.dataReceived', (event) => {
        const entry = byId.get(event.requestId);
        if (entry) entry.decoded += event.dataLength;
        touch();
    });
    cdp.on('Network.loadingFinished', (event) => {
        const entry = byId.get(event.requestId);
        if (!entry) return;
        entry.transfer = event.encodedDataLength;
        close(entry);
    });
    cdp.on('Network.loadingFailed', (event) => {
        const entry = byId.get(event.requestId);
        if (!entry) return;
        entry.failed = true;
        close(entry);
    });

    await cdp.send('Network.enable');
    return log;
}

/** @param {Request} request */
export const categoryOf = (request) => CATEGORY[request.type] ?? 'other';

/**
 * Bytes and counts per category, for the given requests.
 * @param {Request[]} requests
 */
export function bytes(requests) {
    const empty = () => ({ transfer: 0, decoded: 0, count: 0 });
    const out = { total: empty(), ...Object.fromEntries(CATEGORIES.map((category) => [category, empty()])) };
    for (const request of requests) {
        if (request.failed) continue;
        for (const bucket of [out.total, out[categoryOf(request)]]) {
            bucket.transfer += request.transfer;
            bucket.decoded += request.decoded;
            bucket.count++;
        }
    }
    return out;
}
