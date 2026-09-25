/**
 * Small helpers for the scenario's Node servers.
 */
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

const LIMIT = 64 * 1024;

/** @param {import('node:http').IncomingMessage} req */
export async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > LIMIT) throw Object.assign(new Error('Request body too large'), { status: 413 });
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/** @param {import('node:http').IncomingMessage} req */
export async function json(req) {
    try {
        return JSON.parse(await body(req)) ?? {};
    } catch (error) {
        if (error.status) throw error;
        throw Object.assign(new Error('Invalid JSON'), { status: 400 });
    }
}

/** @param {import('node:http').IncomingMessage} req */
export const form = async (req) => new URLSearchParams(await body(req));

/** @param {import('node:http').ServerResponse} res */
export function send(res, status, content, type = 'text/plain; charset=utf-8', headers = {}) {
    res.writeHead(status, { 'content-type': type, ...headers });
    res.end(content);
}

export const sendJson = (res, status, value, headers) => send(res, status, JSON.stringify(value), TYPES['.json'], headers);

/** Redirects after a POST, to a local path only. */
export function seeOther(res, location, headers = {}) {
    const path = typeof location === 'string' && location.startsWith('/') && !location.startsWith('//') ? location : '/';
    res.writeHead(303, { location: path, ...headers });
    res.end();
}

/** The path and query of a same-origin Referer, to return to after a POST. */
export function back(req) {
    try {
        const referer = new URL(req.headers.referer ?? '');
        if (referer.host !== req.headers.host) return '/';
        return referer.pathname + referer.search;
    } catch {
        return '/';
    }
}

/**
 * Serves a file below `root`, or answers 404.
 * @param {import('node:http').ServerResponse} res
 */
export async function file(res, root, path) {
    const resolved = normalize(join(root, decodeURIComponent(path)));
    if (!resolved.startsWith(root.endsWith(sep) ? root : root + sep)) return send(res, 404, 'Not found');
    try {
        const content = await readFile(resolved);
        send(res, 200, content, TYPES[extname(resolved)] ?? 'application/octet-stream');
    } catch {
        send(res, 404, 'Not found');
    }
}
