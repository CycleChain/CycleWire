/**
 * A self-signed certificate for https://localhost, made with the openssl CLI
 * and kept in .cache/certs for 30 days. Chrome is started with
 * --ignore-certificate-errors-spki-list=<spki>, which makes it trust exactly
 * this key: unlike ignoring certificate errors, the page then counts as a
 * normal secure origin, so the HTTP cache and HTTP/2 behave as in production.
 */
import { execFileSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CERTS = fileURLToPath(new URL('../.cache/certs/', import.meta.url));
const DAY = 24 * 60 * 60 * 1000;

function usable(path) {
    try {
        return new Date(new X509Certificate(readFileSync(path)).validTo).getTime() - Date.now() > DAY;
    } catch {
        return false;
    }
}

/** @returns {{ key: Buffer, cert: Buffer, spki: string }} */
export function certificate() {
    const keyPath = join(CERTS, 'key.pem');
    const certPath = join(CERTS, 'cert.pem');
    if (!usable(certPath)) {
        mkdirSync(CERTS, { recursive: true });
        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
            '-keyout', keyPath, '-out', certPath, '-days', '30',
            '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
        ], { stdio: 'pipe' });
    }
    const cert = readFileSync(certPath);
    const der = new X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' });
    return { key: readFileSync(keyPath), cert, spki: createHash('sha256').update(der).digest('base64') };
}
