// A small static server, because ES modules do not load from file:// URLs.
// Any other static server works as well.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 3000;

createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, path.endsWith('/') || !path ? join(path, 'index.html') : path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` }).end(body);
    } catch {
        res.writeHead(404).end('Not found');
    }
}).listen(port, () => console.log(`http://localhost:${port}/`));
